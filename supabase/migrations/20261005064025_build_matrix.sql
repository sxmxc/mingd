-- Preserve existing desktop artifacts and ownership policies.
begin;
alter table public.artifacts drop constraint artifacts_platform_check;
alter table public.artifacts drop constraint artifacts_architecture_check;
alter table public.artifacts add constraint artifacts_platform_architecture_check
  check ((platform in ('linux', 'windows') and architecture = 'x86_64')
      or (platform = 'web' and architecture = 'wasm32'));
commit;
