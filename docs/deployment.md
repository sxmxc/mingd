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

From an authorized source checkout, use `.nvmrc`, run `npm ci`, and pass the
[CI checks](ci.md). Set `IMAGE_PREFIX=ghcr.io/sxmxc/mingd` in the checkout's root
`.env`. Authenticate with `docker login ghcr.io` using Docker's credential storage.

### Build, push, and publish

All three commands use a service name or `all`:

```bash
# Build and push only web, then remember its tag in root .env.
npm run publish -- web -- v0.2.4

# Or build and push in separate steps.
npm run build -- web -- v0.2.4
npm run push -- web -- v0.2.4

# Push every image at its own recorded tag. No shared version argument.
npm run publish -- all
```

`publish <service> -- <tag>` builds and pushes only that service. `build` builds
without pushing; `push` pushes without building. After a successful targeted
operation, the helper records the service's tag in the build checkout's `.env`,
using the same variables as production (`WEB_IMAGE_TAG`, `BUILDER_IMAGE_TAG`, etc.).
Other settings and service tags are preserved. A failed targeted build or push
is not recorded as successful.

`publish all` and `push all` push the configured local images without rebuilding
or retagging them. For example, with `IMAGE_TAG=v0.2.2` and
`WEB_IMAGE_TAG=v0.2.4`, web stays at **v0.2.4** and unchanged workers stay at
**v0.2.2**. `all` rejects a version argument. Nothing automatically updates
`latest`, workspace versions, or Git tags. Choose a new tag when replacing a
service's image; image tags do not have to match the application's version.

To build the full set first, run `npm run build -- all`. It builds images under
their currently configured tags; use this when those tags are the ones you intend
to build. The optional macOS image participates in `all` only when its configured
local image already exists. Build/publish `macos-builder` explicitly after
provisioning its SDK/toolchain. Redis is never built or published by these helpers.

The available services are `web` (Next.js app), `worker-gateway`, `maintenance`,
`builder` (desktop compiler), `web-builder` (Godot Web compiler), `android-builder`,
and `macos-builder`. To update multiple services, run targeted commands for each:

```bash
npm run publish -- builder -- v0.2.3
npm run publish -- web-builder -- v0.2.3
npm run publish -- android-builder -- v0.2.3
```

Add `--dry-run` to preview an operation without building, pushing, or editing
`.env`. For `all`, preflight checks required local images before any push. A
successful push and final completion message establish publication; plan lines
alone do not. Registry pushes across services are not atomic.

The build checkout's root `.env` is the record used by subsequent operations.
If images were previously published manually, set their per-service tags there
before using `all`. Exported Compose variables take precedence over `.env`;
keep image selection in `.env` rather than leaving older exported overrides.

GHCR publishing requires a classic PAT with `write:packages`; private-image pulls
need `read:packages`. Keep tokens out of `.env`, Docker build arguments and source.
All application Dockerfiles carry the repository source label; worker variants
inherit it. Keep macOS images private because they include the operator Apple SDK.
The current cross-compilation images target Linux x86_64 build hosts.

### Deploy only what changed

Publishing does not restart production. On the application host, set the
published tag in its separate `.env`, for example `WEB_IMAGE_TAG=v0.2.4`, then:

```bash
docker compose -f compose.web.prod.yml pull web
docker compose -f compose.web.prod.yml up -d --no-deps --no-build --pull never web
```

Other application services and workers remain on their selected tags. On worker
hosts, set the corresponding variables, such as `BUILDER_IMAGE_TAG=v0.2.3`.
Drain affected workers and wait for active assignments to finish, then:

```bash
docker compose -f compose.workers.prod.yml pull builder
docker compose -f compose.workers.prod.yml up -d --no-deps --no-build --pull never builder
```

Use the actual deployment filename if renamed to `compose.yml`. Review
[release compatibility](distributed-workers.md#release-compatibility) before
mixing versions. Roll back by selecting the prior service tag and repeating
pull/up. Copy only the desired image-tag settings between hosts; their `.env`
files also contain different credentials and process configuration.

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

For subsequent updates, publish the changed services and review migrations/settings.
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

The operator entry points are `build`, `push`, `publish`, `compose`, and `workers`.
They require a source checkout with `package.json`; image-only production hosts
use Docker commands directly.

| Command | Effect |
| --- | --- |
| `npm run build -- <service> -- <tag>` | Build one image and remember its tag |
| `npm run push -- <service> -- <tag>` | Push one existing image and remember its tag |
| `npm run publish -- <service> -- <tag>` | Build and push one image and remember its tag |
| `npm run build -- all` | Build the full image set using each service's configured tag |
| `npm run push -- all` / `npm run publish -- all` | Push each service's configured image without rebuilding or retagging |
| `npm run compose -- up -d --build` | Build/start root Compose's default services |
| `npm run compose -- up -d --build builder web-builder android-builder` | Build/start direct workers and their Redis dependency |
| `npm run compose -- logs -f web` | Follow one service's logs |
| `npm run compose -- --profile '*' down` | Stop all root services, preserving volumes |
| `npm run workers -- <command>` | Worker enrollment/list/drain/rotation/revocation |

`npm run build` **without arguments** retains the application validation build:
web, docs, and shared/service TypeScript checks. Passing a service or `all`
selects container image building instead.

`compose` forwards its arguments to Docker Compose, replacing the previous
`compose:<service>:build`/`:logs` and `images:*` aliases. Explicit service names
select profiled services without enabling profiles. For local source setup, see
[getting started](getting-started.md).
