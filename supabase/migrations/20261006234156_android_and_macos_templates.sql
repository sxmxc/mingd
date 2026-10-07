-- Extend target constraints without changing ownership, RLS or existing artifacts.
begin;
alter table public.artifacts drop constraint artifacts_platform_architecture_check;
alter table public.artifacts add constraint artifacts_platform_architecture_check check (
  (platform in ('linux', 'windows') and architecture = 'x86_64')
  or (platform = 'web' and architecture = 'wasm32')
  or (platform = 'android' and architecture in ('arm64', 'arm32', 'x86_64', 'x86_32'))
  or (platform = 'macos' and architecture in ('universal', 'arm64', 'x86_64'))
);
alter table public.official_template_references drop constraint official_template_references_platform_check;
alter table public.official_template_references drop constraint official_template_references_check;
alter table public.official_template_references add constraint official_template_references_platform_check
  check (platform in ('linux', 'windows', 'web', 'android', 'macos'));
alter table public.official_template_references add constraint official_template_references_platform_architecture_check check (
  (platform in ('linux', 'windows') and architecture = 'x86_64')
  or (platform = 'web' and architecture = 'wasm32')
  or (platform = 'android' and architecture in ('arm64', 'arm32', 'x86_64', 'x86_32'))
  or (platform = 'macos' and architecture in ('universal', 'arm64', 'x86_64'))
);
commit;
