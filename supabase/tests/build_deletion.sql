begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);
insert into auth.users(id,email) values
  ('10000000-0000-0000-0000-000000000001','delete-owner@example.test'),
  ('10000000-0000-0000-0000-000000000002','delete-other@example.test');
insert into public.artifacts(id,config_hash,storage_path,sha256,size_bytes,godot_version,platform,architecture,template_kinds)
values ('30000000-0000-0000-0000-000000000001','deletion-test','deletion-test.tpz',repeat('a',64),1,'4.6.1','linux','x86_64',array['release']);
insert into public.builds(id,user_id,artifact_id,config_hash,status,config) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','deletion-test','complete','{}'),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',null,'deletion-test','failed','{}'),
  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',null,'deletion-test','compiling','{}'),
  ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','deletion-test','complete','{}'),
  ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002',null,'deletion-test','failed','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
with removed as (delete from public.builds where status='compiling' returning id)
select is((select count(*) from removed),0::bigint,'Active builds cannot be deleted');
with removed as (delete from public.builds where id='20000000-0000-0000-0000-000000000004' returning id)
select is((select count(*) from removed),0::bigint,'Another owner cannot be deleted');
with removed as (delete from public.builds where status='failed' returning id)
select is((select count(*) from removed),1::bigint,'Bulk failure cleanup deletes only own failures');
with removed as (delete from public.builds where status='complete' returning id)
select is((select count(*) from removed),1::bigint,'Own completed build can be deleted');
reset role;
select is((select count(*) from public.artifacts where id='30000000-0000-0000-0000-000000000001'),1::bigint,'Shared artifact remains');
select is((select count(*) from public.builds where user_id='10000000-0000-0000-0000-000000000002'),2::bigint,'Other owner history remains');
insert into public.account_roles(user_id,role,enabled) values ('10000000-0000-0000-0000-000000000001','superadmin',true);
set local role authenticated;
with removed as (delete from public.builds where user_id='10000000-0000-0000-0000-000000000002' returning id)
select is((select count(*) from removed),0::bigint,'Admin read access does not grant deletion of others');
reset role;
insert into public.builds(user_id,config_hash,status,config) values ('10000000-0000-0000-0000-000000000001','deletion-test','failed','{}');
update public.account_roles set enabled=false where user_id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
with removed as (delete from public.builds returning id)
select is((select count(*) from removed),0::bigint,'Suspended account cannot delete');
reset role;
select is((select count(*) from public.builds where user_id='10000000-0000-0000-0000-000000000001'),2::bigint,'Protected and suspended builds remain');
select * from finish();
rollback;
