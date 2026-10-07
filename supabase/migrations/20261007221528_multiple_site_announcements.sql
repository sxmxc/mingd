begin;

-- Validate every message as well as the list shape at the privileged write boundary.
create function public.valid_site_announcements(messages text[])
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(
    pg_catalog.cardinality(messages) <= 10
    and (pg_catalog.cardinality(messages) = 0 or pg_catalog.array_ndims(messages) = 1)
    and not exists (
      select 1 from pg_catalog.unnest(messages) as message
      where message is null or pg_catalog.char_length(pg_catalog.btrim(message)) = 0
        or pg_catalog.char_length(message) > 500
    ), false
  );
$$;
revoke all on function public.valid_site_announcements(text[]) from public, anon, authenticated;
grant execute on function public.valid_site_announcements(text[]) to service_role;

alter table public.site_settings
  add column announcements text[] not null default '{}'::text[]
  constraint site_settings_announcements_valid check (public.valid_site_announcements(announcements));

update public.site_settings
set announcements = array[pg_catalog.btrim(announcement)]
where pg_catalog.char_length(pg_catalog.btrim(announcement)) > 0;

-- Retain the legacy column for compatibility with the previous web release.
-- Existing site_settings grants and RLS continue to protect all settings.
commit;
