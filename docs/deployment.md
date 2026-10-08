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

### Build here, pull on production (GHCR)

All six application images support a shared repository prefix and release tag.
For example, put these values in root `.env` on both hosts:

```dotenv
IMAGE_PREFIX=ghcr.io/sxmxc/mingd
IMAGE_TAG=latest
```

This selects `ghcr.io/sxmxc/mingd/web:latest`,
`maintenance`, `builder`, `web-builder`, `android-builder`, and `macos-builder`
under the same prefix/tag. Redis continues to use `redis:8-alpine`.
Publish both `latest` and a fresh release identifier (for example `v0.1.0`)
for each release, and build all release images from the same checkout.
Keep the Compose checkout on production at that revision.
The build host and production must use compatible Linux CPU architectures;
the current worker toolchains are prepared for Linux x86_64 hosts.

On the build host, authenticate with `docker login ghcr.io`, then:

```bash
npm run images:build
npm run images:publish -- v0.1.0
```

Use `images:build:all` and `images:publish:all -- v0.1.0` to include the optional macOS worker.
Publication tags the configured local images with both the supplied identifier
and `latest`, without rebuilding. It pins the local image IDs and verifies all
selected images exist before tagging or pushing. All release tags are pushed
before any `latest` aliases are promoted. If a release push fails, `latest`
is not promoted remotely. Updates across repositories are not atomic: if promotion fails
partway through, use the complete release identifier on production or rerun
publication from the same local images to finish promotion.
The existing `images:push` / `images:push:all` commands still push only `IMAGE_TAG`.
Build commands do not start services. Push commands upload only application
images and fail on registry errors. They use Docker's existing login; do not
put the PAT in `.env`, build arguments, or images. GHCR requires a classic PAT
with `write:packages` for publishing. New packages default to private; manage
their permissions in GitHub. See [GHCR authentication and publishing](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
Keep the macOS toolchain image private: it includes the operator-supplied Apple SDK.

The web image reads app/Supabase URLs and keys from the container environment
at runtime. It can be built locally and deployed with different production
settings, without URL/key build arguments. Set the appropriate values in each
host's environment files; see [configuration](configuration.md#environment-files).
Privileged Supabase keys remain server-only runtime configuration. For macOS, production's
`MACOS_TOOLCHAIN_SHA256` must match the archive used to build the published image
and the web service's runtime setting. The provisioned SDK archive is needed
only on the build host, not on the production machine pulling that image.

If the images were already built using the default local names, they can be
tagged into the configured GHCR namespace without rebuilding. Only do this for images known to belong
to the same release. Older web images predating runtime configuration still need
their intended public settings at build time. For example:

```bash
docker tag mingd/macos-builder:latest ghcr.io/sxmxc/mingd/macos-builder:latest
```

Repeat for each application service being released, then run
`npm run images:publish:all -- v0.1.0` (or omit `:all` without macOS).
Subsequent builds can use `IMAGE_PREFIX`/`IMAGE_TAG` directly and the npm commands above.

On production, configure the same prefix and the production runtime `.env`.
Use `IMAGE_TAG=latest` to follow the latest published images, or
`IMAGE_TAG=v0.1.0` to pin that release for repeatable deployment and rollback.
Authenticate with `docker login ghcr.io` using a classic PAT with `read:packages`
if the packages are private. Review/apply migrations, then:

```bash
npm run images:pull
npm run images:up
```

Use `images:pull:all` and `images:up:all` when macOS is enabled. Pull completes
before services are changed. Up uses `--no-build --pull never`, so missing images
cause an error instead of a production build or an implicit registry fetch.
The commands start web, Redis, maintenance, and the enabled workers, preserving
named volumes. Follow the queue-draining and smoke-test steps under
[Updating](#updating). The existing `compose:*:build` commands still build on
the machine where they run; use the `images:*` production commands for this workflow.

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
| `npm run images:build` / `images:push` | Build or publish web, maintenance, desktop/Web/Android workers |
| `npm run images:pull` / `images:up` | Pull the configured release, then start with building and implicit pulls disabled |
| `npm run images:build:all` / `images:push:all` | Build or publish all six application images, including macOS |
| `npm run images:publish -- <release>` / `images:publish:all -- <release>` | Publish the built images under both a release identifier and `latest`; `:all` includes macOS |
| `npm run images:pull:all` / `images:up:all` | Pull/start the configured release with both worker profiles |

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

Apply migrations, rebuild the affected services or pull the published release
using the [registry workflow](#build-here-pull-on-production-ghcr), and check logs/admin metrics.
Recreate web after any deployment URL/key change. Rebuild maintenance when its source
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
For registry deployments, retain the prior release tag and matching macOS
toolchain digest. Set `IMAGE_TAG` back to that release, restore its compatible
configuration, and repeat the pull/up steps after reviewing migration compatibility.
Pulling older code does not undo SQL; use a reviewed forward correction or tested
restore when necessary.

Monitor disk, whole-container memory, queue latency, build failures, maintenance
errors, and database/Storage capacity. Scheduled cleanup does not prune local
compiler/source caches or arbitrary Storage objects; see [maintenance](maintenance.md)
and [performance](performance.md).
