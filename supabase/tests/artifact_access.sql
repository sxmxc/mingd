begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(22);

select ok((select relrowsecurity from pg_class where oid = 'public.artifacts'::regclass), 'Artifact RLS remains enabled');
select ok(exists (
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'artifacts'
    and policyname = 'backend manages artifacts' and roles = array['service_role']::name[]
    and cmd = 'ALL'
), 'Artifact policy is scoped to the backend role');
select ok(not has_table_privilege(role_name, 'public.artifacts', operation), role_name || ' has no artifact ' || operation || ' privilege')
from unnest(array['anon', 'authenticated']) as roles(role_name)
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as operations(operation);

set local role service_role;
select lives_ok($sql$
  insert into public.artifacts(config_hash, storage_path, sha256, size_bytes, godot_version, platform, architecture, template_kinds)
  values ('artifact-access-test', 'artifact-access-test.tpz', repeat('a', 64), 1, '4.7.2', 'linux', 'x86_64', array['release'])
$sql$, 'Backend can create artifacts');
select is((select count(*) from public.artifacts where config_hash = 'artifact-access-test'), 1::bigint, 'Backend can read artifacts');
with changed as (
  update public.artifacts set size_bytes = 2 where config_hash = 'artifact-access-test' returning size_bytes
)
select is((select size_bytes from changed), 2::bigint, 'Backend can update artifacts');
reset role;

set local role anon;
select throws_ok($$select * from public.artifacts$$, '42501', null, 'Anonymous cannot read artifact metadata');
select throws_ok($$insert into public.artifacts default values$$, '42501', null, 'Anonymous cannot insert artifacts');
select throws_ok($$update public.artifacts set size_bytes = 3 where config_hash = 'artifact-access-test'$$, '42501', null, 'Anonymous cannot update artifacts');
select throws_ok($$delete from public.artifacts where config_hash = 'artifact-access-test'$$, '42501', null, 'Anonymous cannot delete artifacts');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select throws_ok($$select * from public.artifacts$$, '42501', null, 'Signed-in users cannot read artifact metadata directly');
select throws_ok($$insert into public.artifacts default values$$, '42501', null, 'Signed-in users cannot insert artifacts');
select throws_ok($$update public.artifacts set size_bytes = 3 where config_hash = 'artifact-access-test'$$, '42501', null, 'Signed-in users cannot update artifacts');
select throws_ok($$delete from public.artifacts where config_hash = 'artifact-access-test'$$, '42501', null, 'Signed-in users cannot delete artifacts');
reset role;

set local role service_role;
with removed as (
  delete from public.artifacts where config_hash = 'artifact-access-test' returning id
)
select is((select count(*) from removed), 1::bigint, 'Backend can delete artifacts');
reset role;

select * from finish();
rollback;
