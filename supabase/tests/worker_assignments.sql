begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

insert into auth.users(id) values ('00000000-0000-4000-8000-00000000d001');
insert into public.builds(id,user_id,config_hash,config,status) values
  ('00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000d001',repeat('a',64),'{"platform":"linux"}','queued'),
  ('00000000-0000-4000-8000-00000000b002','00000000-0000-4000-8000-00000000d001',repeat('b',64),'{"platform":"linux"}','queued'),
  ('00000000-0000-4000-8000-00000000b003','00000000-0000-4000-8000-00000000d001',repeat('c',64),'{"platform":"linux"}','complete');
insert into public.build_workers(id,name,credential_hash,target,software_release,recipe_version) values
  ('00000000-0000-4000-8000-00000000a001','Desktop A',repeat('a',64),'desktop','0.2.0','9'),
  ('00000000-0000-4000-8000-00000000a002','Desktop B',repeat('b',64),'desktop','0.2.0','9'),
  ('00000000-0000-4000-8000-00000000a003','Web',repeat('c',64),'web','0.2.0','9');

select ok((select relrowsecurity from pg_class where oid='public.build_workers'::regclass),'Worker registry has RLS');
select ok((select relrowsecurity from pg_class where oid='public.worker_assignments'::regclass),'Assignments have RLS');
select ok(not has_table_privilege(role,table_name,'SELECT'),'Client cannot read '||table_name||' as '||role)
  from (values ('anon'),('authenticated')) roles(role), (values ('public.build_workers'),('public.worker_assignments')) tables(table_name);
select ok(not has_function_privilege(role,function_name,'EXECUTE'),'Client cannot call ownership RPC as '||role)
  from (values ('anon'),('authenticated')) roles(role), (values
    ('public.claim_worker_assignment(uuid,text,uuid,text,text,text,text,text,integer)'),
    ('public.renew_worker_assignment(uuid,text,uuid,integer)'),
    ('public.release_worker_assignment(uuid,text,uuid)')) functions(function_name);

set local role service_role;
create temporary table first_assignment as select * from public.claim_worker_assignment(
  '00000000-0000-4000-8000-00000000a001',repeat('a',64),'00000000-0000-4000-8000-00000000b001',repeat('a',64),'0.2.0','9','desktop',null);
select is((select count(*) from first_assignment),1::bigint,'Gateway claims one assignment');
select ok((select lease_until>clock_timestamp() from first_assignment),'Lease uses server time');
select is((select count(*) from public.claim_worker_assignment('00000000-0000-4000-8000-00000000a001',repeat('a',64),'00000000-0000-4000-8000-00000000b001',repeat('a',64),'0.2.0','9','desktop',null)),0::bigint,'Duplicate claim cannot replace live attempt');
select is((select count(*) from public.claim_worker_assignment('00000000-0000-4000-8000-00000000a001',repeat('a',64),'00000000-0000-4000-8000-00000000b002',repeat('b',64),'0.2.0','9','desktop',null)),0::bigint,'Worker capacity is bounded');
select is((select count(*) from public.claim_worker_assignment('00000000-0000-4000-8000-00000000a002',repeat('b',64),'00000000-0000-4000-8000-00000000b001',repeat('a',64),'0.2.0','9','desktop',null)),0::bigint,'Another worker cannot steal live attempt');
select is((select count(*) from public.claim_worker_assignment('00000000-0000-4000-8000-00000000a002',repeat('b',64),'00000000-0000-4000-8000-00000000b002',repeat('a',64),'0.2.0','9','desktop',null)),0::bigint,'Queued hash must match build record');
select is((select count(*) from public.claim_worker_assignment('00000000-0000-4000-8000-00000000a002',repeat('b',64),'00000000-0000-4000-8000-00000000b003',repeat('c',64),'0.2.0','9','desktop',null)),0::bigint,'Terminal build cannot be reassigned');
select is((select count(*) from public.claim_worker_assignment('00000000-0000-4000-8000-00000000a003',repeat('c',64),'00000000-0000-4000-8000-00000000b002',repeat('b',64),'0.2.0','9','web',null)),0::bigint,'Worker target must match platform');
select is((select count(*) from public.claim_worker_assignment('00000000-0000-4000-8000-00000000a002',repeat('b',64),'00000000-0000-4000-8000-00000000b002',repeat('b',64),'0.1.0','9','desktop',null)),0::bigint,'Release declarations must match enrollment');
select is((select count(*) from public.claim_worker_assignment('00000000-0000-4000-8000-00000000a002',repeat('b',64),'00000000-0000-4000-8000-00000000b002',repeat('b',64),'0.2.0','8','desktop',null)),0::bigint,'Recipe declarations must match enrollment');
select is(public.renew_worker_assignment('00000000-0000-4000-8000-00000000a002',repeat('b',64),(select id from first_assignment)),null::timestamptz,'Wrong worker cannot renew');
select is(public.renew_worker_assignment('00000000-0000-4000-8000-00000000a001',repeat('b',64),(select id from first_assignment)),null::timestamptz,'Wrong credential cannot renew');
select ok(public.renew_worker_assignment('00000000-0000-4000-8000-00000000a001',repeat('a',64),(select id from first_assignment))>clock_timestamp(),'Current owner renews');

