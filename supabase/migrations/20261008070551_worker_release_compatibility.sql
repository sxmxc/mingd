-- Application release is telemetry, not a worker compatibility or authentication gate.
-- Existing identities and hashes remain unchanged. The legacy expected-release
-- argument stays in the heartbeat signature for migration-first deployment.
-- Preserve existing RPC signatures, lock ordering and service-role-only access.
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

  update public.build_workers set last_seen_at = received_at, software_release = p_release where public.build_workers.id = p_worker_id;
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


-- Authenticate and timestamp idle-worker activity atomically with revocation.
-- Idle activity must never extend a build lease or update build progress.
create or replace function public.record_worker_heartbeat(
  p_worker_id uuid, p_credential_hash text, p_release text,
  p_recipe_version text, p_target text, p_toolchain_sha256 text,
  p_expected_release text, p_expected_recipe_version text
) returns table(outcome text, received_at timestamptz, draining boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  worker public.build_workers%rowtype;
  receipt timestamptz;
begin
  select w.* into worker from public.build_workers w where w.id = p_worker_id for update;
  if not found or worker.disabled or worker.credential_hash is distinct from p_credential_hash then return; end if;
  if p_recipe_version is distinct from p_expected_recipe_version
    or worker.recipe_version is distinct from p_recipe_version
    or worker.target is distinct from p_target
    or worker.toolchain_sha256 is distinct from p_toolchain_sha256 then
    return query select 'incompatible'::text, null::timestamptz, worker.draining;
    return;
  end if;
  receipt := clock_timestamp();
  update public.build_workers set last_seen_at = receipt, software_release = p_release where id = p_worker_id;
  return query select 'ok'::text, receipt, worker.draining;
end;
$$;

revoke all on function public.record_worker_heartbeat(uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_worker_heartbeat(uuid,text,text,text,text,text,text,text) to service_role;

revoke all on function public.claim_worker_assignment(uuid,text,uuid,text,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.claim_worker_assignment(uuid,text,uuid,text,text,text,text,text,integer) to service_role;

comment on column public.build_workers.software_release is
  'Latest application release reported by the authenticated compatible worker; informational, not a compatibility gate.';
