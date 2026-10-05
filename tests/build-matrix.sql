-- Run against a disposable, migrated Supabase database. All fixture data rolls back.
begin;
insert into public.artifacts (config_hash, storage_path, sha256, size_bytes, godot_version, platform, architecture, template_kinds)
values ('matrix-test-linux', 'matrix-test-linux', repeat('a', 64), 1, '4.7.2', 'linux', 'x86_64', array['release']),
       ('matrix-test-web', 'matrix-test-web', repeat('b', 64), 1, '4.6.3', 'web', 'wasm32', array['debug','release']);
do $$
begin
  begin
    insert into public.artifacts (config_hash, storage_path, sha256, size_bytes, godot_version, platform, architecture, template_kinds)
    values ('matrix-invalid', 'matrix-invalid', repeat('a', 64), 1, '4.7.2', 'web', 'x86_64', array['release']);
    raise exception 'Web x86_64 must be rejected';
  exception when check_violation then null;
  end;
  begin
    insert into public.artifacts (config_hash, storage_path, sha256, size_bytes, godot_version, platform, architecture, template_kinds)
    values ('matrix-invalid', 'matrix-invalid', repeat('a', 64), 1, '4.7.2', 'windows', 'wasm32', array['release']);
    raise exception 'Desktop wasm32 must be rejected';
  exception when check_violation then null;
  end;
end $$;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
insert into public.builds (user_id, config_hash, config)
values ('00000000-0000-0000-0000-000000000001', 'matrix-owner-one', '{}'),
       ('00000000-0000-0000-0000-000000000002', 'matrix-owner-two', '{}');
-- Simulate the Data API grants in this disposable fixture; RLS still controls rows.
grant usage on schema public to authenticated;
grant select on public.builds, public.artifacts to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
begin
  if (select count(*) from public.builds where config_hash like 'matrix-owner-%') <> 1 then
    raise exception 'Build ownership RLS was not preserved';
  end if;
  if (select count(*) from public.artifacts where config_hash like 'matrix-test-%') <> 0 then
    raise exception 'Artifacts must remain server-only';
  end if;
end $$;
reset role;
rollback;
