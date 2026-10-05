-- Privileged worker-only writes; ownership SELECT RLS remains unchanged.
alter table public.builds
  add column performance_metrics jsonb
    check (performance_metrics is null or jsonb_typeof(performance_metrics) = 'object');
