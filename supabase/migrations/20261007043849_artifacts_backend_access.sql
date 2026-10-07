begin;

-- Shared cache metadata is server-only. Downloads are authorized through builds
-- before the web API reads artifacts with its privileged Supabase client.
revoke all on table public.artifacts from public, anon, authenticated;
grant select, insert, update, delete on table public.artifacts to service_role;

-- service_role already bypasses RLS; this policy documents the intended access
-- model and resolves the rls_enabled_no_policy advisor without exposing rows.
create policy "backend manages artifacts"
on public.artifacts
for all
to service_role
using (true)
with check (true);

-- Verified reference measurements are also read and written only by backend
-- clients; users receive comparisons through the authorized build response.
revoke all on table public.official_template_references from public, anon, authenticated;
grant select, insert, update, delete on table public.official_template_references to service_role;

create policy "backend manages template references"
on public.official_template_references
for all
to service_role
using (true)
with check (true);

commit;
