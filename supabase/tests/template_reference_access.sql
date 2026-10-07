begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(22);

select ok((select relrowsecurity from pg_class where oid = 'public.official_template_references'::regclass), 'Reference RLS remains enabled');
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'official_template_references'
    and policyname = 'backend manages template references' and roles = array['service_role']::name[]
    and cmd = 'ALL'
), 'Reference policy is scoped to the backend role');
select ok(not has_table_privilege(role_name, 'public.official_template_references', operation), role_name || ' has no reference ' || operation || ' privilege')
from unnest(array['anon', 'authenticated']) as roles(role_name)
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as operations(operation);

set local role service_role;
select lives_ok($sql$
  insert into public.official_template_references(godot_version, platform, architecture, template_kind, binary_size_bytes, archive_sha256, source_url)
  values ('4.999.0', 'linux', 'x86_64', 'release', 1, repeat('a', 64), 'https://github.com/godotengine/godot-builds/releases/download/4.999.0-stable/Godot_v4.999.0-stable_export_templates.tpz')
$sql$, 'Backend can create references');
select is((select count(*) from public.official_template_references where godot_version = '4.999.0'), 1::bigint, 'Backend can read references');
with changed as (
  update public.official_template_references set binary_size_bytes = 2 where godot_version = '4.999.0' returning binary_size_bytes
)
select is((select binary_size_bytes from changed), 2::bigint, 'Backend can update references');
reset role;

set local role anon;
select throws_ok($$select * from public.official_template_references$$, '42501', null, 'Anonymous cannot read reference metadata');
select throws_ok($$insert into public.official_template_references default values$$, '42501', null, 'Anonymous cannot insert references');
select throws_ok($$update public.official_template_references set binary_size_bytes = 3 where godot_version = '4.999.0'$$, '42501', null, 'Anonymous cannot update references');
select throws_ok($$delete from public.official_template_references where godot_version = '4.999.0'$$, '42501', null, 'Anonymous cannot delete references');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok($$select * from public.official_template_references$$, '42501', null, 'Signed-in users cannot read reference metadata directly');
select throws_ok($$insert into public.official_template_references default values$$, '42501', null, 'Signed-in users cannot insert references');
select throws_ok($$update public.official_template_references set binary_size_bytes = 3 where godot_version = '4.999.0'$$, '42501', null, 'Signed-in users cannot update references');
select throws_ok($$delete from public.official_template_references where godot_version = '4.999.0'$$, '42501', null, 'Signed-in users cannot delete references');
reset role;

set local role service_role;
with removed as (
  delete from public.official_template_references where godot_version = '4.999.0' returning godot_version
)
select is((select count(*) from removed), 1::bigint, 'Backend can delete references');
reset role;

select * from finish();
rollback;
