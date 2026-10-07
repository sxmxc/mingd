begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(20);
insert into auth.users(id,email) values
  ('10000000-0000-0000-0000-000000000001','recipe-owner@example.test'),
  ('10000000-0000-0000-0000-000000000002','recipe-other@example.test');
insert into public.saved_recipes(id,user_id,name,config,share_token) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Owner recipe','{}',repeat('a',32)),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other recipe','{}',null);
select ok(not has_table_privilege('anon','public.saved_recipes','SELECT'),'Anonymous cannot enumerate recipe owners or tokens');
select ok(not has_table_privilege('anon','public.saved_recipes','INSERT'),'Anonymous cannot create recipes');
select ok(not has_table_privilege('authenticated','public.official_template_references','INSERT'),'Reference writes are privileged');
select ok(not has_table_privilege('anon','public.official_template_references','SELECT'),'References are server-only');
select ok(not has_table_privilege('authenticated','public.official_template_references','UPDATE'),'Users cannot forge measurements');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.saved_recipes),1::bigint,'Owner reads only own recipes');
select is((select count(*) from public.saved_recipes where user_id='10000000-0000-0000-0000-000000000002'),0::bigint,'Other owner is hidden');
select lives_ok($$insert into public.saved_recipes(user_id,name,config) values ('10000000-0000-0000-0000-000000000001','Saved','{}')$$,'Owner creates a private recipe');
select throws_ok($$insert into public.saved_recipes(user_id,name,config) values ('10000000-0000-0000-0000-000000000002','Forged','{}')$$,'42501',null,'Cannot create for another owner');
select throws_ok($$update public.saved_recipes set user_id='10000000-0000-0000-0000-000000000002' where id='20000000-0000-0000-0000-000000000001'$$,'42501',null,'Cannot reassign recipe ownership');
select lives_ok($$update public.saved_recipes set name='Updated', share_token=repeat('b',32) where id='20000000-0000-0000-0000-000000000001'$$,'Owner may update and share');
select is((select name from public.saved_recipes where id='20000000-0000-0000-0000-000000000001'),'Updated','Owner edit persisted');
with changed as (update public.saved_recipes set name='Stolen' where id='20000000-0000-0000-0000-000000000002' returning id) select is((select count(*) from changed),0::bigint,'Cannot update another owner');
with removed as (delete from public.saved_recipes where id='20000000-0000-0000-0000-000000000002' returning id) select is((select count(*) from removed),0::bigint,'Cannot delete another owner');
select lives_ok($$update public.saved_recipes set share_token=null where id='20000000-0000-0000-0000-000000000001'$$,'Owner revokes sharing');
select is((select share_token from public.saved_recipes where id='20000000-0000-0000-0000-000000000001'),null::text,'Token removed');
reset role;
insert into public.account_roles(user_id,enabled) values ('10000000-0000-0000-0000-000000000001',false);
set local role authenticated;
select is((select count(*) from public.saved_recipes),0::bigint,'Disabled account cannot read recipes');
select throws_ok($$insert into public.saved_recipes(user_id,name,config) values ('10000000-0000-0000-0000-000000000001','Disabled','{}')$$,'42501',null,'Disabled account cannot create recipes');
with changed as (update public.saved_recipes set name='Disabled edit' returning id) select is((select count(*) from changed),0::bigint,'Disabled account cannot edit');
reset role;
update public.account_roles set enabled=true where user_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
with removed as (delete from public.saved_recipes where id='20000000-0000-0000-0000-000000000001' returning id) select is((select count(*) from removed),1::bigint,'Owner deletes own recipe');
select * from finish();
rollback;
