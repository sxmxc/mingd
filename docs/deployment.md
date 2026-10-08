---
title: "Deployment and operations"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/deployment.md
---

# Deployment and operations

Production uses two image-only deployment files on **separate Docker hosts**:
[`compose.web.prod.yml`](../compose.web.prod.yml) for web, worker gateway,
maintenance and private Redis; [`compose.workers.prod.yml`](../compose.workers.prod.yml)
for dedicated HTTPS build workers. Supabase and Nginx Proxy Manager remain
separately managed installations. Neither production host needs this source
checkout or npm. See [distributed workers](distributed-workers.md) for architecture,
protocol, security, resource budgets and release milestones.

The source checkout's `compose.yml` retains direct builders for local development
and rollback. Do not run direct and distributed workers against the same queues.

## Build here, pull on production (GHCR)

From a matching build/migration checkout, use `.nvmrc`, run `npm ci` and pass the
[CI checks](ci.md). Set `IMAGE_PREFIX=ghcr.io/sxmxc/mingd` in its root `.env`.
`IMAGE_TAG` identifies the local images being built/published, normally `latest`.
Authenticate with `docker login ghcr.io` using Docker's credential storage.

```bash
npm run images:build
npm run images:publish -- v0.2.2 --dry-run
npm run images:publish -- v0.2.2
```

Default build/push/publication includes web, gateway, maintenance, desktop, Web
and Android workers (**six images**). With a provisioned and verified macOS
archive, use `images:build:all` and `images:publish:all -- v0.2.2` (**seven images**).
The publisher derives services from Compose build entries and excludes only macOS
by default; `:all` includes every build service. Redis is not republished.
Preflight verifies all local images before tagging or pushing. Successful push
digests and the final published-image count establish publication; the initial
tag-plan lines alone do not.

Use a **fresh immutable release identifier** matching workspace versions. Do not
reuse historical `v0.1.2` for this 0.2.2 release. Publication tags existing
local images with the release and `latest`, without rebuilding. It pins image IDs,
pushes the complete release before promoting `latest`, and fails on registry errors.
Promotion across repositories is not atomic; deploy immutable release tags and
record digests. `images:push`/`:all` only push the configured `IMAGE_TAG`.

GHCR publishing requires a classic PAT with `write:packages`; private-image pulls
need `read:packages`. Keep tokens out of `.env`, Docker build arguments and source.
All application Dockerfiles carry the repository source label; worker variants
inherit it. Keep macOS images private because they include the operator Apple SDK.
The current cross-compilation images target Linux x86_64 build hosts.

### Build and publish only selected images

For a partial update, use explicit Compose service names. `web` is the Next.js
application; `web-builder` is the Godot Web compiler. The remote worker images
are `builder` (desktop), `web-builder`, `android-builder`, and `macos-builder`.
The `worker-gateway` and `maintenance` services run on the application host and
are separate images.

On the build checkout, set `IMAGE_PREFIX=ghcr.io/sxmxc/mingd` in root `.env` and
authenticate with `docker login ghcr.io`. Choose a fresh image tag for each
publication. The example `v0.2.2-web.1` identifies a web-only revision of the
0.2.2 application; it is illustrative, not an already published release.

Build and push only the application web image:

```bash
IMAGE_TAG=v0.2.2-web.1 docker compose build web
IMAGE_TAG=v0.2.2-web.1 docker compose push web
```

The build creates `ghcr.io/sxmxc/mingd/web:v0.2.2-web.1` locally; the push uploads
that exact tag. Use the same `IMAGE_TAG` on both commands. These commands do not
start containers or update `latest`. Docker image tags are independent of Git
tags and `package.json` versions: the command does not create a Git release or
change workspace versions. Record the source commit and pushed digest alongside
the image tag. Do not reuse a tag for a different image.

On the application host, keep `IMAGE_TAG` at the existing shared release and set
only `WEB_IMAGE_TAG=v0.2.2-web.1` in its `.env`, then:

```bash
docker compose -f compose.web.prod.yml pull web
docker compose -f compose.web.prod.yml up -d --no-deps --no-build --pull never web
```

For only the desktop, Web, and Android workers, on the build checkout:

