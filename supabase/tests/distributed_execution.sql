begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id) values ('00000000-0000-4000-8000-00000000e001');
insert into public.build_workers(id,name,credential_hash,target,software_release,recipe_version) values
 ('00000000-0000-4000-8000-00000000e002','Execution owner',repeat('a',64),'desktop','0.2.0','9'),
 ('00000000-0000-4000-8000-00000000e003','Other worker',repeat('b',64),'desktop','0.2.0','9');
insert into public.builds(id,user_id,config_hash,config) values
 ('00000000-0000-4000-8000-00000000e004','00000000-0000-4000-8000-00000000e001',repeat('c',64),'{"platform":"linux","godotVersion":"4.6.3","architecture":"x86_64","templateKinds":["release"]}'),
 ('00000000-0000-4000-8000-00000000e005','00000000-0000-4000-8000-00000000e001',repeat('d',64),'{"platform":"linux"}');
select ok((select relrowsecurity from pg_class where oid='public.worker_uploads'::regclass),'Upload ledger has RLS');
select ok(not has_table_privilege(role,'public.worker_uploads','SELECT'),'Upload ledger private: '||role) from (values('anon'),('authenticated')) roles(role);
select ok(not has_function_privilege(role,fn,'EXECUTE'),'Execution RPC private: '||role||' '||fn) from (values('anon'),('authenticated')) roles(role), (values
 ('public.lock_worker_assignment(uuid,text,uuid,boolean)'),
 ('public.heartbeat_worker_build(uuid,text,uuid,text,text,timestamptz,bigint,jsonb)'),
 ('public.reserve_worker_upload(uuid,text,uuid,uuid,text,text,bigint)'),
 ('public.complete_worker_build(uuid,text,uuid,uuid,text,jsonb,text,bigint,boolean,jsonb)'),
 ('public.recover_worker_assignment(uuid,text,boolean)'),
 ('public.cleanup_worker_uploads()'),
 ('public.complete_worker_cache(uuid,text,uuid,text,jsonb)')) functions(fn);
