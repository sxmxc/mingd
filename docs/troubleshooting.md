# Troubleshooting

Start with the affected process and its configuration. The app and the separate
Supabase installation have different Compose files and environment settings.
Do not paste keys, database URIs, recovery tokens, or full private environment
output into issue reports.

## Sign-in or recovery returns “Unauthorized” / invalid JSON

A plain `Unauthorized` response from the API gateway can surface as a JSON parse
error. Check that `NEXT_PUBLIC_SUPABASE_URL` reaches the intended API gateway and
that the public key belongs to that installation and is supported by its gateway.
A response from a proxy's own authentication layer is not an Auth API response.

After correcting a public URL/key, rebuild the frontend:

```bash
npm run compose:web:build
```

Recreating an existing image only changes runtime values; public settings are
embedded at build time. Check DNS/TLS/API reachability from both the browser and
web container. Never replace the public key with a privileged key. See
[configuration](configuration.md) and
[Supabase debugging guidance](https://supabase.com/docs/guides/monitoring-and-debugging).

## Password-reset email opens Supabase instead of the app

On the Supabase server, verify `SITE_URL`, allowed redirects, and the recovery
HTML URL. This repo's local `config.toml` does not configure that deployment.
Follow [self-hosted email setup](self-hosted-supabase.md#smtp-and-application-email-templates)
and request a new email. Old emails keep old links.

The repository recovery template points at the app's `/auth/confirm`, then
`/account/reset-password`. A default `/auth/v1/verify` link is normal, but a
`redirect_to` pointing at the API origin suggests wrong Auth URL configuration or
fallback templates. An expired/used token requires a fresh email; a PKCE link
also needs its originating browser.

## A build stays queued

Check that the correct worker is started and consuming the same Redis instance
and queue name as web. Linux/Windows use `builder`; Web and Android have their
own workers. macOS is optional and needs a verified SDK archive/digest.

```bash
npm run compose:ps
npm run compose:builders:logs
```

A default `npm run compose:build` starts web/Redis/maintenance without workers
unless profiles are enabled. For all non-macOS services with rebuild:

```bash
docker compose --profile builder up -d --build
```

Workers reconcile durable unfinished builds every 30 seconds. A Redis outage can
leave a database submission waiting for that recovery. Queue counts and build
counts differ: retained failed queue jobs may include earlier attempts. Check
worker API connectivity as well as Redis.

## A build is stale or failed

Read its recorded error, heartbeat, output timestamp, and stage. Heartbeats under
45 seconds old show recent worker activity, not compiler progress; linking can
be quiet. Cron's five-minute stale flag is diagnostic and does not restart jobs.

Check compiler/worker logs, container memory/disk, source download integrity,
compile timeout, and queue recovery. A recipe/hash mismatch usually means web
and workers are from incompatible revisions. Drain jobs and deploy matched
revisions; do not remove integrity guards. Exhausted builds can be resubmitted
through the visible retry action.

`Build configuration hash does not match the queued payload` occurs before
compilation. Even a valid Lean 2D/Lean 3D recipe fails when the submitting web
image and worker disagree on recipe version, normalization, source identity or
macOS toolchain digest. A successful cached Standard request does not establish
that a worker is compatible. Rebuild web and every enabled worker from the same
checkout using the [deployment procedure](deployment.md#command-reference),
then submit a new build. Pulling code or restarting an old image is insufficient.

For macOS, `libBlocksRuntime.so: cannot open shared object file` can occur even
when the library exists in `/opt/osxcross/target/lib`: Godot's SCons environment
does not inherit `LD_LIBRARY_PATH` by default. macOS platform recipe 2 explicitly
imports that variable. Deploy matched web/macOS-worker images and retry; the
operator toolchain archive does not need repackaging for this environment fix.
The preflight now launches both architecture linkers, so missing host dependencies
are detected before compilation.

A dry-run archive is not installable. Confirm `BUILDER_DRY_RUN=false` and rebuild/
recreate the worker if its environment changed.

## Maintenance says Retry pending, or has no logs

```bash
npm run compose:maintenance:build
npm run compose:maintenance:logs
```

The current worker emits a startup message and safe failure reasons; idle polls
are quiet. Older images may have lacked those diagnostics. Check container exit
state and that worker URL/key reach Supabase. For release refresh, also check
outbound GitHub/archive access and the displayed safe importer reason.

Retries wait 15 minutes and leases last 20 minutes. Requesting a task does not
bypass retry timing. Catalog freshness can update before a subsequent template
measurement fails. Two backend status entries are expected even though there
are five cron schedules. See [maintenance](maintenance.md).

## No template-size comparison appears

Comparison requires exact version/platform/architecture/kind/thread-mode reference
rows and a valid measured binary size. Missing/partial references or dry-run
measurements suppress the claim. Check release-refresh status and reference
coverage; TPZ size is not main-binary size. See [recipes and comparisons](recipes-and-comparisons.md).

## Docker uses a different Node version or old code

Host Node 24.21.0 and Docker Node 22 are separate runtimes. Pulling source or
installing host dependencies does not update existing images. Use the affected
`:build` command; `compose:up:builders` does not force rebuilding. Public frontend
settings require a web rebuild. See [deployment](deployment.md#command-reference).

## Checks fail on a fresh checkout

Run `npm ci` with `.nvmrc`, then generate route types before typechecking:

```bash
npm exec --workspace @mingd/web -- next typegen
npm run typecheck
npm test
```

Builder archive tests need `zip`, `unzip`, and Python 3; compiler integration checks
skip absent tools unless explicitly opted in. SQL tests need a disposable local
Supabase database. See [development and validation](development.md).

If moving the checkout appears to lose data, check the Compose project name and
local Supabase project ID before creating new volumes or resetting anything.
See [naming](naming.md#infrastructure-identities).
