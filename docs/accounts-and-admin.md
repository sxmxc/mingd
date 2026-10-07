# Accounts and administration

The app uses Supabase Auth with cookie-backed sessions. Normal accounts have
application role `authenticated`; SuperAdmin access lives in protected
`account_roles`, never user-editable metadata. Apply all migrations before
starting the current application; see [deployment](deployment.md).

## Initial SuperAdmin

Create an account and confirm its email first. From the repository root, with
the intended Supabase URL and privileged key in root `.env`:

```bash
node scripts/grant-superadmin.mjs admin@example.com
```

Replace the example email with the existing confirmed account. The script finds
that exact email and enables its SuperAdmin role; it does not create an account
or send email. It prefers `NEXT_PUBLIC_SUPABASE_URL` over `SUPABASE_URL` when both
are set. Check that URL and key point to the intended installation.

Additional administrators can be assigned through `/admin/users`. The application
blocks self-disable/self-demotion through its admin controls.

## Admin controls

| Page | Purpose |
| --- | --- |
| `/admin` | Active/all/completed/failed builds and individual inspection |
| `/admin/users` | Enable/disable accounts and manage application roles |
| `/admin/metrics` | Build, artifact, queue, daily-statistics, and maintenance metrics |
| `/admin/settings` | Pause new submissions and set a site announcement |

Pages and actions verify current account access. SuperAdmins may inspect builds
and downloads across accounts. Ordinary users retain ownership-only access.
Disabling an account blocks protected pages, submissions, and new downloads but
keeps the account/build records. Existing queued builds continue, and already
issued signed download URLs remain usable until expiry.

Pausing submissions prevents new builds; it does not cancel queued/running work.
Use it to drain jobs before deploying worker/recipe changes. Queue counts reflect
Redis jobs and can include previous attempts; they are not counts of failed
build records. See [deployment](deployment.md#updating) and [maintenance](maintenance.md).

## Account settings and email flows

Users can update display name, email, and password at `/account`. Gravatar uses
the normalized email's SHA-256 with a neutral fallback. It can be disabled in
profile settings; no upload or API key is required.

Sign-up, recovery, and secure email changes need SMTP on the separate Supabase
server. Credentials belong there, not in web/browser settings. Set the Auth site
URL/allowed callbacks and serve the three repository email templates using
[self-hosted Supabase setup](self-hosted-supabase.md). Local Supabase uses its
mail viewer and checked-in `content_path` templates instead.

Token-hash links at `/auth/confirm` verify the email token and set cookies, even
when opened in a different browser. Recovery opens `/account/reset-password`.
`/auth/callback` also supports PKCE exchange using the originating browser.
Set `NEXT_PUBLIC_APP_URL` to the correct app origin and rebuild web after changes.
Request fresh emails when configuration changes.

## Queue recovery

A queued database build is the durable submission record. Workers scan unfinished
builds every 30 seconds and enqueue missing deliveries with the original build
ID. Redis failure does not discard that record. BullMQ recovers stalled jobs;
ordinary failures have two total attempts with exponential backoff. Exhausted
or inconsistent jobs become failed builds with a retry action that submits a
new build using the same recipe.

Each delivery has an isolated attempt workspace. Upload identities include the
content digest, and artifact cache insertion preserves the first committed
result. Late attempts cannot regress a completed build to working/failed state.
Keep workers and web on compatible recipe revisions.

## Validation and scope

Run [application and SQL checks](development.md); account SQL coverage lives in
[`account_access.sql`](../supabase/tests/account_access.sql). Manually check
confirmation, recovery/new-password sign-in, secure email change, profile edits,
sign-out, admin restrictions, disabled access, and submission pause after changing
these flows. Successful CI does not test delivered production email.

No per-user quotas, subscriptions, or billing are implemented.