set local role service_role;
create temporary table delivery as select * from public.claim_worker_assignment('00000000-0000-4000-8000-00000000e002',repeat('a',64),'00000000-0000-4000-8000-00000000e004',repeat('c',64),'0.2.0','9','desktop',null);
select is(public.heartbeat_worker_build('00000000-0000-4000-8000-00000000e003',repeat('b',64),(select id from delivery),'compiling',null,null,0,null),null::timestamptz,'Other worker cannot renew activity');
select ok(public.heartbeat_worker_build('00000000-0000-4000-8000-00000000e002',repeat('a',64),(select id from delivery),'linking','compiler output',clock_timestamp()+interval '1 day',42,'{"schemaVersion":1}')>clock_timestamp(),'Owned heartbeat renews lease');
select is((select stage from public.builds where id='00000000-0000-4000-8000-00000000e004'),'Linking export template','Stage visible in existing UI');
select ok((select last_output_at<=clock_timestamp() from public.builds where id='00000000-0000-4000-8000-00000000e004'),'Worker cannot forge future output timestamp');
select throws_ok($$select public.heartbeat_worker_build('00000000-0000-4000-8000-00000000e002',repeat('a',64),(select id from delivery),'arbitrary',null,null,0,null)$$,'P0001','Invalid build activity','Stage allowlist enforced');
select ok(not public.reserve_worker_upload('00000000-0000-4000-8000-00000000e003',repeat('b',64),(select id from delivery),'00000000-0000-4000-8000-00000000e006','wrong',repeat('f',64),12),'Other worker cannot reserve');
select throws_ok($$select public.reserve_worker_upload('00000000-0000-4000-8000-00000000e002',repeat('a',64),(select id from delivery),'00000000-0000-4000-8000-00000000e006','../anything',repeat('f',64),12)$$,'P0001','Invalid upload identity','Storage paths cannot escape generated namespace');
select ok(public.reserve_worker_upload('00000000-0000-4000-8000-00000000e002',repeat('a',64),(select id from delivery),'00000000-0000-4000-8000-00000000e006','distributed/'||(select id from delivery)||'/00000000-0000-4000-8000-00000000e006/'||repeat('f',64)||'.tpz',repeat('f',64),12),'Owned upload reserved durably');
select is(public.complete_worker_build('00000000-0000-4000-8000-00000000e003',repeat('b',64),(select id from delivery),'00000000-0000-4000-8000-00000000e006',repeat('c',64),(select config from public.builds where id='00000000-0000-4000-8000-00000000e004'),repeat('e',64),1,false,null),null::uuid,'Other worker cannot publish');
create temporary table committed as select public.complete_worker_build('00000000-0000-4000-8000-00000000e002',repeat('a',64),(select id from delivery),'00000000-0000-4000-8000-00000000e006',repeat('c',64),(select config from public.builds where id='00000000-0000-4000-8000-00000000e004'),repeat('e',64),1,false,null) as id;
select ok((select id is not null from committed),'Valid owned result commits');
select is((select status from public.builds where id='00000000-0000-4000-8000-00000000e004'),'complete','Only committed artifact marks complete');
select is((select state from public.worker_assignments where id=(select id from delivery)),'completed','Delivery is durably completed');
select is((select state from public.worker_uploads where id='00000000-0000-4000-8000-00000000e006'),'published','Winner upload marked published');
select is(public.complete_worker_build('00000000-0000-4000-8000-00000000e002',repeat('a',64),(select id from delivery),'00000000-0000-4000-8000-00000000e006',repeat('c',64),null,null,null,false,null),(select id from committed),'Lost completion response can be retried idempotently');
select ok(not public.recover_worker_assignment((select id from delivery),'stale retry',true),'Recovery cannot regress completed result');
select is(public.heartbeat_worker_build('00000000-0000-4000-8000-00000000e002',repeat('a',64),(select id from delivery),'compiling',null,null,0,null),null::timestamptz,'Completed build cannot resume compiling');
create temporary table interrupted as select * from public.claim_worker_assignment('00000000-0000-4000-8000-00000000e002',repeat('a',64),'00000000-0000-4000-8000-00000000e005',repeat('d',64),'0.2.0','9','desktop',null);
select ok(public.reserve_worker_upload('00000000-0000-4000-8000-00000000e002',repeat('a',64),(select id from interrupted),'00000000-0000-4000-8000-00000000e007','distributed/'||(select id from interrupted)||'/00000000-0000-4000-8000-00000000e007/'||repeat('f',64)||'.tpz',repeat('f',64),12),'Interrupted upload reservation exists');
update public.worker_assignments set lease_until=clock_timestamp()-interval '1 second' where id=(select id from interrupted);
select is((select count(*) from public.lock_worker_assignment('00000000-0000-4000-8000-00000000e002',repeat('a',64),(select id from interrupted))),0::bigint,'Expired delivery cannot mutate');
select ok(public.recover_worker_assignment((select id from interrupted),'retry',false),'Queue owner recovers interrupted delivery');
select is((select status from public.builds where id='00000000-0000-4000-8000-00000000e005'),'queued','Interrupted delivery becomes retryable');
update public.worker_uploads set expires_at=clock_timestamp()-interval '1 second' where id='00000000-0000-4000-8000-00000000e007';
select is(public.cleanup_worker_uploads(),1,'Expired uploads enqueue durable cleanup');
select is(public.cleanup_worker_uploads(),0,'Cleanup is idempotent');
select is((select state from public.worker_uploads where id='00000000-0000-4000-8000-00000000e007'),'abandoned','Interrupted upload marked abandoned');
select ok(exists(select 1 from public.artifact_deletions where storage_path=(select storage_path from public.worker_uploads where id='00000000-0000-4000-8000-00000000e007')),'Storage orphan deletion queued');
select ok(not exists(select 1 from public.artifact_deletions where storage_path=(select storage_path from public.worker_uploads where id='00000000-0000-4000-8000-00000000e006')),'Published artifact is retained');
insert into public.worker_uploads(id,assignment_id,storage_path,sha256,size_bytes) values
 ('00000000-0000-4000-8000-00000000e008',(select id from interrupted),'cascade-interrupted.tpz',repeat('f',64),12);
delete from public.worker_assignments where id=(select id from interrupted);
select ok(exists(select 1 from public.artifact_deletions where storage_path='cascade-interrupted.tpz'),'Cascading assignment deletion preserves orphan cleanup');
select * from finish();
rollback;
