begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
insert into public.build_workers(id,name,credential_hash,target,software_release,recipe_version) values
 ('00000000-0000-4000-8000-00000000f101','Telemetry test',repeat('a',64),'desktop','0.2.0','9');
insert into auth.users(id) values ('00000000-0000-4000-8000-00000000f102');
insert into public.builds(id,user_id,config_hash,config,status,heartbeat_at) values
 ('00000000-0000-4000-8000-00000000f103','00000000-0000-4000-8000-00000000f102',repeat('f',64),'{"platform":"linux"}','compiling','2026-01-01T00:00:00Z');
insert into public.worker_assignments(id,worker_id,build_id,lease_until) values
 ('00000000-0000-4000-8000-00000000f104','00000000-0000-4000-8000-00000000f101','00000000-0000-4000-8000-00000000f103',clock_timestamp()+interval '60 seconds');
select ok(not has_function_privilege(role,'public.record_worker_telemetry(uuid,text,text,text,text,text,text,jsonb)','EXECUTE'),'Telemetry RPC excludes '||role)
 from (values ('anon'),('authenticated')) roles(role);
select ok(not has_function_privilege(role,'public.admin_worker_stats(integer,integer)','EXECUTE'),'Registry RPC excludes '||role)
 from (values ('anon'),('authenticated')) roles(role);
set local role service_role;
create temporary table lease_before as select lease_until from public.worker_assignments where id='00000000-0000-4000-8000-00000000f104';
select is((select count(*) from public.record_worker_telemetry('00000000-0000-4000-8000-00000000f101',repeat('b',64),'0.2.1','9','desktop',null,'9','{"schemaVersion":1}')),0::bigint,'Wrong credential rejects telemetry');
select is((select outcome from public.record_worker_telemetry('00000000-0000-4000-8000-00000000f101',repeat('a',64),'0.2.1','8','desktop',null,'9','{"schemaVersion":1}')),'incompatible','Wrong recipe rejects telemetry');
select is((select outcome from public.record_worker_telemetry('00000000-0000-4000-8000-00000000f101',repeat('a',64),'0.2.1','9','web',null,'9','{"schemaVersion":1}')),'incompatible','Wrong target rejects telemetry');
select is((select outcome from public.record_worker_telemetry('00000000-0000-4000-8000-00000000f101',repeat('a',64),'0.2.1','9','desktop',repeat('c',64),'9','{"schemaVersion":1}')),'incompatible','Wrong toolchain rejects telemetry');
select ok((select telemetry is null and telemetry_at is null and last_seen_at is null from public.build_workers where id='00000000-0000-4000-8000-00000000f101'),'Rejected reports cannot update registry');
create temporary table receipt as select * from public.record_worker_telemetry('00000000-0000-4000-8000-00000000f101',repeat('a',64),'0.2.1','9','desktop',null,'9','{"schemaVersion":1,"uptimeSeconds":10,"ccache":null,"container":null}');
select is((select outcome from receipt),'ok','Valid report works across release upgrade');
select is((select telemetry_at from public.build_workers where id='00000000-0000-4000-8000-00000000f101'),(select received_at from receipt),'Snapshot uses server receipt time');
select is((select telemetry->>'uptimeSeconds' from public.build_workers where id='00000000-0000-4000-8000-00000000f101'),'10','Snapshot persisted');
select is((select credential_hash from public.build_workers where id='00000000-0000-4000-8000-00000000f101'),repeat('a',64),'Credentials preserved');
select is((select lease_until from public.worker_assignments where id='00000000-0000-4000-8000-00000000f104'),(select lease_until from lease_before),'Telemetry cannot renew lease');
select is((select heartbeat_at from public.builds where id='00000000-0000-4000-8000-00000000f103'),'2026-01-01T00:00:00Z'::timestamptz,'Telemetry cannot falsify build activity');
select is(public.admin_worker_stats()->>'total','1','Admin registry includes enrolled worker');
select is(public.admin_worker_stats()->'workers'->0->'activeBuilds'->0->>'id','00000000-0000-4000-8000-00000000f103','Active builds included');
select is(public.admin_worker_stats()->'workers'->0->'latestBuild'->>'id','00000000-0000-4000-8000-00000000f103','Latest build included');
select ok(not (public.admin_worker_stats()->'workers'->0 ? 'credential_hash'),'Registry does not include credential hash');
select ok(position(repeat('a',64) in public.admin_worker_stats()::text)=0,'No credential value returned');
select is(jsonb_array_length(public.admin_worker_stats(1,1)->'workers'),0,'Pagination bounded');
select throws_ok($$select public.admin_worker_stats(101,0)$$,'P0001','Invalid worker page','Reject oversized page');
select throws_ok($$select public.record_worker_telemetry('00000000-0000-4000-8000-00000000f101',repeat('a',64),'0.2.1','9','desktop',null,'9','[]')$$,'P0001','Invalid worker telemetry','Reject nonobject report');
select throws_ok($$select public.record_worker_telemetry('00000000-0000-4000-8000-00000000f101',repeat('a',64),'0.2.1','9','desktop',null,'9',jsonb_build_object('large',repeat('x',16385)))$$,'P0001','Invalid worker telemetry','Reject excessive snapshot size');
update public.build_workers set disabled=true where id='00000000-0000-4000-8000-00000000f101';
select is((select count(*) from public.record_worker_telemetry('00000000-0000-4000-8000-00000000f101',repeat('a',64),'0.2.1','9','desktop',null,'9','{"schemaVersion":1}')),0::bigint,'Revoked worker cannot report');
select is((select telemetry->>'uptimeSeconds' from public.build_workers where id='00000000-0000-4000-8000-00000000f101'),'10','Revoked report leaves prior snapshot intact');
select * from finish();
rollback;
