begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(17);
select lives_ok(format($sql$insert into public.artifacts(config_hash,storage_path,sha256,size_bytes,godot_version,platform,architecture,template_kinds) values (%L,%L,repeat('a',64),1,'4.7.2',%L,%L,array['release'])$sql$,gen_random_uuid()::text,gen_random_uuid()::text,platform,architecture),platform || '/' || architecture || ' artifact is accepted')
from (values ('linux','x86_64'),('windows','x86_64'),('web','wasm32'),('android','arm64'),('android','arm32'),('android','x86_64'),('android','x86_32'),('macos','arm64'),('macos','x86_64'),('macos','universal')) targets(platform,architecture);
select throws_ok(format($sql$insert into public.artifacts(config_hash,storage_path,sha256,size_bytes,godot_version,platform,architecture,template_kinds) values (%L,%L,repeat('a',64),1,'4.7.2',%L,%L,array['release'])$sql$,gen_random_uuid()::text,gen_random_uuid()::text,platform,architecture),'23514',null,'Reject mismatched target ' || platform || '/' || architecture)
from (values ('android','universal'),('macos','wasm32'),('windows','arm64')) targets(platform,architecture);
select ok((select relrowsecurity from pg_class where oid='public.artifacts'::regclass),'Artifact RLS remains enabled');
select ok((select relrowsecurity from pg_class where oid='public.official_template_references'::regclass),'Reference RLS remains enabled');
select lives_ok($$insert into public.official_template_references(godot_version,platform,architecture,template_kind,web_threads,binary_size_bytes,archive_sha256,source_url) values ('4.7.2','android','arm64','release',false,1,repeat('b',64),'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz')$$,'Android references permit exact native ABI measurements');
select throws_ok($$insert into public.official_template_references(godot_version,platform,architecture,template_kind,web_threads,binary_size_bytes,archive_sha256,source_url) values ('4.7.2','macos','wasm32','release',false,1,repeat('b',64),'https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz')$$,'23514',null,'Reference architecture must match its target');
select * from finish();
rollback;
