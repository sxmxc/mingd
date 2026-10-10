---
title: "Administration"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/operators/accounts-and-admin.md
---

# Administration

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
| `/admin/workers` | Worker health, capacity, active builds, live compiler cache/container telemetry, and latest-build diagnostics |
| `/admin/metrics` | Build, artifact, queue, daily-statistics, and maintenance metrics |
| `/admin/settings` | Pause new submissions and manage site announcements |

Pages and actions verify current account access. SuperAdmins may inspect builds
and downloads across accounts. Ordinary users retain ownership-only access.
Disabling an account blocks protected pages, submissions, and new downloads but
keeps the account/build records. Existing queued builds continue, and already
issued signed download URLs remain usable until expiry.

Pausing submissions prevents new builds; it does not cancel queued/running work.
Use it to drain jobs before deploying worker/recipe changes. Queue counts reflect
Redis jobs and can include previous attempts; they are not counts of failed
build records. See [deployment](deployment.md#persistence-and-updates) and [maintenance](maintenance.md).

Worker snapshots arrive every 30 seconds, including while idle; the Workers page
refreshes every ten seconds and labels stale readings. Live cache totals belong
to the local worker cache volume, while per-build diagnostics measure that build.
Container resources are not whole-host monitoring. See [worker telemetry](distributed-workers.md#admin-worker-health-and-telemetry).

## Site announcements

Manage up to 10 simultaneous messages at `/admin/settings`, with 500 characters
per message. Add or remove individual messages, then save settings to publish the
list. Blank messages are omitted and identical messages appear once. Stored settings support multiple announcements.

User-facing announcement controls are described in [your account](../users/account.md#site-announcements).

## Account settings and email flows

Account settings and recovery steps are in [the user guide](../users/account.md).

Sign-up, recovery, and secure email changes need SMTP configured in Supabase Auth.
Credentials belong in Auth configuration, not web/browser settings. Set the Auth site
URL/allowed callbacks and configure the three repository email templates using
[Supabase setup](self-hosted-supabase.md). Local Supabase uses its
mail viewer and checked-in `content_path` templates instead.

Token-hash links at `/auth/confirm` verify the email token and set cookies, even
when opened in a different browser. Recovery opens `/account/reset-password`.
`/auth/callback` also supports PKCE exchange using the originating browser.
Set `NEXT_PUBLIC_APP_URL` to the correct app origin and recreate web after changes.
Request fresh emails when configuration changes.

## Queue recovery

Queue reconciliation and attempt ownership are described in
[architecture](../developers/architecture.md#queue-recovery) and
[distributed workers](distributed-workers.md#assignment-and-build-lifecycle).
Use [operator troubleshooting](troubleshooting.md) for stuck jobs.

## Validation and scope

Run [application and SQL checks](../developers/development.md); account SQL coverage lives in
[`account_access.sql`](../../supabase/tests/account_access.sql). Manually check
confirmation, recovery/new-password sign-in, secure email change, profile edits,
sign-out, admin restrictions, disabled access, and submission pause after changing
these flows. Successful CI does not test delivered production email.

No per-user quotas, subscriptions, or billing are implemented.
