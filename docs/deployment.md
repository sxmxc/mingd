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
npm run images:publish -- v0.2.1 --dry-run
npm run images:publish -- v0.2.1
```

Default build/push/publication includes web, gateway, maintenance, desktop, Web
and Android workers (**six images**). With a provisioned and verified macOS
archive, use `images:build:all` and `images:publish:all -- v0.2.1` (**seven images**).
The publisher derives services from Compose build entries and excludes only macOS
by default; `:all` includes every build service. Redis is not republished.
Preflight verifies all local images before tagging or pushing. Successful push
digests and the final published-image count establish publication; the initial
tag-plan lines alone do not.

Use a **fresh immutable release identifier** matching workspace versions. Do not
reuse historical `v0.1.2` for this 0.2.1 release. Publication tags existing
local images with the release and `latest`, without rebuilding. It pins image IDs,
pushes the complete release before promoting `latest`, and fails on registry errors.
Promotion across repositories is not atomic; deploy immutable release tags and
record digests. `images:push`/`:all` only push the configured `IMAGE_TAG`.

GHCR publishing requires a classic PAT with `write:packages`; private-image pulls
need `read:packages`. Keep tokens out of `.env`, Docker build arguments and source.
All application Dockerfiles carry the repository source label; worker variants
inherit it. Keep macOS images private because they include the operator Apple SDK.
The current cross-compilation images target Linux x86_64 build hosts.

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
through `20261008043446_distributed_execution.sql`. Keep migration history intact.
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

Updating from 0.2.0 to 0.2.1 also requires matching gateway/worker images and new
worker enrollments from the 0.2.1 checkout: enrollment stores the exact application
release. Drain old identities, allow active builds to finish, then replace their
tokens with new enrollment files and recreate workers at the new release. Revoke
the old identities after cutover. Set `IMAGE_TAG=v0.2.1` explicitly in each deployed
host's `.env` if it currently pins an older release; example/default changes do not
override existing values. No new database migration accompanies this patch.

Add another host by copying this worker deployment and enrolling new identities.
Do not share a token across running worker replicas. Within one host, separate
Compose project names and token paths create independent instances/volumes;
plain `--scale` with one mounted token is not the intended enrollment workflow.

## Distributed cutover and rollback

1. Pause submissions in `/admin/settings` and let queued/active direct builds finish.
   Keep the current release/configuration for rollback. Stopping an active compiler
   interrupts its job; prefer a drained transition.
2. Apply migrations and publish matching 0.2.1 images. Copy the two production files
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

Keep the existing Compose project name when replacing the full deployment with
`compose.web.prod.yml`, so `redis-data` remains the same volume. Inspect
`docker compose ls`; set `COMPOSE_PROJECT_NAME=<existing-name>` in that host's `.env`
or use a consistent `-p`. Worker hosts use their own project names and volumes.
Do not use `down -v` during updates. See [infrastructure identities](naming.md#infrastructure-identities).

Back up Postgres and Storage together with protected deployment settings and tokens.
Redis uses append-only persistence. Compiler/source caches are rebuildable; build
records/artifacts are user data. Test restores away from production.

For subsequent releases, drain workers, publish a new matching release, review
migrations/settings, update both hosts' `IMAGE_TAG`, re-enroll release-bound workers,
and repeat pull/up/acceptance. Rotation alone does not change enrolled release.
Pull before up: `--no-build --pull never` makes missing images an explicit error.
No production build, migration or publication is performed by CI.

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
