begin;
create extension if not exists pg_cron;

-- Detection is diagnostic only: BullMQ remains responsible for retry/recovery.
alter table public.builds add column stalled_at timestamptz;
create index builds_artifact_idx on public.builds(artifact_id) where artifact_id is not null;
create index builds_terminal_logs_idx on public.builds(completed_at)
  where status in ('complete', 'failed') and log_tail is not null;
create index builds_terminal_completed_idx on public.builds(completed_at) where status in ('complete', 'failed');
create index builds_active_heartbeat_idx on public.builds((coalesce(heartbeat_at, created_at))) where status not in ('complete', 'failed');
create index artifacts_created_idx on public.artifacts(created_at);

create table public.build_statistics_daily (
  day date primary key,
  builds bigint not null,
  complete bigint not null,
  failed bigint not null,
  cached bigint not null,
  average_build_seconds numeric,
  average_compile_seconds numeric,
  artifact_bytes bigint not null,
  artifacts bigint not null,
  measured_at timestamptz not null default now()
);
-- Singleton tasks coalesce repeated schedules; leases permit crash recovery.
create table public.maintenance_tasks (
  name text primary key check (name in ('artifact_cleanup', 'release_refresh')),
  requested boolean not null default true,
  requested_at timestamptz not null default now(),
  retry_after timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  result jsonb,
  check ((lease_token is null) = (lease_until is null))
);
insert into public.maintenance_tasks(name, requested) values ('artifact_cleanup', false), ('release_refresh', true);
create table public.artifact_deletions (
  storage_path text primary key,
  queued_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- A tombstoned path is never reused, including by an older worker delivery.
create function public.prevent_retired_artifact_path() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.artifact_deletions where storage_path = new.storage_path) then
    raise exception 'Artifact storage path has been retired';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_retired_artifact_path() from public, anon, authenticated;
create trigger prevent_retired_artifact_path before insert or update of storage_path on public.artifacts
  for each row execute function public.prevent_retired_artifact_path();
create index artifact_deletions_pending_idx on public.artifact_deletions(queued_at) where deleted_at is null;
create table public.official_release_catalog (
  id boolean primary key default true check (id),
  versions jsonb not null check (jsonb_typeof(versions) = 'array'),
  refreshed_at timestamptz not null default now()
);

alter table public.build_statistics_daily enable row level security;
alter table public.maintenance_tasks enable row level security;
alter table public.artifact_deletions enable row level security;
alter table public.official_release_catalog enable row level security;
revoke all on public.build_statistics_daily, public.maintenance_tasks, public.artifact_deletions, public.official_release_catalog from public, anon, authenticated;
grant all on public.build_statistics_daily, public.maintenance_tasks, public.artifact_deletions, public.official_release_catalog to service_role;
create policy "backend manages daily statistics" on public.build_statistics_daily for all to service_role using (true) with check (true);
create policy "backend manages maintenance" on public.maintenance_tasks for all to service_role using (true) with check (true);
create policy "backend manages deletions" on public.artifact_deletions for all to service_role using (true) with check (true);
create policy "backend manages release catalog" on public.official_release_catalog for all to service_role using (true) with check (true);

create function public.detect_stalled_builds() returns void
language sql security invoker set search_path = '' as $$
  update public.builds set stalled_at = case
    when status not in ('complete', 'failed')
      and coalesce(heartbeat_at, created_at) < now() - interval '5 minutes'
    then coalesce(stalled_at, now()) else null end
  where (stalled_at is null and status not in ('complete', 'failed')
    and coalesce(heartbeat_at, created_at) < now() - interval '5 minutes')
    or (stalled_at is not null and (status in ('complete', 'failed')
      or coalesce(heartbeat_at, created_at) >= now() - interval '5 minutes'));
$$;
create function public.prune_build_logs() returns void
language sql security invoker set search_path = '' as $$
  update public.builds set log_tail = null where id in (
    select id from public.builds where status in ('complete', 'failed')
      and completed_at < now() - interval '30 days' and log_tail is not null
    order by completed_at limit 5000
  );
  delete from cron.job_run_details where end_time < now() - interval '30 days';
