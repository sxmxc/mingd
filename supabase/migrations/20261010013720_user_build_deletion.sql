begin;

grant delete on public.builds to authenticated;
create policy "owners delete finished builds" on public.builds
for delete to authenticated using (
  user_id = (select auth.uid())
  and status in ('complete', 'failed')
  and coalesce((select enabled from public.account_roles where user_id = (select auth.uid())), true)
);

-- Deleting a build removes only its history. Shared artifacts retain their
-- existing maintenance lifecycle; active jobs cannot be deleted by users.
commit;
