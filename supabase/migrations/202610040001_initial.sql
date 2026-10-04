create extension if not exists pgcrypto;

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  config_hash text not null unique,
  storage_path text not null unique,
  sha256 text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  godot_version text not null,
  platform text not null check (platform in ('windows', 'linux')),
  architecture text not null check (architecture in ('x86_64')),
  template_kinds text[] not null,
  created_at timestamptz not null default now()
);

create table public.builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_id uuid references public.artifacts(id) on delete set null,
  config_hash text not null,
  status text not null default 'queued' check (
    status in ('queued', 'preparing', 'compiling', 'packaging', 'uploading', 'complete', 'failed')
  ),
  stage text not null default 'Queued',
  progress integer not null default 0 check (progress between 0 and 100),
  config jsonb not null,
  error text,
  log_tail text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index builds_user_created_idx on public.builds(user_id, created_at desc);
create index builds_config_hash_idx on public.builds(config_hash);

alter table public.artifacts enable row level security;
alter table public.builds enable row level security;

-- Artifact metadata is intentionally server-only. The web API and builder use the
-- privileged Supabase key for cache lookup and artifact writes.

create policy "users can read own builds"
on public.builds
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Users never insert or update build state directly. The authenticated web API
-- creates jobs with the privileged key after validation, and the builder updates them.

insert into storage.buckets (id, name, public, file_size_limit)
values ('build-artifacts', 'build-artifacts', false, 524288000)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;