$$;
-- Cohort is completion date in UTC. Artifact figures are storage snapshots, not
-- bytes produced that day. Recompute seven days to capture recent late records.
create function public.snapshot_build_statistics() returns void
language sql security invoker set search_path = '' as $$
  insert into public.build_statistics_daily
    (day, builds, complete, failed, cached, average_build_seconds, average_compile_seconds, artifact_bytes, artifacts)
  select d.day::date, count(b.id), count(b.id) filter (where b.status = 'complete'),
    count(b.id) filter (where b.status = 'failed'),
    count(b.id) filter (where b.status = 'complete' and b.performance_metrics->>'artifactCacheHit' = 'true'),
    avg(extract(epoch from (b.completed_at - b.started_at))) filter
      (where b.status = 'complete' and b.started_at is not null and coalesce(b.performance_metrics->>'artifactCacheHit', 'false') <> 'true'),
    avg((b.performance_metrics->'stageDurationsMs'->>'compiling')::numeric / 1000) filter
      (where b.status = 'complete' and jsonb_typeof(b.performance_metrics->'stageDurationsMs'->'compiling') = 'number'),
    (select coalesce(sum(size_bytes), 0) from public.artifacts where not is_dry_run),
    (select count(*) from public.artifacts where not is_dry_run)
  from (select (now() at time zone 'UTC')::date - offset_days as day
    from generate_series(1, 7) offset_days) d
  left join public.builds b on b.completed_at >= (d.day::date::timestamp at time zone 'UTC')
    and b.completed_at < ((d.day::date + 1)::timestamp at time zone 'UTC') and b.status in ('complete', 'failed')
  group by d.day
  on conflict (day) do update set builds = excluded.builds, complete = excluded.complete,
    failed = excluded.failed, cached = excluded.cached, average_build_seconds = excluded.average_build_seconds,
    average_compile_seconds = excluded.average_compile_seconds, measured_at = now();
$$;
create function public.request_maintenance(task_name text) returns void
language sql security invoker set search_path = '' as $$
  update public.maintenance_tasks set requested = true, requested_at = now() where name = task_name;
$$;
create function public.claim_maintenance() returns setof public.maintenance_tasks
language sql security invoker set search_path = '' as $$
  update public.maintenance_tasks set requested = false, lease_token = gen_random_uuid(),
    lease_until = now() + interval '20 minutes', started_at = now(), last_error = null
  where name = (select name from public.maintenance_tasks
    where (requested or lease_until < now()) and retry_after <= now()
      and (lease_until is null or lease_until < now())
    order by requested_at for update skip locked limit 1)
  returning *;
$$;
-- Delete metadata and persist the Storage work together. Short table locks
-- exclude new build references/cache requests during the eligibility check.
-- Referenced artifacts are never deleted, even when all their builds are old.
create function public.retire_unused_artifacts() returns integer
language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare removed integer;
begin
  lock table public.builds in share row exclusive mode;
  lock table public.artifacts in share row exclusive mode;
  with candidates as (
    select a.id from public.artifacts a where a.created_at < now() - interval '90 days'
      and not exists (select 1 from public.builds b where b.artifact_id = a.id)
      and not exists (select 1 from public.builds b where b.status not in ('complete', 'failed')
        and (b.config_hash = a.config_hash or
          (a.is_dry_run and encode(extensions.digest('dry-run' || chr(10) || b.config_hash, 'sha256'), 'hex') = a.config_hash)))
    order by a.created_at limit 100
  ), deleted as (
    delete from public.artifacts a using candidates c where a.id = c.id returning a.storage_path
  )
  insert into public.artifact_deletions(storage_path) select storage_path from deleted
    on conflict (storage_path) do nothing;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.detect_stalled_builds(), public.prune_build_logs(), public.snapshot_build_statistics(),
  public.request_maintenance(text), public.claim_maintenance(), public.retire_unused_artifacts() from public, anon, authenticated;
-- SQL maintenance runs as the migration/cron owner; backend gets only its RPCs.
grant execute on function public.request_maintenance(text), public.claim_maintenance(), public.retire_unused_artifacts() to service_role;
select cron.schedule('mingd-detect-stalled-builds', '*/5 * * * *', 'select public.detect_stalled_builds()');
select cron.schedule('mingd-prune-build-logs', '15 2 * * *', 'select public.prune_build_logs()');
select cron.schedule('mingd-build-statistics', '0 2 * * *', 'select public.snapshot_build_statistics()');
select cron.schedule('mingd-artifact-cleanup', '0 3 * * 0', $$select public.request_maintenance('artifact_cleanup')$$);
select cron.schedule('mingd-release-refresh', '0 4 * * *', $$select public.request_maintenance('release_refresh')$$);
select public.snapshot_build_statistics();
commit;
