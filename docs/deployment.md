# Deploying and updating min.gd

This guide assumes a dedicated application server and separately installed
self-hosted Supabase. Production can run published images with only `compose.yml`
and `.env` in a deployment directory. Build/publish and database operator commands
run from a matching repository checkout on a separate authorized host.

## Services and prerequisites

The production application host needs Docker with Compose v2 and registry access.
Git and Node/npm are needed on the build/migration host, not on an image-only
production host. Use Node 24.21.0 from `.nvmrc` for repository operator commands;
container runtimes currently use Node 22 independently of the host version.

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

1. Prepare a build/migration checkout for the release and run `npm ci`. With nvm,
   run `nvm install` and `nvm use` first. Build/publish the release as described
   [below](#build-here-pull-on-production-ghcr).
2. On production, create a deployment directory and copy `compose.yml` from that
   release and `.env.example` as `.env`. Replace placeholders using
   [configuration](configuration.md). Set app/API origins, public and privileged
   keys and worker API URL. Set the private database URI on the authorized
   migration host; the application containers do not use it.
3. Configure the HTTPS reverse proxy to send the app hostname to the web service's
   host port. Preserve the client-facing Host and forward protocol information.
   Set `NEXT_PUBLIC_APP_URL` to the public app origin. Confirm API reachability.
4. Review/apply migrations from the authorized checkout, then
   [pull/start production images](#production-with-only-compose-and-env).
5. Confirm sign-up, sign-in, and recovery, grant the first admin role, and run a
   build/download/export [smoke test](smoke-tests.md).

Example origins are `https://mingd.example.com` and `https://supabase.example.com`.
Use your own DNS/certificates. The owner reports the deployment at
`https://mingd.voidmoose.net` works over HTTPS on a private network, including
password recovery; this does not establish internet access or every platform's
runtime acceptance.

### Database migrations

Run these commands from the matching repository checkout on an authorized
migration host with database access. They do not run from the two-file production
directory. Set `SUPABASE_DB_URL` in that checkout's root `.env` or exported
environment. It is a percent-encoded PostgreSQL connection URI, not an HTTP URL. Confirm the target host/database and
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

### Build and start from source (alternative)

This workflow requires the full checkout and toolchains on the machine running
the build. For image-only production, use the registry workflow below.

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
Copy `compose.yml` from that same revision to production. A full checkout is
optional there; retain the release identifier and matching configuration.
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
Each application Dockerfile sets
`org.opencontainers.image.source=https://github.com/sxmxc/mingd` so locally
published images can be linked to that repository. Builder variants inherit the
label from the desktop stage. Rebuild older images to include it.
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

### Production with only Compose and .env

Keep these two files in a stable deployment directory, for example `/opt/mingd`:

```text
/opt/mingd/
  compose.yml
  .env
```

No source checkout, npm installation, Dockerfiles, or macOS toolchain archive is
required on this application host. Supabase and the HTTPS reverse proxy still
run separately. Docker stores Redis and worker data in named volumes outside
this directory.

Set the production runtime URLs/keys and worker settings in `.env`, plus:

```dotenv
IMAGE_PREFIX=ghcr.io/sxmxc/mingd
IMAGE_TAG=v0.1.0
```

Use the release you published. A release identifier keeps all services on the
same release and supports rollback; `IMAGE_TAG=latest` is also supported. With
macOS enabled, keep `MACOS_TOOLCHAIN_SHA256` equal to the digest used to build
that release. `WEB_PORT` is optional and defaults to `3000`. No
`apps/web/.env.local` is needed on production.

If moving an existing deployment, preserve its Compose project name before
starting from the new directory; see [persistence](#persistence-and-rollback).
Run the following from the deployment directory after applying migrations:

```bash
docker login ghcr.io
docker compose --profile builder --profile macos-builder config --quiet
docker compose --profile builder --profile macos-builder pull
docker compose --profile builder --profile macos-builder up -d --no-build --pull never
docker compose --profile builder --profile macos-builder ps
docker compose --profile builder --profile macos-builder logs --tail=100
```

For private packages, authenticate with a classic PAT with `read:packages`.
Keep the token in Docker's login credentials, not `.env`. Omit
`--profile macos-builder` from every command if macOS is disabled. The `builder`
profile enables desktop, Web, and Android workers; web, maintenance, and Redis
start by default.

Pull completes before services are changed. Up uses `--no-build --pull never`,
so missing images cause an error instead of a production build or an implicit
registry fetch. The `build:` entries can remain in `compose.yml`; these commands
use its `image:` entries. Check logs and run the application
[smoke tests](smoke-tests.md), including a build and private download.

With a full checkout, `npm run images:pull:all` and `npm run images:up:all` wrap
the same pull/start commands; omit `:all` without macOS. npm scripts require
`package.json` and are unavailable in the two-file production directory.
The existing `compose:*:build` commands build on the machine where they run.

## Command reference

These npm commands require a repository checkout. For a two-file production
directory, use the direct Docker commands above.

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

On the build/migration host, prepare a revision whose [CI](ci.md) checks pass
and run `npm ci` to synchronize operator scripts and CLI dependencies. Review
changes and pending migrations. Build/publish a fresh release identifier; retain
the previous production release and configuration for rollback.

For worker/build-recipe updates, pause new submissions in `/admin/settings` and
let queued/active jobs finish. Stopping workers interrupts compilers. Deploy web
and affected workers from the same revision: recipe/hash guards reject
incompatible jobs. Old artifacts remain downloadable but are not reused by a
new recipe identity.

Apply migrations from the authorized checkout. On production, copy the release's
`compose.yml` when it changed, review new settings against `.env.example`, and
update `IMAGE_TAG` in `.env` to the published release. Preserve the existing
project name and secrets. Repeat the
[production pull/start commands](#production-with-only-compose-and-env), then
check logs/admin metrics. A changed image tag causes Compose to recreate the
affected containers while retaining named volumes.

After deployment URL/key changes, explicitly recreate web:

```bash
docker compose up -d --no-deps --no-build --pull never --force-recreate web
```

Publish a new maintenance image when its source or importer changes. Resume
submissions after checking a build/private download and relevant email flows.
CI does not deploy or migrate production.

The web health check tests `/login`; it does not test Supabase, queues, or workers.

## Persistence and rollback

Back up Postgres and Storage together, plus required deployment configuration
and credentials through your secret-management process. Redis uses an append-only
named volume. Workers have source/compiler/workspace volumes. Caches can be
rebuilt; database records and artifacts are user data. Test restores away from
production.

Keep the Compose project name stable when moving a deployment to retain its
volumes. Compose otherwise derives it from the directory name. For an existing
installation, inspect `docker compose ls` in its current location and set
`COMPOSE_PROJECT_NAME=<existing-project-name>` in the new deployment's `.env`
before starting. Use that same name for every subsequent pull/start command.
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