```bash
IMAGE_TAG=v0.2.2-workers.1 docker compose build builder web-builder android-builder
IMAGE_TAG=v0.2.2-workers.1 docker compose push builder web-builder android-builder
```

Include `macos-builder` explicitly only when its SDK/toolchain is provisioned.
To update only one worker, list only its service in both commands. Explicit
service names select profiled services without requiring `--profile`.

On each affected worker host, keep its shared `IMAGE_TAG` and set the overrides
for the workers being updated:

```dotenv
BUILDER_IMAGE_TAG=v0.2.2-workers.1
WEB_BUILDER_IMAGE_TAG=v0.2.2-workers.1
ANDROID_BUILDER_IMAGE_TAG=v0.2.2-workers.1
```

Drain affected workers and wait for active assignments to finish before
recreating them. Then, from that worker host's deployment directory:

```bash
docker compose -f compose.workers.prod.yml pull builder web-builder android-builder
docker compose -f compose.workers.prod.yml up -d --no-deps --no-build --pull never builder web-builder android-builder
```

If the production file is named `compose.yml`, use that filename instead.
Review [release compatibility](distributed-workers.md#release-compatibility)
when mixing versions, especially changes to shared packages, protocol, recipe,
or toolchain. Roll back by restoring each affected override to its prior tag
and repeating the targeted pull/up commands.

`npm run images:build` and `images:publish` select the full default image set.
Appending `web` to those commands does not select only web. The publisher expects
a single release identifier and tags/pushes all selected images as that release
and `latest`; use the targeted Compose commands above for partial publication.

## Database migrations

Use the matching authorized repository checkout, not the image-only deployment
directory. Set `SUPABASE_DB_URL` in its root `.env` or exported environment to a
private, percent-encoded PostgreSQL URI. Confirm the database and backup before
applying changes; never reset production.

```bash
npm run db:status
npm run db:migrate:check
npm run db:migrate
npm run db:status
```

Scripts use `--db-url` and skip Vault synchronization; no Cloud project link is
required. Dry-run lists pending migrations without proving they will succeed.
Distributed workers require the assignment, heartbeat and execution migrations
through `20261008071856_worker_telemetry.sql`. Keep migration history intact.
Postgres need only be reachable from the migration host, not exposed publicly.

## Production with only Compose and .env

### Application host

Keep `compose.web.prod.yml` and `.env` in a stable directory. Start from
[`.env.web.prod.example`](../.env.web.prod.example), replacing keys and reviewing
release/URL settings. Preserve existing deployment values when migrating.

The owner uses `https://mingd.voidmoose.net`, `https://worker.mingd.voidmoose.net`
and separate `https://supabase.voidmoose.net`, with Cloudflare DNS resolving to
private addresses and NPM providing trusted HTTPS. Keep that topology. NPM forwards
web to port 3000 and gateway to port **3001**, using HTTP upstreams. No gateway
bind-IP setting is required. Redis has **no published host port** in this file.

Configure the worker proxy to permit a 512 MiB body and sufficiently long uploads.
In NPM's proxy-host advanced settings, the relevant Nginx directives are:

```nginx
client_max_body_size 512m;
proxy_request_buffering off;
proxy_read_timeout 330s;
proxy_send_timeout 330s;
```

Check the generated NPM configuration for conflicting location-level settings
and reload successfully. These proxy limits do not bypass gateway ownership,
checksum, archive or timeout checks. The gateway still buffers to private disk
before publishing to Storage. The proxy and workers must route to their private
upstreams; certificates/DNS do not provide network routing.

After migrations, and after completing the [cutover](#distributed-cutover-and-rollback):

```bash
docker login ghcr.io
docker compose -f compose.web.prod.yml config --quiet
docker compose -f compose.web.prod.yml pull
docker compose -f compose.web.prod.yml up -d --no-build --pull never
docker compose -f compose.web.prod.yml ps
curl --fail https://worker.mingd.voidmoose.net/healthz
```

Enable both `WORKER_GATEWAY_WORKERS_ENABLED=true` and
`WORKER_GATEWAY_EXECUTION_ENABLED=true` after migration/cutover. Both default
false for safe deployment; the example explicitly enables them. With execution
running, health reports `acceptingAssignments:true`. This describes queue dispatch
readiness, not worker capacity or successful native compilation.

Only this host/operator checkout holds server-only Supabase keys. The web image
reads URL/key settings at runtime; no environment-specific web rebuild is needed.
Changing settings requires recreating the relevant containers. Supabase SMTP/Auth
configuration remains in the [Supabase installation](self-hosted-supabase.md).

### Dedicated worker host

Keep `compose.workers.prod.yml`, `.env` and `worker-tokens/` on the build host.
Use [`.env.workers.prod.example`](../.env.workers.prod.example). Transfer the
individual enrolled token files as described in
[worker enrollment](distributed-workers.md#authentication-and-operator-controls).
Do not copy the application `.env`; remote workers need no Redis URL, database URI
or Supabase key. Tokens are read from Compose-mounted files, not command lines.

```bash
docker login ghcr.io
docker compose -f compose.workers.prod.yml config --quiet
docker compose -f compose.workers.prod.yml pull
docker compose -f compose.workers.prod.yml up -d --no-build --pull never
docker compose -f compose.workers.prod.yml ps
docker compose -f compose.workers.prod.yml logs --tail=100
```

Desktop and Web workers start by default. Add `--profile android`, `--profile macos`
or both to **every** command when enabling those targets. macOS needs a matching
verified toolchain digest in enrollment, application `.env`, worker `.env` and the
image. The build-time toolchain archive is not needed on the pulling host.

Limits are **per container**: default four CPUs, 8 GiB RAM, 512 PIDs, concurrency 1
and four SCons jobs. Two defaults can consume eight CPUs/16 GiB; budget the sum
against the actual host. Tune `WORKER_CPUS`, `WORKER_MEMORY_LIMIT`, `SCONS_JOBS` and
`BUILDER_CONCURRENCY`. Enrolled capacity must cover configured concurrency. Local
source/cache/work volumes persist independently on each host. Root worker
containers retain only CHOWN, DAC_OVERRIDE and FOWNER for host-owned token/cache
permissions and source copies; all other capabilities are dropped. Keep the
mode-0600 token private to its intended container.

When correcting capabilities on an existing host, recreate each idle affected
worker, including Web and Android; a restart does not apply Compose changes.
For a deployed file named `compose.yml` with those targets enabled:

```bash
docker compose --profile android up -d --no-build --pull never --force-recreate web-builder android-builder
```

Release 0.2.2 uses `IMAGE_TAG=v0.2.2` and adds no migrations or protocol/recipe
changes beyond 0.2.1. Apply the full migration history before deployment.
Existing compatible enrollments keep their tokens; initial CPU readings at
`/admin/workers` need two 30-second samples. See
[worker release history](worker-release-history.md#upgrading-from-before-021)
for deployments predating release-independent enrollment compatibility.

Add another host by copying this worker deployment and enrolling new identities.
Do not share a token across running worker replicas. Within one host, separate
Compose project names and token paths create independent instances/volumes;
plain `--scale` with one mounted token is not the intended enrollment workflow.

## Distributed cutover and rollback

1. Pause submissions in `/admin/settings` and let queued/active direct builds finish.
   Keep the current release/configuration for rollback. Stopping an active compiler
   interrupts its job; prefer a drained transition.
2. Apply migrations and publish matching 0.2.2 images. Copy the two production files
   to their respective hosts. Preserve the application Compose project name and
   Redis volume. Configure NPM upload limits and worker HTTPS reachability.
3. Stop existing direct builders using their old deployment definition:
   `docker compose --profile '*' stop builder web-builder android-builder macos-builder`.
   Stop only services that actually exist in that deployment.
4. Set both gateway enable flags true and start the application deployment above.
   Enroll each worker using the matching checkout; securely transfer only its token.
   Start the dedicated worker deployment and confirm `workers -- list` last-seen.
5. Submit a test build, watch stages/output/heartbeats, verify a private download and
   checksum, and perform the target's [export/runtime smoke test](smoke-tests.md).
   Repeat with two hosts/identities. Test drain/revoke and a worker restart; confirm
   expired assignments cannot commit and retries preserve terminal state.
6. Resume submissions after acceptance. Record the release/digests and results.

For rollback, pause submissions, drain or stop remote workers, disable gateway
execution and recreate it **before** restarting direct consumers. Review active
assignments/builds and wait for bounded recovery or resolve them through the
supported retry workflow. Retain compatible migrations; older code does not undo
SQL. Restore the prior image release/configuration and original direct deployment
only after reviewing queue/recipe compatibility. Do not run both consumers.

## Persistence and updates

Production keeps a shared `IMAGE_TAG` with optional
[per-service overrides](configuration.md#container-image-selection). For example,
to deploy the already published web image at v0.2.2 while keeping the other
application services at v0.2.1, set these values in the application host's `.env`:

```dotenv
IMAGE_TAG=v0.2.1
WEB_IMAGE_TAG=v0.2.2
```

Using the repository filename below (use `compose.yml` if renamed on the host),
preview the selected images, then update only web:

```bash
docker compose -f compose.web.prod.yml config --images
docker compose -f compose.web.prod.yml pull web
docker compose -f compose.web.prod.yml up -d --no-deps --no-build --pull never web
```

The worker host's `.env` controls workers independently. To stage one worker,
set its override and drain that worker before pulling/recreating that service.
Review migrations and protocol/recipe/target/toolchain compatibility before
mixing releases. Use published release tags and do not overwrite them. For
rollback, restore the affected service's previous tag and repeat pull/up.
Remove an override when that service should follow `IMAGE_TAG` again. No separate
deployment inventory file is required; each host's `.env` selects its images.

Keep the existing Compose project name when replacing the full deployment with
`compose.web.prod.yml`, so `redis-data` remains the same volume. Inspect
`docker compose ls`; set `COMPOSE_PROJECT_NAME=<existing-name>` in that host's `.env`
or use a consistent `-p`. Worker hosts use their own project names and volumes.
Do not use `down -v` during updates. See [infrastructure identities](naming.md#infrastructure-identities).

Back up Postgres and Storage together with protected deployment settings and tokens.
Redis uses append-only persistence. Compiler/source caches are rebuildable; build
records/artifacts are user data. Test restores away from production.

For subsequent releases, publish a new shared release and review migrations/settings.
Update the relevant host's `IMAGE_TAG` or service override, drain affected workers,
and repeat pull/up/acceptance for the selected services. Existing overrides stay
pinned when `IMAGE_TAG` changes. Keep existing tokens for application-only upgrades; re-enroll
when enrolled recipe/target/toolchain capabilities change.
Pull before up: `--no-build --pull never` makes missing images an explicit error.
Application CI does not build/publish production images or apply migrations.
The separate documentation workflow publishes the static documentation site.

Monitor queue wait, whole-container CPU/RAM, gateway upload disk, build failures,
worker last-seen and maintenance errors. Scheduled cleanup does not prune local
compiler/source caches; see [performance](performance.md) and [maintenance](maintenance.md).

## Source-checkout command reference

These commands require `package.json`; production directories use Docker commands
above. Root Compose direct builders remain useful for local development.

| Command | Effect |
| --- | --- |
| `npm run compose:build` / `compose:up` | Build/start default web, maintenance and Redis |
| `npm run compose:up:builders` | Start defaults plus direct desktop/Web/Android workers |
| `npm run compose:builders:build` | Build/start direct desktop/Web/Android and Redis |
| `npm run compose:worker-gateway:build` | Build/start gateway; enable flags control dispatch |
| `npm run images:build` / `images:push` | Six application images including gateway, excluding macOS |
| `npm run images:build:all` / `images:push:all` | All seven application images |
| `npm run images:publish[:all] -- <release>` | Tag/publish release and latest; `:all` adds macOS |
| `npm run images:pull` / `images:up` | Direct builder and gateway profiles; execution must remain off while direct builders run |
| `npm run images:pull:all` / `images:up:all` | Every root Compose profile |
| `npm run compose:down:all` | Stop all root services, preserving volumes |
| `npm run workers -- <command>` | Operator enrollment/list/drain/rotation/revocation |

Explicit service targets can start profiled services without enabling profiles.
Exported `COMPOSE_PROFILES` also changes default selections. Use target-specific
`compose:<service>:build`/`:logs` scripts as needed. For local source setup, see
[getting started](getting-started.md).
