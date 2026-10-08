-- Authenticate and timestamp idle-worker activity atomically with revocation.
-- Idle activity must never extend a build lease or update build progress.
create function public.record_worker_heartbeat(
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
  if p_release is distinct from p_expected_release
    or p_recipe_version is distinct from p_expected_recipe_version
    or worker.software_release is distinct from p_release
    or worker.recipe_version is distinct from p_recipe_version
    or worker.target is distinct from p_target
    or worker.toolchain_sha256 is distinct from p_toolchain_sha256 then
    return query select 'incompatible'::text, null::timestamptz, worker.draining;
    return;
  end if;
  receipt := clock_timestamp();
  update public.build_workers set last_seen_at = receipt where id = p_worker_id;
  return query select 'ok'::text, receipt, worker.draining;
end;
$$;

revoke all on function public.record_worker_heartbeat(uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_worker_heartbeat(uuid,text,text,text,text,text,text,text) to service_role;
