alter table public.artifacts
  add column normalized_config jsonb,
  add column source_sha256 text,
  add column build_recipe_version text,
  add column binary_size_bytes bigint check (binary_size_bytes >= 0),
  add column is_dry_run boolean not null default false;

alter table public.builds drop constraint builds_status_check;
update public.builds set status = 'preparing_source' where status = 'preparing';
alter table public.builds add constraint builds_status_check check (
  status in ('queued', 'preparing_source', 'verifying_source', 'preparing_workspace', 'compiling', 'validating', 'packaging', 'uploading', 'complete', 'failed')
);
