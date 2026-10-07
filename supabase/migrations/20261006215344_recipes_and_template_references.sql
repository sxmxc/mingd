begin;
create table public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  share_token text unique check (share_token ~ '^[A-Za-z0-9_-]{32}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_recipes_user_updated_idx on public.saved_recipes(user_id, updated_at desc, id);
alter table public.saved_recipes enable row level security;
revoke all on public.saved_recipes from anon, authenticated;
grant select, insert, update, delete on public.saved_recipes to authenticated;
grant all on public.saved_recipes to service_role;
create policy "manage own recipes" on public.saved_recipes for all to authenticated
using (user_id = (select auth.uid()) and coalesce((select enabled from public.account_roles where user_id = (select auth.uid())), true))
with check (user_id = (select auth.uid()) and coalesce((select enabled from public.account_roles where user_id = (select auth.uid())), true));

-- Reference measurements are populated by the verified official-archive importer.
create table public.official_template_references (
  godot_version text not null check (godot_version ~ '^4\.[0-9]+(\.[0-9]+)?$'),
  platform text not null check (platform in ('windows', 'linux', 'web')),
  architecture text not null,
  template_kind text not null check (template_kind in ('debug', 'release')),
  web_threads boolean not null default false,
  binary_size_bytes bigint not null check (binary_size_bytes > 0 and binary_size_bytes <= 9007199254740991),
  archive_sha256 text not null check (archive_sha256 ~ '^[a-f0-9]{64}$'),
  source_url text not null,
  measured_at timestamptz not null default now(),
  primary key (godot_version, platform, architecture, template_kind, web_threads),
  check (architecture = case when platform = 'web' then 'wasm32' else 'x86_64' end),
  check (platform = 'web' or not web_threads),
  check (source_url = 'https://github.com/godotengine/godot-builds/releases/download/' || godot_version || '-stable/Godot_v' || godot_version || '-stable_export_templates.tpz')
);
alter table public.official_template_references enable row level security;
revoke all on public.official_template_references from anon, authenticated;
grant all on public.official_template_references to service_role;
-- Godot 4.7.2 references measured from its official SHA-256-verified TPZ.
insert into public.official_template_references
(godot_version,platform,architecture,template_kind,web_threads,binary_size_bytes,archive_sha256,source_url,measured_at) values
('4.7.2', 'windows', 'x86_64', 'release', false, 109268480, 'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011', 'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz', '2026-10-06T22:01:24.754Z'),
('4.7.2', 'windows', 'x86_64', 'debug', false, 103176704, 'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011', 'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz', '2026-10-06T22:01:24.754Z'),
('4.7.2', 'linux', 'x86_64', 'release', false, 73519416, 'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011', 'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz', '2026-10-06T22:01:24.754Z'),
('4.7.2', 'linux', 'x86_64', 'debug', false, 73703800, 'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011', 'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz', '2026-10-06T22:01:24.754Z'),
('4.7.2', 'web', 'wasm32', 'release', false, 39514754, 'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011', 'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz', '2026-10-06T22:01:24.754Z'),
('4.7.2', 'web', 'wasm32', 'release', true, 38820072, 'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011', 'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz', '2026-10-06T22:01:24.754Z'),
('4.7.2', 'web', 'wasm32', 'debug', false, 37902138, 'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011', 'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz', '2026-10-06T22:01:24.754Z'),
('4.7.2', 'web', 'wasm32', 'debug', true, 38349395, 'f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011', 'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz', '2026-10-06T22:01:24.754Z');
commit;
