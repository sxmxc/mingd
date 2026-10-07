begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select is((select count(*) from cron.job where jobname like 'mingd-%'), 5::bigint, 'Five maintenance jobs registered');
select is((select schedule from cron.job where jobname = 'mingd-detect-stalled-builds'), '*/5 * * * *', 'Stall detection runs every five minutes');
select ok(not has_table_privilege(role_name, table_name, 'SELECT'), role_name || ' cannot read ' || table_name)
from unnest(array['anon','authenticated']) roles(role_name)
cross join unnest(array['public.maintenance_tasks','public.build_statistics_daily','public.artifact_deletions','public.official_release_catalog']) tables(table_name);
select ok(not has_function_privilege(role_name, function_name, 'EXECUTE'), role_name || ' cannot invoke ' || function_name)
from unnest(array['anon','authenticated']) roles(role_name)
cross join unnest(array['public.detect_stalled_builds()','public.prune_build_logs()','public.snapshot_build_statistics()', 'public.request_maintenance(text)', 'public.claim_maintenance()', 'public.retire_unused_artifacts()']) functions(function_name);

insert into auth.users(id) values ('00000000-0000-0000-0000-00000000c001'), ('00000000-0000-0000-0000-00000000c002');
insert into public.artifacts(id, config_hash, storage_path, sha256, size_bytes, godot_version, platform, architecture, template_kinds, created_at) values
('00000000-0000-0000-0000-00000000a001', 'orphan', 'old-orphan.zip', repeat('a',64), 1, '4.7.2','linux','x86_64',array['release'],now()-interval '100 days'),
('00000000-0000-0000-0000-00000000a002', 'shared', 'shared.zip', repeat('a',64), 1, '4.7.2','linux','x86_64',array['release'],now()-interval '100 days'),
('00000000-0000-0000-0000-00000000a003', 'active', 'active.zip', repeat('a',64), 1, '4.7.2','linux','x86_64',array['release'],now()-interval '100 days'),
('00000000-0000-0000-0000-00000000a004', 'recent', 'recent.zip', repeat('a',64), 1, '4.7.2','linux','x86_64',array['release'],now());
insert into public.builds(id,user_id,artifact_id,config_hash,config,status,heartbeat_at,created_at,completed_at,started_at,log_tail,performance_metrics) values
('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000a002','shared','{}','complete',null,now()-interval '100 days',now()-interval '100 days',null,'old log',null),
('00000000-0000-0000-0000-00000000b002','00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000a002','shared','{}','complete',null,now()-interval '100 days',now()-interval '100 days',null,'old log',null),
('00000000-0000-0000-0000-00000000b003','00000000-0000-0000-0000-00000000c002',null,'active','{}','compiling',now()-interval '10 minutes',now()-interval '1 hour',null,null,'active log',null),
('00000000-0000-0000-0000-00000000b004','00000000-0000-0000-0000-00000000c002',null,'queued','{}','queued',null,now()-interval '10 minutes',null,null,null,null),
('00000000-0000-0000-0000-00000000b005','00000000-0000-0000-0000-00000000c002',null,'stats','{}','complete',null,now()-interval '1 day',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' - interval '1 hour',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' - interval '1 hour 2 minutes','recent log','{"artifactCacheHit":false,"stageDurationsMs":{"compiling":60000}}');
select public.detect_stalled_builds();
select ok((select stalled_at is not null from public.builds where config_hash='active'), 'Stale worker heartbeat is flagged');
select ok((select status='compiling' from public.builds where config_hash='active'), 'Detection does not change build state');
select ok((select stalled_at is not null from public.builds where config_hash='queued'), 'Long queued wait is flagged');
update public.builds set heartbeat_at=now() where config_hash='active';
update public.builds set status='failed' where config_hash='queued';
select public.detect_stalled_builds();
select ok((select stalled_at is null from public.builds where config_hash='active'), 'Resumed heartbeat clears flag');
select ok((select stalled_at is null from public.builds where config_hash='queued'), 'Terminal state clears flag');
select public.prune_build_logs();
select ok(not exists(select 1 from public.builds where config_hash='shared' and log_tail is not null), 'Old terminal log tails pruned');
select is((select log_tail from public.builds where config_hash='active'),'active log','Active logs retained');
select is((select log_tail from public.builds where config_hash='stats'),'recent log','Recent terminal logs retained');
select public.snapshot_build_statistics();
select is((select complete from public.build_statistics_daily where day=(now() at time zone 'UTC')::date-1),1::bigint,'Yesterday includes completed build');
select is((select average_build_seconds from public.build_statistics_daily where day=(now() at time zone 'UTC')::date-1),120::numeric,'Successful duration is measured');
select is((select average_compile_seconds from public.build_statistics_daily where day=(now() at time zone 'UTC')::date-1),60::numeric,'Compile duration uses worker metric');
select public.snapshot_build_statistics();
select is((select count(*) from public.build_statistics_daily),7::bigint,'Snapshot upsert is idempotent');

select is(public.retire_unused_artifacts(),1,'Only old unreferenced artifact is retired');
select ok(exists(select 1 from public.artifact_deletions where storage_path='old-orphan.zip'),'Deletion work persisted');
select ok(exists(select 1 from public.artifacts where config_hash='active'),'Active cache key protected');
select ok(exists(select 1 from public.artifacts where config_hash='recent'),'Recent orphan protected');
delete from auth.users where id='00000000-0000-0000-0000-00000000c001';
select is(public.retire_unused_artifacts(),0,'Another user still owns a reference to shared artifact');
delete from public.builds where config_hash='shared';
select is(public.retire_unused_artifacts(),1,'Shared artifact retires once all references are gone');
select throws_ok($$insert into public.artifacts(config_hash,storage_path,sha256,size_bytes,godot_version,platform,architecture,template_kinds) values ('reuse','old-orphan.zip',repeat('a',64),1,'4.7.2','linux','x86_64',array['release'])$$,'P0001','Artifact storage path has been retired','Retired path cannot be reused');
update public.artifact_deletions set deleted_at=now() where storage_path='old-orphan.zip';
select throws_ok($$insert into public.artifacts(config_hash,storage_path,sha256,size_bytes,godot_version,platform,architecture,template_kinds) values ('reuse','old-orphan.zip',repeat('a',64),1,'4.7.2','linux','x86_64',array['release'])$$,'P0001','Artifact storage path has been retired','Completed tombstone still protects path');

set local role service_role;
select lives_ok($$select public.request_maintenance('artifact_cleanup')$$,'Backend can request maintenance');
create temporary table claimed as select * from public.claim_maintenance();
select is((select count(*) from claimed),1::bigint,'Backend claims one task');
select ok((select lease_until>now() and lease_token is not null from claimed),'Claim has bounded lease');
reset role;
update public.maintenance_tasks set requested=false where name not in (select name from claimed);
select is((select count(*) from public.claim_maintenance()),0::bigint,'Running task cannot be claimed again');
update public.maintenance_tasks set lease_until=now()-interval '1 minute' where name in(select name from claimed);
select is((select count(*) from public.claim_maintenance()),1::bigint,'Expired lease is recovered');
select * from finish();
rollback;
