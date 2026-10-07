# Deploying and updating min.gd

This guide assumes a dedicated application server and separately installed
self-hosted Supabase. Commands run in the min.gd checkout unless stated otherwise.

## Services and prerequisites

Install Docker with Compose v2, Git, and Node 24.21.0/npm for operator commands.
Container runtimes currently use Node 22 independently of the host version.

| Service | Starts by default? | Purpose |
| --- | --- | --- |
| `web` | Yes | Next.js frontend and authorized routes |
| `redis` | Yes | Persistent queues; host port binds to loopback |
| `maintenance` | Yes | Postgres task polling, references, artifact deletion |
| `builder` | `builder` profile | Linux/Windows compilation |
| `web-builder` | `builder` profile | Web compilation |
| `android-builder` | `builder` profile | Android compilation |
| `macos-builder` | `macos-builder` profile | Optional cross-compilation with provisioned SDK/toolchain |

Supabase and the HTTPS reverse proxy run separately. Provision Auth, Postgres,
Storage, API gateway, and SMTP using [self-hosted Supabase](self-hosted-supabase.md).
Realtime is optional because the build monitor polls.

## First deployment

1. Clone the repository and run `npm ci`. With nvm, run `nvm install` and `nvm use` first.
2. Copy `.env.example` to `.env` and replace placeholders using
   [configuration](configuration.md). Set app/API origins, public and privileged
   keys, worker API URL, and the private database URI.
3. Configure the HTTPS reverse proxy to send the app hostname to the web service's
   host port. Preserve the client-facing Host and forward protocol information.
   Set `NEXT_PUBLIC_APP_URL` to the public app origin. Confirm API reachability.
4. Review/apply migrations and build/start services as below.
5. Confirm sign-up, sign-in, and recovery, grant the first admin role, and run a
   build/download/export [smoke test](smoke-tests.md).

Example origins are `https://mingd.example.com` and `https://supabase.example.com`.
Use your own DNS/certificates. The owner reports the deployment at
`https://mingd.voidmoose.net` works over HTTPS on a private network, including
password recovery; this does not establish internet access or every platform's
runtime acceptance.

### Database migrations

Set `SUPABASE_DB_URL` in root `.env` or exported environment. It is a percent-encoded
PostgreSQL connection URI, not an HTTP URL. Confirm the target host/database and
back up relevant data before applying migrations.

```bash
npm run db:status
npm run db:migrate:check
npm run db:migrate
```

Scripts connect with `--db-url` and skip Vault synchronization; no Cloud project
link is needed. Dry-run lists pending migrations without executing SQL; it does
not prove they will succeed. Recheck `npm run db:status` afterward. Never reset
production for deployment.

Migrations create application tables, RLS, private Storage, and cron schedules.
Keep deployed history intact and add future changes as new migrations. Run from
an authorized host rather than exposing Postgres publicly for migration access.

### Build and start

```bash
docker compose --profile builder up -d --build
npm run compose:ps
```

This starts web, Redis, maintenance, desktop, Web, and Android. With a verified
[macOS toolchain](recipe-files-and-mobile-templates.md#macos-on-linux), use:

```bash
docker compose --profile builder --profile macos-builder up -d --build
```

## Command reference

| Command | Effect |
| --- | --- |
| `npm run compose:build` | Build/start default web, maintenance, Redis; workers need enabled profiles |
| `npm run compose:up` | Start defaults from existing images |
| `npm run compose:up:builders` | Start defaults plus desktop/Web/Android profile; no forced rebuild |
| `npm run compose:builders:build` | Build/start only desktop/Web/Android and Redis dependency |
| `npm run compose:web:build` | Rebuild frontend and start Redis dependency |
| `npm run compose:maintenance:build` | Rebuild maintenance |
| `npm run compose:builder:build` | Rebuild Linux/Windows worker and start Redis dependency |
| `npm run compose:web-builder:build` | Rebuild Web worker and start Redis dependency |
| `npm run compose:android-builder:build` | Rebuild Android worker and start Redis dependency |
| `npm run compose:macos-builder:build` | Rebuild optional macOS worker and start Redis dependency |
| `npm run compose:logs` | Follow service logs |
| `npm run compose:maintenance:logs` | Follow maintenance logs |
| `npm run compose:down:all` | Stop/remove services across both profiles, preserving volumes |

Commands without `:build` use existing images. Explicit service targets can start
profiled services without enabling profiles. An exported `COMPOSE_PROFILES` also
changes what default commands start.

## Updating

Pull a revision whose [CI](ci.md) checks pass into a clean checkout and run
`npm ci` to synchronize operator scripts and CLI dependencies. Review changes
and pending migrations before applying them.

For worker/build-recipe updates, pause new submissions in `/admin/settings` and
let queued/active jobs finish. Stopping workers interrupts compilers. Deploy web
and affected workers from the same revision: recipe/hash guards reject
incompatible jobs. Old artifacts remain downloadable but are not reused by a
new recipe identity.

Apply migrations, rebuild the affected services, and check logs/admin metrics.
Rebuild web after any `NEXT_PUBLIC_*` change. Rebuild maintenance when its source
or importer changes. Resume submissions after checking a build/private download
and relevant email flows. CI does not deploy or migrate production.

The web health check tests `/login`; it does not test Supabase, queues, or workers.

## Persistence and rollback

Back up Postgres and Storage together, plus required deployment configuration
and credentials through your secret-management process. Redis uses an append-only
named volume. Workers have source/compiler/workspace volumes. Caches can be
rebuilt; database records and artifacts are user data. Test restores away from
production.

Keep the Compose project name stable when moving a checkout to retain its volumes.
Do not use `docker compose down -v` during updates. See
[naming](naming.md#infrastructure-identities).

Retain the prior revision/configuration for rollback. Verify compatibility with
already-applied migrations and worker recipes before restoring older code.
Pulling older code does not undo SQL; use a reviewed forward correction or tested
restore when necessary.

Monitor disk, whole-container memory, queue latency, build failures, maintenance
errors, and database/Storage capacity. Scheduled cleanup does not prune local
compiler/source caches or arbitrary Storage objects; see [maintenance](maintenance.md)
and [performance](performance.md).
