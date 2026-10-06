begin;
create table public.account_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'authenticated' check (role in ('authenticated', 'superadmin')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.account_roles enable row level security;
revoke all on public.account_roles from anon, authenticated;
grant select on public.account_roles to authenticated;
grant all on public.account_roles to service_role;
create policy "read own account access" on public.account_roles for select
  to authenticated using (user_id = (select auth.uid()));
drop policy "users can read own builds" on public.builds;
create policy "read authorized builds" on public.builds for select to authenticated
using (
  coalesce((select enabled from public.account_roles where user_id = (select auth.uid())), true)
  and (user_id = (select auth.uid()) or
    (select role from public.account_roles where user_id = (select auth.uid())) = 'superadmin')
);
create table public.site_settings (
  id boolean primary key default true check (id),
  build_submissions_enabled boolean not null default true,
  announcement text not null default '' check (char_length(announcement) <= 500),
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (true);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to authenticated;
grant all on public.site_settings to service_role;
create policy "read site settings" on public.site_settings for select to authenticated using (true);
-- Recheck the authenticated actor under a lock to prevent concurrent admin lockout.
create function public.set_account_access(actor_id uuid, target_id uuid, new_role text, new_enabled boolean)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(6415301);
  if not exists (select 1 from public.account_roles where user_id = actor_id and role = 'superadmin' and enabled) then
    raise exception 'SuperAdmin access required';
  end if;
  if target_id = actor_id and (new_role <> 'superadmin' or not new_enabled) then
    raise exception 'You cannot remove your own SuperAdmin access';
  end if;
  insert into public.account_roles(user_id, role, enabled)
  values (target_id, new_role, new_enabled)
  on conflict (user_id) do update set role = excluded.role, enabled = excluded.enabled, updated_at = now();
end;
$$;
revoke all on function public.set_account_access(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_account_access(uuid, uuid, text, boolean) to service_role;
create function public.admin_build_stats() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'builds', count(*), 'complete', count(*) filter (where status = 'complete'),
    'failed', count(*) filter (where status = 'failed'),
    'active', count(*) filter (where status not in ('complete', 'failed')),
    'cached', count(*) filter (where performance_metrics->>'artifactCacheHit' = 'true'),
    'average_build_seconds', avg(extract(epoch from (completed_at - started_at))) filter (where status = 'complete' and started_at is not null and coalesce(performance_metrics->>'artifactCacheHit', 'false') <> 'true'),
    'artifact_bytes', (select coalesce(sum(size_bytes), 0) from public.artifacts where not is_dry_run),
    'artifacts', (select count(*) from public.artifacts where not is_dry_run)
  ) from public.builds;
$$;
revoke all on function public.admin_build_stats() from public, anon, authenticated;
grant execute on function public.admin_build_stats() to service_role;
create index builds_active_created_idx on public.builds(created_at) where status not in ('complete', 'failed');
commit;
