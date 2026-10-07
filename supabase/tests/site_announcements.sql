begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

select ok(public.valid_site_announcements('{}'), 'An empty list clears announcements');
select ok(public.valid_site_announcements(array['First notice', 'Second notice']), 'Multiple notices are accepted');
select ok(public.valid_site_announcements(array[repeat('x', 500)]), '500 character messages are accepted');
select ok(not public.valid_site_announcements(array[repeat('x', 501)]), 'Oversized messages are rejected');
select ok(not public.valid_site_announcements(array_fill('Notice'::text, array[11])), 'More than ten notices are rejected');
select ok(not public.valid_site_announcements(array['   ']), 'Blank notices are rejected');
select ok(not public.valid_site_announcements(array[null::text]), 'Null messages are rejected');
select ok(not public.valid_site_announcements(null), 'Null lists are rejected');
select ok(not public.valid_site_announcements(array[['First', 'Second']]), 'Multidimensional lists are rejected');
select ok(not has_table_privilege('authenticated', 'public.site_settings', 'UPDATE'), 'Users cannot publish notices');

set local role service_role;
select lives_ok($$update public.site_settings set announcements = array['First notice', 'Second notice'] where id$$, 'Privileged writer can publish multiple notices');
reset role;
set local role authenticated;
select is((select announcements from public.site_settings where id), array['First notice', 'Second notice'], 'Signed-in users can read all notices under RLS');
reset role;

select * from finish();
rollback;
