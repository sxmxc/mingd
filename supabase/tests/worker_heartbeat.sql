begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into public.build_workers(id,name,credential_hash,target,software_release,recipe_version) values
  ('00000000-0000-4000-8000-00000000f001','Heartbeat test',repeat('a',64),'desktop','0.1.1','9');
select ok(not has_function_privilege(role,'public.record_worker_heartbeat(uuid,text,text,text,text,text,text,text)','EXECUTE'),'Heartbeat RPC is private to the gateway: '||role)
  from (values ('anon'),('authenticated')) roles(role);
set local role service_role;
select is((select count(*) from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('b',64),'0.1.1','9','desktop',null,'0.1.1','9')),0::bigint,'Invalid credentials are rejected');
select ok((select last_seen_at is null from public.build_workers where id='00000000-0000-4000-8000-00000000f001'),'Rejected heartbeat cannot timestamp activity');
select is((select outcome from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('a',64),'0.1.1','9','desktop',null,'0.1.2','9')),'incompatible','Gateway release mismatch rejected');
select is((select outcome from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('a',64),'0.1.1','9','web',null,'0.1.1','9')),'incompatible','Enrolled target cannot be changed by the worker');
select is((select outcome from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('a',64),'0.1.1','8','desktop',null,'0.1.1','9')),'incompatible','Recipe mismatch rejected');
select is((select outcome from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('a',64),'0.1.1','9','desktop',repeat('c',64),'0.1.1','9')),'incompatible','Toolchain mismatch rejected');
select ok((select last_seen_at is null from public.build_workers where id='00000000-0000-4000-8000-00000000f001'),'Incompatible heartbeat cannot timestamp activity');
create temporary table receipt as select * from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('a',64),'0.1.1','9','desktop',null,'0.1.1','9');
select is((select outcome from receipt),'ok','Compatible worker authenticated');
select ok((select received_at between clock_timestamp()-interval '5 seconds' and clock_timestamp() from receipt),'Database timestamps receipt');
select is((select last_seen_at from public.build_workers where id='00000000-0000-4000-8000-00000000f001'),(select received_at from receipt),'Registry visibility records receipt time');
select is((select count(*) from public.worker_assignments),0::bigint,'Idle heartbeat cannot create an assignment');
reset role;
insert into auth.users(id) values ('00000000-0000-4000-8000-00000000f002');
insert into public.builds(id,user_id,config_hash,config,status,heartbeat_at) values
  ('00000000-0000-4000-8000-00000000f003','00000000-0000-4000-8000-00000000f002',repeat('f',64),'{"platform":"linux"}','compiling','2026-01-01T00:00:00Z');
insert into public.worker_assignments(id,worker_id,build_id,lease_until) values
  ('00000000-0000-4000-8000-00000000f004','00000000-0000-4000-8000-00000000f001','00000000-0000-4000-8000-00000000f003',clock_timestamp()+interval '60 seconds');
set local role service_role;
create temporary table lease_before as select lease_until from public.worker_assignments where id='00000000-0000-4000-8000-00000000f004';
select is((select outcome from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('a',64),'0.1.1','9','desktop',null,'0.1.1','9')),'ok','Worker with active build can report idle health');
select is((select lease_until from public.worker_assignments where id='00000000-0000-4000-8000-00000000f004'),(select lease_until from lease_before),'Idle health cannot extend a build lease');
select is((select heartbeat_at from public.builds where id='00000000-0000-4000-8000-00000000f003'),'2026-01-01T00:00:00Z'::timestamptz,'Idle health cannot falsify build activity');
update public.build_workers set draining=true where id='00000000-0000-4000-8000-00000000f001';
select ok((select draining from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('a',64),'0.1.1','9','desktop',null,'0.1.1','9')),'Draining workers remain visible');
update public.build_workers set credential_hash=repeat('b',64) where id='00000000-0000-4000-8000-00000000f001';
select is((select count(*) from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('a',64),'0.1.1','9','desktop',null,'0.1.1','9')),0::bigint,'Rotation invalidates old credentials');
select is((select outcome from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('b',64),'0.1.1','9','desktop',null,'0.1.1','9')),'ok','Rotated credentials work');
update public.build_workers set disabled=true where id='00000000-0000-4000-8000-00000000f001';
select is((select count(*) from public.record_worker_heartbeat('00000000-0000-4000-8000-00000000f001',repeat('b',64),'0.1.1','9','desktop',null,'0.1.1','9')),0::bigint,'Disabled worker rejected immediately');
select * from finish();
rollback;
