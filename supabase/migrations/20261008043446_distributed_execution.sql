-- New attempts start fresh diagnostics under the same atomic ownership lock.
create or replace function public.claim_worker_assignment(
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
    started_at = coalesce(started_at, received_at), error = null, completed_at = null,
    log_tail = null, last_output_at = null, output_bytes = 0, performance_metrics = null
    where public.builds.id = p_build_id;
  return query insert into public.worker_assignments as a(worker_id, build_id, lease_until)
    values (p_worker_id, p_build_id, received_at + make_interval(secs => p_lease_seconds))
    returning a.id, a.build_id, a.worker_id, a.lease_until;
end;
$$;

alter table public.worker_assignments drop constraint worker_assignments_state_check;
alter table public.worker_assignments add constraint worker_assignments_state_check
  check (state in ('active','expired','released','completed'));

create table public.worker_uploads (
  id uuid primary key,
  assignment_id uuid not null references public.worker_assignments(id) on delete cascade,
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes between 1 and 536870912),
  state text not null default 'pending' check (state in ('pending','published','abandoned')),
  expires_at timestamptz not null default (now()+interval '10 minutes'),
  created_at timestamptz not null default now()
);
create index worker_uploads_assignment_idx on public.worker_uploads(assignment_id);
create index worker_uploads_pending_idx on public.worker_uploads(expires_at) where state='pending';
alter table public.worker_uploads enable row level security;
revoke all on public.worker_uploads from public, anon, authenticated;
grant select,insert,update,delete on public.worker_uploads to service_role;

-- Every remote mutation uses the same lock order: worker -> build -> assignment.
create function public.lock_worker_assignment(p_worker_id uuid,p_hash text,p_assignment_id uuid,p_completed boolean default false)
returns setof public.worker_assignments language plpgsql security invoker set search_path='' as $$
declare w public.build_workers%rowtype; a public.worker_assignments%rowtype; b public.builds%rowtype;
begin
  select * into w from public.build_workers where id=p_worker_id for update;
  if not found or w.disabled or w.credential_hash is distinct from p_hash then return; end if;
  select * into a from public.worker_assignments where id=p_assignment_id and worker_id=p_worker_id;
  if not found then return; end if;
  select * into b from public.builds where id=a.build_id for update;
  if not found then return; end if;
  select * into a from public.worker_assignments where id=p_assignment_id for update;
  if p_completed and a.state='completed' and b.status='complete' then return next a; return; end if;
  if a.state<>'active' or a.lease_until<=clock_timestamp() or b.status in ('complete','failed') then return; end if;
  return next a;
end; $$;

create function public.heartbeat_worker_build(p_worker_id uuid,p_hash text,p_assignment_id uuid,
  p_stage text,p_log_tail text,p_last_output_at timestamptz,p_output_bytes bigint,p_metrics jsonb)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare a public.worker_assignments%rowtype; receipt timestamptz; label text; progress_value integer;
begin
  if p_stage not in ('preparing_source','verifying_source','preparing_workspace','compiling','linking','validating','packaging','uploading')
    or p_stage is null or p_output_bytes is null or p_output_bytes<0 or p_output_bytes>9007199254740991
    or length(p_log_tail)>12000 or (p_metrics is not null and (jsonb_typeof(p_metrics)<>'object' or length(p_metrics::text)>32000)) then
    raise exception 'Invalid build activity';
  end if;
  select * into a from public.lock_worker_assignment(p_worker_id,p_hash,p_assignment_id);
  if not found then return null; end if;
  receipt:=clock_timestamp();
  label:=case p_stage when 'preparing_source' then 'Preparing source cache' when 'verifying_source' then 'Verifying official source checksum'
    when 'preparing_workspace' then 'Preparing isolated workspace' when 'compiling' then 'Compiling export template'
    when 'linking' then 'Linking export template' when 'validating' then 'Validating compiled template'
    when 'packaging' then 'Packaging Godot template' else 'Uploading artifact' end;
  progress_value:=case p_stage when 'preparing_source' then 5 when 'verifying_source' then 12 when 'preparing_workspace' then 18
    when 'compiling' then 25 when 'linking' then 70 when 'validating' then 78 when 'packaging' then 84 else 92 end;
  update public.builds set status=case when p_stage='linking' then 'compiling' else p_stage end,
    stage_started_at=case when stage is distinct from label then receipt else stage_started_at end,
    stage=label,progress=progress_value,heartbeat_at=receipt,
    last_output_at=greatest(last_output_at,least(p_last_output_at,receipt)),
    log_tail=case when p_output_bytes>=coalesce(output_bytes,0) then p_log_tail else log_tail end,
    output_bytes=greatest(coalesce(output_bytes,0),p_output_bytes),performance_metrics=coalesce(p_metrics,performance_metrics)
    where id=a.build_id;
  update public.build_workers set last_seen_at=receipt where id=p_worker_id;
  update public.worker_assignments set lease_until=receipt+interval '90 seconds' where id=p_assignment_id;
  return receipt+interval '90 seconds';
