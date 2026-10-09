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

`publish <service> -- <tag>` builds only that service and pushes both the requested
tag and its `latest` alias. `build` builds without pushing; targeted `push` pushes
both tags without building. The version tag is pushed before `latest`. After a successful targeted
operation, the helper records the service's tag in the build checkout's `.env`,
using the same variables as production (`WEB_IMAGE_TAG`, `BUILDER_IMAGE_TAG`, etc.).
Other settings and service tags are preserved. A failed targeted build or push
is not recorded as successful.

`publish all` and `push all` push the configured local images without rebuilding
or retagging them. For example, with `IMAGE_TAG=v0.2.3` and
`WEB_IMAGE_TAG=v0.2.4`, web stays at **v0.2.4** and unchanged workers stay at
**v0.2.3**. `all` rejects a version argument and does not promote services to `latest`.
Only targeted push/publish updates a service's `latest` alias. Workspace versions
and Git tags are unchanged. Choose a new tag when replacing a
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

Release 0.2.3 uses `IMAGE_TAG=v0.2.3`, retains protocol v1, and adds no migrations.
Recipe 10 accounts for the Emscripten 6.0.11 update. Drain work, deploy matching
web/gateway/worker images, and upgrade enrollment for recipe 10; recipe 9
enrollment is incompatible. Apply the full migration history before deployment.
For subsequent compatible upgrades, enrollments keep their tokens. Initial CPU readings at
`/admin/workers` need two 30-second samples. See
[worker release history](worker-release-history.md#upgrading-from-before-021)
for deployments predating release-independent enrollment compatibility.

Add another host by copying this worker deployment and enrolling new identities.
Do not share a token across running worker replicas. Within one host, separate
Compose project names and token paths create independent instances/volumes;
plain `--scale` with one mounted token is not the intended enrollment workflow.

## Compiler recipe and toolchain upgrade checklist

Use this procedure when changing compiler flags, output/packaging semantics,
Emscripten/NDK/SDK/compiler images, or other binary inputs that invalidate
`BUILD_RECIPE_VERSION`. Run operator commands from an authorized checkout on
the application/operator host; worker hosts receive token files only.
`upgrade --all` updates existing enrollment in place, so names, IDs, targets,
capacity, and history are preserved. No database migration is required for
these commands. Keep a copy of the previous deployment tags and configuration.

1. **Prepare and validate the new recipe on the build host.** Verify the exact
   supported Godot sources against the new toolchain. Bump
   `BUILD_RECIPE_VERSION` once for the changed binary semantics and update its
   cache tests. Do not bump it just for an application version change.
   Advance each component from its own current version. The default selects all
   components for this compiler rollout; it does not force their versions equal:

   ```bash
   nvm use
   npm run release -- bump patch --dry-run
   npm run release -- bump patch
   npm ci
   npm run typecheck
   npm test
   npm run build
   ```

   If the component versions have **already** been bumped for this rollout, use
   `npm run release -- tags` instead of bumping it again. `bump` updates all
   workspace versions independently, their lockfile entries, production
   Compose/example defaults, and the build checkout's per-service `.env` tags.
   It starts each image from the newer of its recorded production default and
   versioned local tag, so an earlier targeted web release is preserved. For
   example, repo/gateway 0.2.3 and web image 0.2.4 become repo/gateway 0.2.4 and
   web 0.2.5 after a patch bump. `minor` resets patch; `major` resets minor and
   patch: 0.3.5 becomes 0.4.0 or 1.0.0 respectively. Review the dry-run's
   per-component transitions and commit the tracked changes;
   write release notes separately. It does not commit, tag Git, publish images,
   or change `BUILD_RECIPE_VERSION` automatically.

   For a release affecting only one service, use, for example,
   `npm run release -- bump patch --service web`, then
   `npm run build -- web --release` and `npm run push -- web --release`.
   That leaves the repo version and other services' image tags unchanged.
   Compiler variants and maintenance share `services/builder/package.json`;
   its software version advances when any of those services is released, while
   their individual image tags retain separate histories. Bulk worker enrollment
   records this builder software version, independently of the gateway version.

2. **Build every required compiler and application image at its prepared tag.**
   Keep `IMAGE_PREFIX=ghcr.io/sxmxc/mingd` in the build host's root `.env`.

   ```bash
   npm run build -- all --release --dry-run
   npm run build -- all --release
   ```

   `--release` uses each service's prepared version from the production defaults
   and build checkout's versioned tags; it overrides exported shell image tags.
   The repo version is not used as a shared image version. If macOS workers are in use,
   provide the verified `toolchains/macos-toolchain.tar.xz` and matching
   `MACOS_TOOLCHAIN_SHA256`, and add `--include-macos` to both commands. Otherwise
   optional macOS is skipped when its new image does not exist. Validate real
   compilation/export/launch on the affected targets before publishing; dry-run
   pipeline archives and unit checks do not establish compiler acceptance.

3. **Publish the built images.** Authenticate to GHCR using the documented
   publishing setup, then:

   ```bash
   npm run push -- all --release --dry-run
   npm run push -- all --release
   ```

   This pushes versioned images without rebuilding or promoting `latest`.
   Existing `publish all` behavior is unchanged: it only pushes existing images.
   Partial publication is possible if a registry request fails; finish publishing
   the complete tested image set before deploying. Never replace an already
   published version tag with different image contents; prepare a newer version.

4. **Quiesce the old fleet on the application/operator host.** Pause submissions
   in `/admin/settings`, and let **queued and active** builds finish under the old
   recipe before draining. Draining prevents new claims, so doing it while old
   jobs remain queued will not finish those jobs. Then, from a checkout containing
   the new bulk CLI:

   ```bash
   npm run workers -- list
   npm run workers -- drain --all --wait --timeout-seconds 43200
   ```

   These commands select enabled workers only; revoked workers remain untouched.
   Keep other enrollment/resume operations stopped during the rollout so the
   selected fleet stays stable.
   The wait checks durable active assignments, including upload completion. A
   timeout leaves workers draining and exits unsuccessfully: inspect the build
   monitor/worker diagnostics and resolve outstanding work before continuing.
   Do not force-stop a busy compiler just to meet the rollout schedule.

5. **Stop idle workers on every worker host.** Keep the Compose project name,
   volumes, and token mounts. Run in the deployed worker Compose directory:

   ```bash
   docker compose --profile '*' stop builder web-builder android-builder macos-builder
   ```

   Select only services present in that deployment. Keep submissions paused.

6. **Upgrade enrollment and rotate all enabled worker credentials together.**
   On the application/operator host, use the tested new release checkout:

   ```bash
   mkdir -p -m 700 worker-tokens
   npm run workers -- upgrade --all --credential-dir worker-tokens/new-rollout
   ```

   Choose a fresh directory for each rollout; existing directories/files are
   refused. The command uses this checkout's recipe/release and keeps workers
   draining. If the macOS archive identity changed, also pass
   `--toolchain-sha256 <verified-new-digest>`; this applies to all selected macOS
   workers, while other targets retain their own capability rules. Mixed macOS
   toolchains require separate enrollment management rather than one fleet-wide
   digest. For secret-only maintenance, `rotate --all --credential-dir <new-dir>`
   rotates the fleet without changing recipe enrollment.

   Every worker receives a distinct `<worker-id>.token` file with mode 0600. The
   private `manifest.json` maps ID/name/target to its file and update outcome.
   Transfer only each host's tokens securely and update its existing
   `*_WORKER_TOKEN_FILE` settings to the new files. Do not copy privileged env
   files or the whole token directory to every host. A failed bulk update can
   leave a partially updated fleet: keep workers stopped/draining, preserve all
   files, and inspect the manifest's `updated`, `uncertain`, and `pending` entries.
   An uncertain response may have committed; never discard that token. With the
   fleet still stopped and idle, rerunning into another fresh directory replaces
   all enabled workers' credentials again and produces a complete new set.

7. **Align deployment image tags and recreate the services.** Do this for the
   application host and each worker host's separate `.env`. From the new release
   checkout, point the command at the actual local deployment env file:

   ```bash
   npm run release -- tags --env-file /path/to/deployment/.env --dry-run
   npm run release -- tags --env-file /path/to/deployment/.env
   ```

   It exports the build checkout's independent service tags without bumping
   versions, preserving unrelated settings and file permissions. `IMAGE_TAG`
   remains a fallback; explicit per-service tags select each release. On hosts
   without a checkout/Node, generate a **new tag-only file** on the build host:

   ```bash
   npm run release -- tags --env-file /tmp/mingd-image-tags.env
   ```

   Transfer that file to `image-tags.env` in each deployment directory. Compose
   accepts multiple env files, with the later file taking precedence. Add
   `--env-file .env --env-file image-tags.env` immediately after `docker compose`
   in every pull/up command below. This leaves each host's private `.env` intact
   while applying the generated per-service release tags. Check for
   stale exported `IMAGE_TAG`/`*_IMAGE_TAG` shell variables, which take precedence
   over env files, and unset them before deployment. Keep worker token paths as
   configured in step 6.
   On the application host:

   ```bash
   docker compose pull web worker-gateway maintenance
   docker compose up -d --no-build --force-recreate web worker-gateway maintenance
   ```

   On each worker host, pull and recreate its enabled targets (include Android
   and/or macOS profiles only when used):

   ```bash
   docker compose pull builder web-builder
   docker compose up -d --no-build --force-recreate builder web-builder
   ```

   Recreate rather than restart: image tags, env values, and token mounts must
   be reapplied. Keep source, ccache, Gradle, and work volumes; do not run
   `down -v`, flush Redis, or delete old artifact rows. The new recipe hash
   separates artifact reuse automatically. Record the deployed image digests.

8. **Verify, then resume.** Confirm gateway `/healthz`, expected worker IDs,
   current recipe/toolchain identity, heartbeats, and no unexpected failures in
   `/admin/workers`. Drained workers can heartbeat but cannot claim jobs. Then:

   ```bash
   npm run workers -- list
   npm run workers -- resume --all
   ```

   Re-enable submissions and run a real build/download/export smoke test per
   affected target. Record results using [smoke tests](smoke-tests.md).
   If verification fails, pause submissions and drain again. Keep the saved
   credentials and previous configuration. Rolling images back alone cannot
   restore old recipe enrollment: use matching enrollment/credentials for the
   old recipe or prepare a tested corrective release with a new recipe identity.

## Distributed cutover and rollback

1. Pause submissions in `/admin/settings` and let queued/active direct builds finish.
   Keep the current release/configuration for rollback. Stopping an active compiler
   interrupts its job; prefer a drained transition.
2. Apply migrations and publish matching 0.2.3 images. Copy the two production files
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

The operator entry points are `release`, `build`, `push`, `publish`, `compose`, and `workers`.
They require a source checkout with `package.json`; image-only production hosts
use Docker commands directly.

| Command | Effect |
| --- | --- |
| `npm run release -- bump <patch\|minor\|major> [--dry-run]` | Advance every component from its own current version; update lockfile, defaults and per-service image tags |
| `npm run release -- bump patch --service web` | Advance only the web package/image release; keep the repo and other services' versions |
| `npm run release -- tags [--env-file <file>]` | Export each service's prepared image tag without another version bump |
| `npm run build -- <service> -- <tag>` | Build one image and remember its tag |
| `npm run push -- <service> -- <tag>` | Push one existing image as its version and latest; remember its version |
| `npm run publish -- <service> -- <tag>` | Build/push one image as its version and latest; remember its version |
| `npm run build -- all` | Build the full image set using each service's configured tag |
| `npm run build -- <all\|service> --release` | Build using each selected service's prepared tag; build all accepts `--include-macos` |
| `npm run push -- all --release` | Push the tested independent image tags without rebuilding or promoting latest |
| `npm run push -- all` / `npm run publish -- all` | Push each service's configured image without rebuilding or retagging |
| `npm run compose -- up -d --build` | Build/start root Compose's default services |
| `npm run compose -- up -d --build builder web-builder android-builder` | Build/start direct workers and their Redis dependency |
| `npm run compose -- logs -f web` | Follow one service's logs |
| `npm run compose -- --profile '*' down` | Stop all root services, preserving volumes |
| `npm run workers -- <command>` | Worker enrollment/list/drain/rotation/revocation |
| `npm run workers -- drain --all --wait` | Drain enabled workers and wait for active durable assignments to finish |
| `npm run workers -- upgrade --all --credential-dir <new-dir>` | Rotate enabled workers' credentials and update drained enrollment to the current recipe/release |
| `npm run workers -- rotate --all --credential-dir <new-dir>` | Rotate the drained fleet's credentials while keeping recipe enrollment |
| `npm run workers -- resume --all` | Allow enabled workers to claim assignments again |

`npm run build` **without arguments** retains the application validation build:
web, docs, and shared/service TypeScript checks. Passing a service or `all`
selects container image building instead.

`compose` forwards its arguments to Docker Compose, replacing the previous
`compose:<service>:build`/`:logs` and `images:*` aliases. Explicit service names
select profiled services without enabling profiles. For local source setup, see
[getting started](getting-started.md).