update public.build_workers set draining=true where id='00000000-0000-4000-8000-00000000a001';
select ok(public.renew_worker_assignment('00000000-0000-4000-8000-00000000a001',repeat('a',64),(select id from first_assignment))>clock_timestamp(),'Draining allows active work to finish');
update public.build_workers set disabled=true where id='00000000-0000-4000-8000-00000000a001';
select is(public.renew_worker_assignment('00000000-0000-4000-8000-00000000a001',repeat('a',64),(select id from first_assignment)),null::timestamptz,'Disabled worker cannot renew');
update public.build_workers set disabled=false,draining=false,credential_hash=repeat('d',64) where id='00000000-0000-4000-8000-00000000a001';
select is(public.renew_worker_assignment('00000000-0000-4000-8000-00000000a001',repeat('a',64),(select id from first_assignment)),null::timestamptz,'Rotated credential invalidates old token');

update public.worker_assignments set lease_until=clock_timestamp()-interval '1 minute' where id in(select id from first_assignment);
select is(public.renew_worker_assignment('00000000-0000-4000-8000-00000000a001',repeat('d',64),(select id from first_assignment)),null::timestamptz,'Expired owner cannot revive lease');
create temporary table replacement as select * from public.claim_worker_assignment(
  '00000000-0000-4000-8000-00000000a002',repeat('b',64),'00000000-0000-4000-8000-00000000b001',repeat('a',64),'0.2.0','9','desktop',null);
select is((select count(*) from replacement),1::bigint,'Expired assignment can be replaced');
select isnt((select id from replacement),(select id from first_assignment),'Replacement has a new identity');
select is((select state from public.worker_assignments where id in(select id from first_assignment)),'expired','Previous attempt is durably expired');
select is(public.renew_worker_assignment('00000000-0000-4000-8000-00000000a001',repeat('d',64),(select id from first_assignment)),null::timestamptz,'Old attempt cannot renew replacement');
select ok(not public.release_worker_assignment('00000000-0000-4000-8000-00000000a001',repeat('d',64),(select id from replacement)),'Wrong owner cannot release replacement');
select ok(public.release_worker_assignment('00000000-0000-4000-8000-00000000a002',repeat('b',64),(select id from replacement)),'Owner releases its assignment');
select ok(not public.release_worker_assignment('00000000-0000-4000-8000-00000000a002',repeat('b',64),(select id from replacement)),'Repeated release is rejected');
select is((select status from public.builds where id='00000000-0000-4000-8000-00000000b001'),'preparing_source','Release cannot declare build complete');
select throws_ok($$select public.renew_worker_assignment('00000000-0000-4000-8000-00000000a002',repeat('b',64),(select id from replacement),1000000)$$,'P0001','Invalid worker lease duration','Lease duration is bounded centrally');

reset role;
select * from finish();
rollback;
