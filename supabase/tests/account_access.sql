begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(17);
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000001', 'access-admin@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'access-user@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'access-other@example.test');
insert into public.account_roles(user_id,role) values
  ('00000000-0000-0000-0000-000000000001', 'superadmin');
insert into public.builds(user_id,config_hash,config) values
  ('00000000-0000-0000-0000-000000000002', 'access-user', '{}'),
  ('00000000-0000-0000-0000-000000000003', 'access-other', '{}');
select ok(not has_table_privilege('authenticated', 'public.account_roles', 'INSERT'), 'Users cannot grant roles');
select ok(not has_table_privilege('authenticated', 'public.account_roles', 'UPDATE'), 'Users cannot edit roles');
select ok(not has_table_privilege('authenticated', 'public.site_settings', 'UPDATE'), 'Users cannot change site settings');
select ok(not has_table_privilege('anon', 'public.account_roles', 'SELECT'), 'Anonymous cannot read roles');
select ok(not has_function_privilege('authenticated', 'public.admin_build_stats()', 'EXECUTE'), 'Metrics RPC is privileged');
select ok(not has_function_privilege('authenticated', 'public.set_account_access(uuid,uuid,text,boolean)', 'EXECUTE'), 'Access RPC is privileged');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.builds where config_hash in ('access-user', 'access-other')), 1::bigint, 'Normal user sees own build only');
select is((select count(*) from public.account_roles), 0::bigint, 'Normal user cannot see admin role');
select is((select count(*) from public.site_settings), 1::bigint, 'Signed-in user can read site settings');
reset role;
insert into public.account_roles(user_id,enabled) values ('00000000-0000-0000-0000-000000000002', false);
set local role authenticated;
select is((select count(*) from public.builds where config_hash in ('access-user', 'access-other')), 0::bigint, 'Disabled user cannot read builds');
select is((select count(*) from public.account_roles), 1::bigint, 'Disabled user can read own access state');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.builds where config_hash in ('access-user', 'access-other')), 2::bigint, 'SuperAdmin sees all builds');
select is((select count(*) from public.account_roles), 1::bigint, 'SuperAdmin session reads only own role');
reset role;
set local role service_role;
select throws_ok($$select public.set_account_access('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'authenticated', true)$$, 'P0001', 'You cannot remove your own SuperAdmin access', 'Self-demotion is rejected');
select throws_ok($$select public.set_account_access('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'superadmin', true)$$, 'P0001', 'SuperAdmin access required', 'Actor access is rechecked inside RPC');
select lives_ok($$select public.set_account_access('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'superadmin', true)$$, 'SuperAdmin can promote and enable another account');
select is((select role from public.account_roles where user_id = '00000000-0000-0000-0000-000000000002'), 'superadmin', 'Promotion persisted');
select * from finish();
rollback;