end; $$;

-- Queue-owner recovery can invalidate expired, disconnected, revoked or cancelled
-- attempts. An old assignment cannot regress a newer live attempt or terminal build.
create function public.recover_worker_assignment(p_assignment_id uuid,p_error text,p_terminal boolean default false)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.worker_assignments%rowtype;
begin
  select * into a from public.worker_assignments where id=p_assignment_id;
  if not found then return false; end if;
  perform 1 from public.build_workers where id=a.worker_id for update;
  perform 1 from public.builds where id=a.build_id for update;
  select * into a from public.worker_assignments where id=p_assignment_id for update;
  if a.state not in ('active','expired','released') then return false; end if;
  update public.worker_assignments set state='expired',ended_at=clock_timestamp() where id=p_assignment_id;
  if not exists(select 1 from public.worker_assignments where build_id=a.build_id and state='active' and id<>p_assignment_id) then
    update public.builds set status=case when p_terminal then 'failed' else 'queued' end,
      stage=case when p_terminal then 'Build failed' else 'Waiting for retry' end,progress=0,
      error=left(p_error,2000),completed_at=case when p_terminal then clock_timestamp() else null end
      where id=a.build_id and status not in ('complete','failed');
  end if;
  return true;
end; $$;

create function public.reserve_worker_upload(p_worker_id uuid,p_hash text,p_assignment_id uuid,
  p_upload_id uuid,p_path text,p_sha256 text,p_size bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.lock_worker_assignment(p_worker_id,p_hash,p_assignment_id);
  if not found then return false; end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' or p_size is null or p_size not between 1 and 536870912
    or p_path is null or p_path<>('distributed/'||p_assignment_id::text||'/'||p_upload_id::text||'/'||p_sha256||'.tpz') then
    raise exception 'Invalid upload identity';
  end if;
  if (select count(*) from public.worker_uploads where assignment_id=p_assignment_id and state='pending' and expires_at>clock_timestamp())>=3 then return false; end if;
  insert into public.worker_uploads(id,assignment_id,storage_path,sha256,size_bytes) values(p_upload_id,p_assignment_id,p_path,p_sha256,p_size);
  return true;
end; $$;

create function public.complete_worker_build(p_worker_id uuid,p_hash text,p_assignment_id uuid,
  p_upload_id uuid,p_artifact_hash text,p_config jsonb,p_source_sha256 text,p_binary_size bigint,p_dry_run boolean,p_metrics jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.worker_assignments%rowtype; b public.builds%rowtype; u public.worker_uploads%rowtype; winner public.artifacts%rowtype; expected_hash text;
begin
  select * into a from public.lock_worker_assignment(p_worker_id,p_hash,p_assignment_id,true);
  if not found then return null; end if;
  select * into b from public.builds where id=a.build_id;
  if a.state='completed' then return b.artifact_id; end if;
  select * into u from public.worker_uploads where id=p_upload_id and assignment_id=p_assignment_id for update;
  if not found or u.state<>'pending' or u.expires_at<=clock_timestamp() then return null; end if;
  expected_hash:=case when p_dry_run then encode(extensions.digest('dry-run'||chr(10)||b.config_hash,'sha256'),'hex') else b.config_hash end;
  if p_dry_run is null or p_artifact_hash is distinct from expected_hash or p_config is distinct from b.config
    or p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$' or p_binary_size is null or p_binary_size<0
    or (not p_dry_run and p_binary_size=0) then raise exception 'Invalid artifact metadata'; end if;
  insert into public.artifacts(config_hash,storage_path,sha256,size_bytes,godot_version,platform,architecture,template_kinds,
    normalized_config,source_sha256,build_recipe_version,binary_size_bytes,is_dry_run)
    values(p_artifact_hash,u.storage_path,u.sha256,u.size_bytes,p_config->>'godotVersion',p_config->>'platform',p_config->>'architecture',
      array(select jsonb_array_elements_text(p_config->'templateKinds')),p_config,p_source_sha256,
      (select recipe_version from public.build_workers where id=p_worker_id),p_binary_size,p_dry_run)
    on conflict(config_hash) do nothing;
  select * into winner from public.artifacts where config_hash=p_artifact_hash;
  if winner.is_dry_run is distinct from p_dry_run then raise exception 'Artifact cache mismatch'; end if;
  update public.worker_uploads set state=case when winner.storage_path=u.storage_path then 'published' else 'abandoned' end where id=p_upload_id;
  if winner.storage_path<>u.storage_path then
    insert into public.artifact_deletions(storage_path) values(u.storage_path) on conflict(storage_path) do nothing;
  end if;
  update public.builds set artifact_id=winner.id,status='complete',stage=case when p_dry_run then 'Dry-run artifact ready' else 'Template ready' end,
    progress=100,completed_at=clock_timestamp(),heartbeat_at=clock_timestamp(),error=null,performance_metrics=p_metrics where id=b.id;
  update public.worker_assignments set state='completed',ended_at=clock_timestamp() where id=a.id;
  return winner.id;
end; $$;

create function public.cleanup_worker_uploads() returns integer language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
  with abandoned as (update public.worker_uploads set state='abandoned'
    where state='pending' and expires_at<=clock_timestamp() returning storage_path)
  insert into public.artifact_deletions(storage_path) select storage_path from abandoned
    where not exists(select 1 from public.artifacts a where a.storage_path=abandoned.storage_path)
    on conflict(storage_path) do nothing;
  get diagnostics affected=row_count;
  return affected;
end; $$;

create function public.complete_worker_cache(p_worker_id uuid,p_hash text,p_assignment_id uuid,p_artifact_hash text,p_metrics jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare a public.worker_assignments%rowtype; b public.builds%rowtype; artifact public.artifacts%rowtype;
begin
  select * into a from public.lock_worker_assignment(p_worker_id,p_hash,p_assignment_id);
  if not found then return null; end if;
  select * into b from public.builds where id=a.build_id;
  select * into artifact from public.artifacts where config_hash=p_artifact_hash;
  if not found or artifact.normalized_config is distinct from b.config
    or p_artifact_hash is distinct from (case when artifact.is_dry_run then encode(extensions.digest('dry-run'||chr(10)||b.config_hash,'sha256'),'hex') else b.config_hash end) then return null; end if;
  update public.builds set artifact_id=artifact.id,status='complete',stage='Cached artifact',progress=100,
    error=null,completed_at=clock_timestamp(),heartbeat_at=clock_timestamp(),performance_metrics=p_metrics where id=b.id;
  update public.worker_assignments set state='completed',ended_at=clock_timestamp() where id=a.id;
  return artifact.id;
end; $$;
revoke all on function public.complete_worker_cache(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_worker_cache(uuid,text,uuid,text,jsonb) to service_role;

-- Cleanup remains durable even while the gateway is down. The existing
-- maintenance service removes queued objects and acknowledges deletion.
select cron.schedule('mingd-worker-upload-cleanup','*/5 * * * *', 'select public.cleanup_worker_uploads()');

revoke all on function public.lock_worker_assignment(uuid,text,uuid,boolean),
  public.heartbeat_worker_build(uuid,text,uuid,text,text,timestamptz,bigint,jsonb),
  public.recover_worker_assignment(uuid,text,boolean),public.reserve_worker_upload(uuid,text,uuid,uuid,text,text,bigint),
  public.complete_worker_build(uuid,text,uuid,uuid,text,jsonb,text,bigint,boolean,jsonb),public.cleanup_worker_uploads()
  from public,anon,authenticated;
grant execute on function public.lock_worker_assignment(uuid,text,uuid,boolean),
  public.heartbeat_worker_build(uuid,text,uuid,text,text,timestamptz,bigint,jsonb),
  public.recover_worker_assignment(uuid,text,boolean),public.reserve_worker_upload(uuid,text,uuid,uuid,text,text,bigint),
  public.complete_worker_build(uuid,text,uuid,uuid,text,jsonb,text,bigint,boolean,jsonb),public.cleanup_worker_uploads() to service_role;

-- Cascading deletion of a build/worker must not erase the only cleanup record
-- for an interrupted Storage write. Definer access is needed for Auth cascades.
create function public.queue_deleted_worker_upload() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.state<>'published' and not exists(select 1 from public.artifacts where storage_path=old.storage_path) then
    insert into public.artifact_deletions(storage_path) values(old.storage_path) on conflict(storage_path) do nothing;
  end if;
  return old;
end; $$;
revoke all on function public.queue_deleted_worker_upload() from public,anon,authenticated,service_role;
create trigger worker_upload_deleted after delete on public.worker_uploads
  for each row execute function public.queue_deleted_worker_upload();
