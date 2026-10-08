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

After correcting a public URL/key, recreate the frontend:

```bash
docker compose -f compose.web.prod.yml up -d --no-deps --no-build --force-recreate web
```

Use `compose.yml` if you renamed the production file. For host-run development,
restart `npm run dev:web` after editing `apps/web/.env.local`.
Current web images read these values at runtime; older images need an update.
Check DNS/TLS/API reachability from the browser and web container. Never replace
the public key with a privileged key. See
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

In production, the gateway consumes Redis queues on the application host. Remote
workers connect to it over HTTPS with their enrollment tokens. Check both hosts;
remote workers need no Redis or Supabase credentials.

On the application host:

```bash
docker compose -f compose.web.prod.yml ps
docker compose -f compose.web.prod.yml logs --tail=100 worker-gateway
```

Confirm that both gateway enable flags are true and `/healthz` reports
`acceptingAssignments:true`. Check worker last-seen and capacity at `/admin/workers`
or run `npm run workers -- list` from a configured operator checkout.

On the worker host, check the requested target. Desktop handles Linux/Windows;
Web, Android, and macOS use their respective workers:

```bash
docker compose -f compose.workers.prod.yml ps
docker compose -f compose.workers.prod.yml logs --tail=100 builder web-builder
```

For Android or macOS, add the `android` or `macos` profile to these commands and
include that service in the logs command. macOS also needs a verified toolchain
in its image and the same archive digest in application settings, enrollment,
and worker settings. Use `compose.yml` in commands if you renamed the production
file on that host. See [production setup](deployment.md#production-with-only-compose-and-env).

For local development, direct workers consume Redis queues themselves. Check
that web and the worker use the same Redis instance and queue name:

```bash
docker compose ps redis builder
docker compose logs --tail=100 builder
```

The gateway checks for missing queue deliveries every five seconds; direct
workers check every 30 seconds. A Redis outage can leave a recorded submission
waiting for recovery. Queue counts can include earlier failed attempts, so they
may differ from database build counts.

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
that a worker is compatible. Build/publish web and every enabled worker from the
same checkout, then deploy that release using the
[production procedure](deployment.md#production-with-only-compose-and-env) and
submit a new build. Restarting an old image is insufficient.

For macOS, `libBlocksRuntime.so: cannot open shared object file` can occur even
when the library exists in `/opt/osxcross/target/lib`: Godot's SCons environment
does not inherit `LD_LIBRARY_PATH` by default. macOS platform recipe 2 explicitly
imports that variable. Deploy matched web/macOS-worker images and retry; the
operator toolchain archive does not need repackaging for this environment fix.
The preflight now launches both architecture linkers, so missing host dependencies
are detected before compilation.

`Undefined symbols ... ___isPlatformVersionAtLeast` means the macOS availability
helper emitted by Clang cannot be resolved. Verify that the toolchain includes
Darwin compiler-rt's `libclang_rt.osx.a` with both ARM64 and Intel slices in the
bundled Clang resource directory. Linux Clang packages and an Apple SDK alone
do not provide this archive. Follow the
[runtime provisioning and availability probe](recipe-files-and-mobile-templates.md#macos-on-linux),
repackage the toolchain, update its SHA-256, and rebuild web and the macOS worker.
The worker now links an availability probe for both architectures before any
Godot compilation. The changed archive digest invalidates the old cache identity;
the global recipe version does not need a bump for an archive-only repair.

A dry-run archive is not installable. For production, set `BUILDER_DRY_RUN=false`
on the application host and recreate the gateway; remote workers follow its
assignments. For local direct workers, set it in root `.env` and recreate the
affected worker.

## Maintenance says Retry pending, or has no logs

```bash
docker compose -f compose.web.prod.yml logs --tail=100 maintenance
```

For an image update, publish and deploy a matched release using the
[production procedure](deployment.md#production-with-only-compose-and-env).

For local development, omit `-f compose.web.prod.yml`; use `compose.yml` if you
renamed the production file. Maintenance logs startup and failures; idle polls
are quiet. Check container exit state and its Supabase URL/key. For release
refresh, also check
outbound GitHub/archive access and the displayed safe importer reason.

Retries wait 15 minutes and leases last 20 minutes. Requesting a task does not
bypass retry timing. Catalog freshness can update before a subsequent template
measurement fails. Two backend status entries are expected even though there
are six cron schedules. See [maintenance](maintenance.md).

## No template-size comparison appears

Comparison requires exact version/platform/architecture/kind/thread-mode reference
rows and a valid measured binary size. Missing/partial references or dry-run
measurements suppress the claim. Check release-refresh status and reference
coverage; TPZ size is not main-binary size. See [recipes and comparisons](recipes-and-comparisons.md).

## Docker uses a different Node version or old code

Repository commands use Node 24.21.0; Docker images use Node 22. Image-only
production needs no host Node installation. Pulling source or installing host
dependencies does not update existing images. Publish a fresh release and repeat
the production pull/start commands. For source deployments, use the affected
`:build` command from the checkout. Public frontend
settings are read at runtime by current web images; recreate web after changing
them. See [deployment](deployment.md#source-checkout-command-reference).

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

## Distributed-worker connectivity

If NPM returns 502 while gateway localhost `/healthz` succeeds, check its HTTP
upstream host/port 3001 and Docker reachability. Production gateway publication
uses all interfaces; NPM's container loopback is not the application's loopback.
`acceptingAssignments:false` means dispatch is disabled or not ready; enable both
gateway flags only after migration and direct-worker cutover. A 401/409 on worker
polls means rejected enrollment/token or recipe/target/toolchain mismatch.
Malformed or unsupported protocol declarations are rejected too. After the
0.2.1 compatibility migration and code rollout, application release alone does
not invalidate a worker; keep existing token files when updating images.
Use operator `workers -- list`; remote workers never need Redis/Supabase access.

For upload 413/timeouts, check NPM's body/time settings and gateway's fixed 512 MiB
limit. For lease loss, check gateway/worker connectivity and host resource pressure;
workers stop abandoned processes and retries receive fresh identities. Preserve
logs and distinguish structural validation from native runtime acceptance. See
[deployment](deployment.md#distributed-cutover-and-rollback).
