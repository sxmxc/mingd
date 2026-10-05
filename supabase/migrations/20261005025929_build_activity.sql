-- Activity is written by the privileged worker. Existing ownership RLS is unchanged.
alter table public.builds
  add column heartbeat_at timestamptz,
  add column stage_started_at timestamptz,
  add column last_output_at timestamptz,
  add column output_bytes bigint not null default 0 check (output_bytes >= 0);
