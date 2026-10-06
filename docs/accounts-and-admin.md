# Accounts and administration

Apply `20261005234530_accounts_and_admin.sql` before starting the updated web app.
The migration adds account access, site settings and administrative metrics. It
does not assign an administrator or change existing users' access.

## Initial SuperAdmin

For the self-hosted rollout, use the root `.env` database connection and run:

```sh
npm run db:migrate:check
npm run db:migrate
```

Then rebuild the web image and both worker images. Restart workers when current
builds have finished; a forced stop interrupts the running compiler. Keep SMTP
configuration separate from application deployment.

Once your account has a confirmed email address, run from the repository root:

```sh
node scripts/grant-superadmin.mjs voidmoose@voidmoose.com
```

This reads the root `.env` Supabase URL and privileged key. It finds the existing
account by exact email and enables its SuperAdmin role. It does not create an
account or send email. Additional administrators can be assigned in `/admin/users`.
Normal signed-in users have the `authenticated` application role by default.
Roles live in `account_roles`, never editable user metadata.

The admin area provides active/all/completed/failed build lists, user access and
role management, build/artifact/queue metrics, a new-submission pause and a site
announcement. Each page and action checks current account access. You cannot
disable or demote yourself. Disabling an account blocks application pages, build
submission and downloads; it retains the account and its build records. Existing
queued builds continue, and already issued signed download URLs expire normally.

## Account emails

SMTP configuration is deferred to the Supabase host. Sign-up confirmations,
password recovery and email changes require working delivery there. No SMTP
credentials belong in the web app or browser environment.

On your self-hosted Supabase Auth service, set the site URL to the public app URL,
allow its `/auth/callback` redirect, enable email confirmations and secure email
changes, and configure your chosen SMTP provider. Install the three templates
in `supabase/templates/` using your host's Auth email-template configuration.
They use a token hash at `/auth/confirm`, so links can be opened in another browser.
The SDK callback also supports same-browser PKCE links at `/auth/callback`.
For self-hosted Docker configuration, see the official
[Auth settings](https://supabase.com/docs/guides/self-hosting/auth/config) and
[SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).

`NEXT_PUBLIC_APP_URL` must match the public app URL in both root `.env` (Docker)
and `apps/web/.env.local` (Next development). Local Supabase uses the checked-in
templates and its local mail viewer; no external SMTP provider is needed locally.

Users can change their display name, email and password at `/account`. Gravatar
uses the SHA-256 hash of the normalized email address, with a neutral fallback.
Users can disable Gravatar in their profile; no image upload or API key is needed.

## Queue recovery

The database's queued build row is the durable submission record. Workers scan
unfinished builds every 30 seconds and enqueue missing jobs with the original
build ID. Redis connection failures do not discard a submitted build. BullMQ
recovers stalled jobs after a worker interruption; ordinary failures receive one
automatic retry. An exhausted or inconsistent queue job becomes a failed build
with a visible retry action, which creates a new build using the same recipe.

Each delivery uses its own workspace. Uploads include a content digest and
artifact cache inserts preserve the first committed result. A late attempt
cannot move a completed build back into a working or failed state.

No per-user quotas, subscription tiers or billing are added in this milestone.

## Validation

Use a disposable local Supabase project when running `db reset`; the command
removes that project's data. After reset, run `npx supabase test db --local`.
`supabase/tests/account_access.sql` checks role grants, ownership, disabled users,
admin reads and protection against self-demotion. Run `npm run typecheck` and
`npm test` for the application and worker checks.

The implementation was validated with all migrations in an isolated Supabase
stack, 17 pgTAP permission checks and database advisors reporting no issues. The
repository suite passed 40 tests; four toolchain/source opt-in checks were skipped.
The production web image built successfully. Browser checks covered sign-up,
confirmation, recovery/new-password sign-in, both email-change confirmations,
profile/Gravatar edits, sign-out, admin-only pages, access suspension, submission
pause and layouts at 390px and desktop widths. A separate test Redis queue and
dry-run cache fixture verified missing-job reconciliation and duplicate delivery.
These checks did not apply migrations or assign roles on the hosted Supabase.
