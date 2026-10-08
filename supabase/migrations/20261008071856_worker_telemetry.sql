-- Authenticated, bounded snapshots; registry remains private under existing RLS.
alter table public.build_workers
  add column telemetry jsonb check (telemetry is null or (jsonb_typeof(telemetry) = 'object' and octet_length(telemetry::text) <= 16384)),
  add column telemetry_at timestamptz;
create index worker_assignments_latest_idx on public.worker_assignments(worker_id, created_at desc, id desc);

create function public.record_worker_telemetry(
  p_worker_id uuid, p_credential_hash text, p_release text, p_recipe_version text,
  p_target text, p_toolchain_sha256 text, p_expected_recipe_version text, p_telemetry jsonb
) returns table(outcome text, received_at timestamptz, draining boolean)
language plpgsql security invoker set search_path = '' as $$
declare receipt record;
begin
  if p_telemetry is null or jsonb_typeof(p_telemetry) <> 'object' or octet_length(p_telemetry::text) > 16384 then
    raise exception 'Invalid worker telemetry';
  end if;
  -- Nested heartbeat retains the worker row lock for this whole transaction.
  select * into receipt from public.record_worker_heartbeat(p_worker_id,p_credential_hash,p_release,
    p_recipe_version,p_target,p_toolchain_sha256,null,p_expected_recipe_version);
  if not found then return; end if;
  if receipt.outcome = 'ok' then
    update public.build_workers set telemetry = p_telemetry, telemetry_at = receipt.received_at where id = p_worker_id;
  end if;
  return query select receipt.outcome::text, receipt.received_at::timestamptz, receipt.draining::boolean;
end;
$$;
revoke all on function public.record_worker_telemetry(uuid,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.record_worker_telemetry(uuid,text,text,text,text,text,text,jsonb) to service_role;

-- Called only by the web server after current SuperAdmin authorization. Explicit
-- fields exclude credential hashes and avoid exposing raw build/user metadata.
create function public.admin_worker_stats(p_limit integer default 25, p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 1000000 then
    raise exception 'Invalid worker page';
  end if;
  select jsonb_build_object('total',(select count(*) from public.build_workers),'workers',coalesce(jsonb_agg(row_data order by created_at desc, worker_id),'[]'::jsonb)) into result
  from (
    select w.created_at, w.id as worker_id, jsonb_build_object(
      'id',w.id,'name',w.name,'target',w.target,'release',w.software_release,'recipeVersion',w.recipe_version,
      'capacity',w.max_assignments,'disabled',w.disabled,'draining',w.draining,'lastSeenAt',w.last_seen_at,
      'telemetry',w.telemetry,'telemetryAt',w.telemetry_at,
      'activeBuilds',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'stage',b.stage,'progress',b.progress,'leaseUntil',a.lease_until) order by a.created_at)
        from public.worker_assignments a join public.builds b on b.id=a.build_id
        where a.worker_id=w.id and a.state='active' and a.lease_until>now()),'[]'::jsonb),
      'latestBuild',(select jsonb_build_object('id',b.id,'status',b.status,'stage',b.stage,'metrics',b.performance_metrics,'assignmentState',a.state)
        from public.worker_assignments a join public.builds b on b.id=a.build_id
        where a.worker_id=w.id order by a.created_at desc,a.id desc limit 1)
    ) as row_data
    from public.build_workers w order by w.created_at desc,w.id limit p_limit offset p_offset
  ) worker_rows;
  return result;
end;
$$;
revoke all on function public.admin_worker_stats(integer,integer) from public, anon, authenticated;
grant execute on function public.admin_worker_stats(integer,integer) to service_role;
