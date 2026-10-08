-- Gateway-only registry and durable leases. No browser/worker database access.
create table public.build_workers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  credential_hash text not null unique check (credential_hash ~ '^[a-f0-9]{64}$'),
  target text not null check (target in ('desktop', 'web', 'android', 'macos')),
  software_release text not null check (length(software_release) between 1 and 64),
  recipe_version text not null check (length(recipe_version) between 1 and 32),
  toolchain_sha256 text check (toolchain_sha256 ~ '^[a-f0-9]{64}$'),
  max_assignments integer not null default 1 check (max_assignments between 1 and 16),
  disabled boolean not null default false,
  draining boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  check (target <> 'macos' or toolchain_sha256 is not null)
);

create table public.worker_assignments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.build_workers(id) on delete restrict,
  build_id uuid not null references public.builds(id) on delete cascade,
  state text not null default 'active' check (state in ('active', 'expired', 'released')),
  lease_until timestamptz not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check ((state = 'active') = (ended_at is null))
);
create unique index worker_assignments_active_build_idx
  on public.worker_assignments(build_id) where state = 'active';
create index worker_assignments_capacity_idx
  on public.worker_assignments(worker_id, lease_until) where state = 'active';
create index worker_assignments_build_idx on public.worker_assignments(build_id);
create index worker_assignments_worker_idx on public.worker_assignments(worker_id);

alter table public.build_workers enable row level security;
alter table public.worker_assignments enable row level security;
revoke all on public.build_workers, public.worker_assignments from public, anon, authenticated;
grant select, insert, update, delete on public.build_workers, public.worker_assignments to service_role;

-- Lock order everywhere: worker, build, assignment. The worker lock serializes
-- capacity checks; the build lock serializes competing assignments/replacements.
create function public.claim_worker_assignment(
  p_worker_id uuid, p_credential_hash text, p_build_id uuid, p_config_hash text,
  p_release text, p_recipe_version text, p_target text, p_toolchain_sha256 text,
  p_lease_seconds integer default 90
) returns table(id uuid, build_id uuid, worker_id uuid, lease_until timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare
  worker public.build_workers%rowtype;
  build public.builds%rowtype;
  received_at timestamptz;
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 300 then
    raise exception 'Invalid worker lease duration';
  end if;
  select w.* into worker from public.build_workers w where w.id = p_worker_id for update;
  if not found or worker.disabled or worker.draining
    or worker.credential_hash is distinct from p_credential_hash
    or worker.software_release is distinct from p_release
    or worker.recipe_version is distinct from p_recipe_version
    or worker.target is distinct from p_target
    or worker.toolchain_sha256 is distinct from p_toolchain_sha256 then return; end if;

  select b.* into build from public.builds b where b.id = p_build_id for update;
  if not found or build.status in ('complete', 'failed')
    or build.config_hash is distinct from p_config_hash
    or (case build.config->>'platform'
      when 'linux' then 'desktop' when 'windows' then 'desktop'
      when 'web' then 'web' when 'android' then 'android' when 'macos' then 'macos'
      else null end) is distinct from worker.target then return; end if;

  received_at := clock_timestamp();
  update public.worker_assignments a set state = 'expired', ended_at = received_at
    where a.build_id = p_build_id and a.state = 'active' and a.lease_until <= received_at;
  if exists(select 1 from public.worker_assignments a where a.build_id = p_build_id and a.state = 'active')
    or (select count(*) from public.worker_assignments a
      where a.worker_id = p_worker_id and a.state = 'active' and a.lease_until > received_at) >= worker.max_assignments
    then return; end if;

  update public.build_workers set last_seen_at = received_at where public.build_workers.id = p_worker_id;
  update public.builds set status = 'preparing_source', stage = 'Assigned to worker', progress = 0,
    heartbeat_at = received_at, stage_started_at = received_at,
    started_at = coalesce(started_at, received_at), error = null, completed_at = null
    where public.builds.id = p_build_id;
  return query insert into public.worker_assignments as a(worker_id, build_id, lease_until)
    values (p_worker_id, p_build_id, received_at + make_interval(secs => p_lease_seconds))
    returning a.id, a.build_id, a.worker_id, a.lease_until;
end;
$$;

create function public.renew_worker_assignment(
  p_worker_id uuid, p_credential_hash text, p_assignment_id uuid, p_lease_seconds integer default 90
) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  worker public.build_workers%rowtype;
  assignment public.worker_assignments%rowtype;
  build public.builds%rowtype;
  received_at timestamptz;
  renewed_until timestamptz;
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 300 then
    raise exception 'Invalid worker lease duration';
  end if;
  select w.* into worker from public.build_workers w where w.id = p_worker_id for update;
  if not found or worker.disabled or worker.credential_hash is distinct from p_credential_hash then return null; end if;
  select a.* into assignment from public.worker_assignments a
    where a.id = p_assignment_id and a.worker_id = p_worker_id;
  if not found then return null; end if;
  select b.* into build from public.builds b where b.id = assignment.build_id for update;
  if not found or build.status in ('complete', 'failed') then return null; end if;
  select a.* into assignment from public.worker_assignments a where a.id = p_assignment_id for update;
  received_at := clock_timestamp();
  if assignment.state <> 'active' or assignment.lease_until <= received_at then return null; end if;
  renewed_until := received_at + make_interval(secs => p_lease_seconds);
  update public.worker_assignments set lease_until = renewed_until where id = p_assignment_id;
  update public.build_workers set last_seen_at = received_at where id = p_worker_id;
  update public.builds set heartbeat_at = received_at where id = assignment.build_id;
  return renewed_until;
end;
$$;

-- Release only relinquishes ownership. It cannot declare success or select an
-- artifact; final publication will need a separate atomic completion function.
create function public.release_worker_assignment(p_worker_id uuid, p_credential_hash text, p_assignment_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  worker public.build_workers%rowtype;
  assignment public.worker_assignments%rowtype;
begin
  select w.* into worker from public.build_workers w where w.id = p_worker_id for update;
  if not found or worker.disabled or worker.credential_hash is distinct from p_credential_hash then return false; end if;
  select a.* into assignment from public.worker_assignments a
    where a.id = p_assignment_id and a.worker_id = p_worker_id;
  if not found then return false; end if;
  perform 1 from public.builds b where b.id = assignment.build_id for update;
  update public.worker_assignments a set state = 'released', ended_at = clock_timestamp()
    where a.id = p_assignment_id and a.state = 'active' and a.lease_until > clock_timestamp();
  return found;
end;
$$;

revoke all on function public.claim_worker_assignment(uuid,text,uuid,text,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.renew_worker_assignment(uuid,text,uuid,integer) from public, anon, authenticated;
revoke all on function public.release_worker_assignment(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.claim_worker_assignment(uuid,text,uuid,text,text,text,text,text,integer) to service_role;
grant execute on function public.renew_worker_assignment(uuid,text,uuid,integer) to service_role;
grant execute on function public.release_worker_assignment(uuid,text,uuid) to service_role;
