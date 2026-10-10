---
title: "Deployment and operations"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/operators/deployment.md
---

# Deployment and operations

The recommended production layout uses separate application and worker hosts.
The same services can also run on one host. Two image-only deployment files are provided:
[`compose.web.prod.yml`](../../compose.web.prod.yml) for web, worker gateway,
maintenance and private Redis; [`compose.workers.prod.yml`](../../compose.workers.prod.yml)
for HTTPS build workers. Supabase may be managed or self-hosted, on the same or
another host. Use an HTTPS reverse proxy of your choice. Image-only deployments
need Docker Compose, not this source checkout or npm. See [distributed workers](distributed-workers.md) for architecture,
protocol, security, resource budgets and release milestones.

The source checkout's `compose.yml` retains direct builders for local development
and rollback. Do not run direct and distributed workers against the same queues.

## Build here, pull on production (GHCR)

From an authorized source checkout, use `.nvmrc`, run `npm ci`, and pass the
[CI checks](../developers/ci.md). Set `IMAGE_PREFIX=ghcr.io/<owner>/<repository>` in the checkout's root
`.env`. Authenticate with `docker login ghcr.io` using Docker's credential storage.
The upstream examples use `ghcr.io/sxmxc/mingd`; forks can use their own prefix.
Local image build commands derive the OCI source label from that GHCR prefix,
or use `GITHUB_REPOSITORY` when running in GitHub Actions. Set `MINGD_IMAGE_SOURCE`
to override it. CI derives its namespace/source label from `github.repository`
and validates images without publishing them.

### Where each command runs

| Location | Files | Commands |
| --- | --- | --- |
| Build checkout | Source, root `.env`, Dockerfiles | `npm run release`, validation, image `build` and `push` |
| Operator checkout | Source and privileged backend settings | `npm run workers`; may be the same machine as the build checkout |
| Application deployment directory | `compose.web.prod.yml`, its own `.env` | Docker pull/recreate for web, gateway and maintenance |
| Each worker deployment directory | `compose.workers.prod.yml`, its own `.env`, token files | Docker pull/recreate for compilers |

A build, a registry push, and a production deployment are three separate actions.
Publishing an image does not change production. Production `.env` files contain
host-specific settings; do not replace them with the build checkout's `.env`.
Use the production filenames shown here. If a deployed file was renamed to
`compose.yml`, substitute that filename in `-f`; do not run the source checkout's
root Compose file as the distributed production stack.

### Build, push, and publish

The normal release path is **bump selected services → capture a platform release
when needed → validate → build those images → push those images → update
production tags → pull/recreate**.
Each service keeps its own image version; the root package version does not
select all images. Once a step has succeeded, continue to the next step.

For a web-only release, run in the build checkout:

```bash
npm run release -- bump patch --service web --dry-run
npm run release -- bump patch --service web
npm ci
npm run typecheck
npm test
npm run build
npm run build -- web --release
npm run push -- web --release
```

Repeat `--service` on the bump command to select several services. Build and push
each selected service using its name and `--release`. `minor` resets patch;
`major` resets minor and patch. Review and commit the tracked release changes.
For binary-affecting compiler/toolchain changes, use the
[compiler rollout checklist](#compiler-recipe-and-toolchain-upgrade-checklist),
which adds recipe identity, draining and worker enrollment steps.

### Platform releases

The root `package.json` version names the platform release. Package versions name
the service/shared code; image tags name each container variant. Four compiler
images and maintenance share `@mingd/builder`, so their tags can differ from the
package version. The build recipe separately determines binary/cache compatibility.

Prepare component versions first with explicit `--service` selections. Once those
versions are final, capture them under a platform version:

```bash
npm run release -- platform major --dry-run
npm run release -- platform major
```

From a pre-1.0 platform version, this prepares **v1.0.0**. Later use `patch`,
`minor`, or `major` as appropriate. Run the real command once, then review and
commit its changes with the release. It updates only the root package/lockfile
version and writes `releases/v<version>.json`, containing every workspace package
version and each prepared image tag with its owning package. Existing snapshots
are never overwritten. It also refreshes the readable
[platform release matrix](release-matrix.md), including historical tables from
those snapshots. Component bumps update its current tables automatically;
publication does not increment versions again. Use `npm run release -- matrix`
to refresh documentation after manual version edits or explicitly tagged image
commands outside release preparation. The snapshot records release intent, not publication or
what is running in production; keep deployed image digests in deployment records.

The command does not bump components, change `.env` or Compose defaults, build,
publish, or deploy. Component changes after capture belong in a new platform
release. The legacy unselected `release bump` still advances all workspaces,
including the root; use explicit service selections for this separate-version workflow.

### Image build commands

`npm run build` without arguments validates/builds application workspaces;
it does **not** build Docker images. `build -- <service> --release` builds one
Docker image at its prepared tag. `push -- <service> --release` pushes that
already-built image at its version tag. `publish -- <service> --release` pushes
the already-built version and updates its `latest` alias. Neither command builds
images. These meanings also apply to `all`: `push` sends version tags, while
`publish` sends version tags and promotes each selected image to `latest`.
Production uses explicit versioned tags.
`--release` reads each service's production default and versioned build-checkout
`.env` override, using the newer known version; exported shell image tags do not
replace that selection. It does not query the registry or bump versions.

### Publish already-built compiler images

If the release bump and Docker image builds have already succeeded, **start here**.
Do not bump or build again. On the
build host, authenticate with `docker login ghcr.io`, then push only the images
you rebuilt:

```bash
npm run push -- builder --release
npm run push -- web-builder --release
npm run push -- android-builder --release
npm run push -- macos-builder --release
npm run push -- web --release
npm run push -- worker-gateway --release
```

To also update `latest`, replace `push` with `publish`. For a complete locally
built image set, use `npm run push -- all --release` for version tags or
`npm run publish -- all --release` for version tags plus `latest`. Both commands
preflight the selected local images; an unbuilt optional macOS image is skipped.

Omit compiler targets you did not build/use. A recipe-version change requires
new web, gateway and every deployed compiler image; gateway is required even
when its own source files did not change. Push `maintenance` if its behavior also
changed. If a push fails,
finish publishing the tested image set before changing production. Never replace
an already published version with different contents.

Add `--dry-run` to preview any individual push. The preview shows the image tag
and performs no push; the real command checks the local image and pushes it.
A successful push and final completion message establish publication. Registry
pushes across services are not atomic.

### Deploy only what changed

After successful publication, set the published per-service tags in each
production host's **existing** `.env`. The release bump records those tags in
`.env.web.prod.example` and `.env.workers.prod.example`. Copy only the relevant
`*_IMAGE_TAG` values from those files, preserving each host's other settings.
`IMAGE_TAG` is only a fallback; explicit `*_IMAGE_TAG` entries select independent releases.

On the application host, for a web-only update:

```bash
docker compose -f compose.web.prod.yml config --images
docker compose -f compose.web.prod.yml pull web
docker compose -f compose.web.prod.yml up -d --no-deps --no-build --pull never --force-recreate web
```

For compiler recipe/toolchain changes, continue at
[checklist step 4](#compiler-recipe-and-toolchain-upgrade-checklist) before
recreating workers. That checklist owns the stop/token/verification/resume order.
Other services remain on their selected tags. Keep the Compose project name and
volumes. A restart does not apply new images, env values or token mounts.

Redis is not built/published by these helpers. GHCR publishing needs a classic
PAT with `write:packages`; private-image pulls need `read:packages`. Store login
credentials through Docker, not in `.env`, source or build arguments. Keep macOS
images private because they include the operator Apple SDK. Current compiler
images target Linux x86_64 build hosts.

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
User build deletion and failed-build cleanup require
`20261010013720_user_build_deletion.sql`; apply it before using those controls.
It permits enabled users to delete only their own completed or failed records.
Postgres need only be reachable from the migration host, not exposed publicly.

## Production with only Compose and .env

### Application host

Keep `compose.web.prod.yml` and `.env` in a stable directory. Start from
[`.env.web.prod.example`](../../.env.web.prod.example), replacing keys and reviewing
release/URL settings. Preserve existing deployment values when migrating.

Set the app, gateway and Supabase origins to addresses reachable by their clients.
Terminate trusted HTTPS at your reverse proxy and forward web to port 3000 and
gateway to port **3001**, using HTTP upstreams. No gateway
bind-IP setting is required. Redis has **no published host port** in this file.

Configure the worker proxy to permit a 512 MiB body and sufficiently long uploads.
For Nginx, the relevant directives are:

```nginx
client_max_body_size 512m;
proxy_request_buffering off;
proxy_read_timeout 330s;
proxy_send_timeout 330s;
```

Check the proxy configuration for conflicting location-level settings
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
curl --fail https://worker.mingd.example.com/healthz
```

Enable both `WORKER_GATEWAY_WORKERS_ENABLED=true` and
`WORKER_GATEWAY_EXECUTION_ENABLED=true` after migration/cutover. Both default
false for safe deployment; the example explicitly enables them. With execution
running, health reports `acceptingAssignments:true`. This describes queue dispatch
readiness, not worker capacity or successful native compilation.

Only application services and the authorized operator checkout hold server-only Supabase keys. The web image
reads URL/key settings at runtime; no environment-specific web rebuild is needed.
Changing settings requires recreating the relevant containers. Supabase SMTP/Auth
configuration remains in the [Supabase installation](self-hosted-supabase.md).

### Dedicated worker host

This is the recommended placement. For co-located workers, use the same worker
configuration and isolation described in [single-host deployment](#single-host-deployment).

Keep `compose.workers.prod.yml`, `.env` and `worker-tokens/` on each worker host.
Use [`.env.workers.prod.example`](../../.env.workers.prod.example). Transfer the
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

Limits are **per container**: default four CPUs, 16 GiB RAM for desktop and 8 GiB
for each other target, 512 PIDs, concurrency 1 and four SCons jobs. Desktop and Web
can together consume eight CPUs/24 GiB; budget the sum against the actual host.
Tune `WORKER_CPUS`, `DESKTOP_WORKER_MEMORY_LIMIT`, `WORKER_MEMORY_LIMIT`, `SCONS_JOBS` and
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

Use the [compiler rollout checklist](#compiler-recipe-and-toolchain-upgrade-checklist)
when updating enrolled recipe/toolchain capabilities; the current recipe is **11**.
Application-only upgrades
keep existing tokens when compatibility is unchanged. Initial CPU readings at
`/admin/workers` need two 30-second samples. Earlier deployment milestones are in
[worker release history](../archive/worker-release-history.md).

Add another host by copying this worker deployment and enrolling new identities.
Do not share a token across running worker replicas. Within one host, separate
Compose project names and token paths create independent instances/volumes;
plain `--scale` with one mounted token is not the intended enrollment workflow.

### Single-host deployment

The application and HTTPS worker services can run on the same Docker host. Keep
them in separate deployment directories with their own `.env` files, token paths,
and explicit Compose project names, for example `COMPOSE_PROJECT_NAME=mingd-app`
and `COMPOSE_PROJECT_NAME=mingd-workers`. Use the application and worker procedures
above in their respective directories. Separate projects prevent one deployment's
commands from treating the other's containers as orphans or sharing unintended volumes.

Workers still use the gateway's trusted HTTPS origin and receive only their own
tokens. Container loopback cannot reach another container; the gateway hostname
must resolve and route from the workers through the proxy to the published gateway
port. Supabase can also run on this host with its own configuration and volumes;
point clients at its reachable API origin and avoid port conflicts.

Budget aggregate worker CPU, RAM and disk alongside web, gateway, Redis,
maintenance and any self-hosted backend. Reduce limits/concurrency to leave room
for those services. Separate hosts are recommended to keep compiler resource
pressure from affecting application availability; they are not a protocol requirement.

## Compiler recipe and toolchain upgrade checklist

Use this procedure when changing compiler flags, output/packaging semantics,
Emscripten/NDK/SDK/compiler images, or other binary inputs that invalidate
`BUILD_RECIPE_VERSION`. Run operator commands from an authorized checkout on
the application/operator host; worker hosts receive token files only.
`upgrade --all` updates existing enrollment in place, so names, IDs, targets,
capacity, and history are preserved. No database migration is required for
these commands. Keep a copy of the previous deployment tags and configuration.

**A `BUILD_RECIPE_VERSION` change requires rebuilding and deploying web,
worker-gateway, and every deployed compiler target from the new recipe.** The
constant is copied into each image at build time; updating the checkout or a
worker's enrollment does not update an existing gateway image. Independent
application/image versions are supported, but the recipe identities must match.

| Required image | Why it must carry the new recipe |
| --- | --- |
| `web` | Computes the canonical build/cache hash when submitting builds |
| `worker-gateway` | Checks worker/enrollment recipe compatibility and creates assignments using that recipe |
| Every deployed `builder`, `web-builder`, `android-builder`, `macos-builder` | Declares its recipe and verifies assignment/cache identity before compilation |

Maintenance does not compute or enforce the compiler recipe identity. A recipe
constant change alone does not require its image to change; update it when its
maintenance/reference behavior or dependencies change. Newly built images need
new tags for their own service; they do not need equal application versions.

1. **Prepare and validate the new recipe on the build host.** Verify the exact
   supported Godot sources against the new toolchain. Bump
   `BUILD_RECIPE_VERSION` once for the changed binary semantics and update its
   cache tests. Do not bump it just for an application version change.
   Bump web, gateway and all deployed compiler targets independently, including
   services whose own source is unchanged but whose embedded recipe changed.
   For the full compiler fleet plus web/gateway, a patch release preview is:

   ```bash
   nvm use
   npm run release -- bump patch --service builder --service web-builder --service android-builder --service macos-builder --service web --service worker-gateway --dry-run
   ```

   Remove `--dry-run` to apply the chosen bump once. Use `minor` or `major` if
   appropriate for the release. Omit unused compiler targets; keep web and gateway
   selected for a recipe bump. Add `--service maintenance` when its behavior also
   changed. The root package
   and unselected services stay on their own releases. If you already bumped,
   skip the bump commands. Do not increment an already-prepared recipe again.

   ```bash
   npm ci
   npm run typecheck
   npm test
   npm run build
   ```

   Review and commit the tracked release changes. The release helper updates
   selected workspace/lockfile entries, production defaults and local image tags.
   Shared builder software metadata advances once for its selected image variants;
   image tags still keep separate histories. It does not commit, tag Git, publish
   images, or change `BUILD_RECIPE_VERSION` automatically.

2. **Build the selected images on the build host.** If they are already built,
   skip to publication. For the compiler fleet plus web/gateway:

   ```bash
   npm run build -- builder --release
   npm run build -- web-builder --release
   npm run build -- android-builder --release
   npm run build -- macos-builder --release
   npm run build -- web --release
   npm run build -- worker-gateway --release
   ```

   Omit unused compiler targets; web and gateway remain required for recipe changes.
   Building macOS requires the verified
   `toolchains/macos-toolchain.tar.xz` and matching `MACOS_TOOLCHAIN_SHA256`.
   Validate real compilation/export/launch on affected targets; diagnostic
   archives and unit checks do not establish compiler acceptance.

3. **Push the selected, already-built images on the build host.** Run the commands
   in [publish already-built compiler images](#publish-already-built-compiler-images).
   This is the publication step; the later production-host commands only pull
   those published images. If already published, continue below without rebuilding
   or bumping again.

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
   docker compose -f compose.workers.prod.yml --profile '*' stop builder web-builder android-builder macos-builder
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

   Tokens use `desktop.token`, `web.token`, `android.token` and
   `macos.token`, with mode 0600. If several enabled workers share a target,
   each gets `<platform>-<worker-id>.token` to avoid collisions. The private
   `manifest.json` and command output map ID/name/target to the file and outcome.
   Enrollment uses the filename passed to `--credential-file`; bulk commands
   cannot recover that original path, so match the destination on the worker host.
   Transfer only each host's tokens securely and update its existing
   `*_WORKER_TOKEN_FILE` settings to the new files. Do not copy privileged env
   files or the whole token directory to every host. A failed bulk update can
   leave a partially updated fleet: keep workers stopped/draining, preserve all
   files, and inspect the manifest's `updated`, `uncertain`, and `pending` entries.
   An uncertain response may have committed; never discard that token. With the
   fleet still stopped and idle, rerunning into another fresh directory replaces
   all enabled workers' credentials again and produces a complete new set.

7. **Update each production host's existing `.env`, then pull/recreate.**
   Publishing must have succeeded before this step. The release bump has already
   recorded each image tag in `.env.web.prod.example` and
   `.env.workers.prod.example` in the build checkout. Copy only the published
   services' `*_IMAGE_TAG` lines from those files into the corresponding host's
   existing `.env`. This step does not bump, build, or publish anything.

   On the **application host**, edit only the published services' tag entries
   in its existing `.env`: `WEB_IMAGE_TAG`, `WORKER_GATEWAY_IMAGE_TAG`, and/or
   `MAINTENANCE_IMAGE_TAG`. Leave unchanged services at their existing tags.
   For a recipe rollout, both web and gateway must use the new recipe. Run there:

   ```bash
   docker compose -f compose.web.prod.yml config --images
   docker compose -f compose.web.prod.yml pull web worker-gateway
   docker compose -f compose.web.prod.yml up -d --no-deps --no-build --pull never --force-recreate web worker-gateway
   ```

   Append `maintenance` if that service was also rebuilt and published at a new tag.
   Bring the new gateway up before recreating workers; an old gateway will reject
   the new workers even with valid rotated tokens.

   On **each worker host**, edit the tags for its published targets in that host's
   existing `.env`: `BUILDER_IMAGE_TAG`, `WEB_BUILDER_IMAGE_TAG`,
   `ANDROID_BUILDER_IMAGE_TAG`, and/or `MACOS_BUILDER_IMAGE_TAG`.
   Keep the new `*_WORKER_TOKEN_FILE` paths from step 6. For a host running all
   four targets, run there:

   ```bash
   docker compose -f compose.workers.prod.yml --profile android --profile macos config --images
   docker compose -f compose.workers.prod.yml --profile android --profile macos pull builder web-builder android-builder macos-builder
   docker compose -f compose.workers.prod.yml --profile android --profile macos up -d --no-deps --no-build --pull never --force-recreate builder web-builder android-builder macos-builder
   ```

   For desktop/Web only, remove both profile flags and the Android/macOS service
   names. For Android without macOS, retain only `--profile android` and remove
   `macos-builder`. Apply these changes to the pull/up commands and use the
   corresponding profile flags for config. Inspect
   `config --images` before pulling to confirm the exact tags. Clear stale exported
   image-tag variables if they override the host's `.env`.

   This path uses one `.env` per host; no second tag file or Node installation is
   required on production. Do not replace an entire production `.env`
   with a tag-only file or a build-host env file.

   Preserve the Compose project name and source, ccache, Gradle and work volumes.
   Do not run `down -v`, flush Redis, or delete old artifact rows. The recipe hash
   separates artifact reuse automatically. Record deployed image digests.

8. **Verify recipe identity, then resume.** A healthy gateway can still have an
   old embedded recipe. On the application host, check its running image:

   ```bash
   docker compose -f compose.web.prod.yml exec -T worker-gateway node --import tsx --input-type=module -e 'import { BUILD_RECIPE_VERSION } from "@mingd/build-config"; console.log({ recipe: BUILD_RECIPE_VERSION });'
   ```

   On each worker host, check a compiler image without starting its worker loop:

   ```bash
   docker compose -f compose.workers.prod.yml run --rm --no-deps --entrypoint node builder --import tsx --input-type=module -e 'import { BUILD_RECIPE_VERSION } from "@mingd/build-config"; console.log({ recipe: BUILD_RECIPE_VERSION });'
   ```

   Repeat for each deployed target, replacing `builder` and adding its profile
   when applicable. The gateway, compiler images and `workers -- list` enrollment
   must all report the checkout's new recipe. Recipe mismatch returns HTTP 409;
   rotating tokens does not correct an old gateway image.

   Confirm gateway `/healthz`, expected worker IDs,
   current recipe/toolchain identity, heartbeats, and no unexpected failures in
   `/admin/workers`. Drained workers can heartbeat but cannot claim jobs. Then:

   ```bash
   npm run workers -- list
   npm run workers -- resume --all
   ```

   Re-enable submissions and run a real build/download/export smoke test per
   affected target. Record results using [smoke tests](../developers/smoke-tests.md).
   If verification fails, pause submissions and drain again. Keep the saved
   credentials and previous configuration. Rolling images back alone cannot
   restore old recipe enrollment: use matching enrollment/credentials for the
   old recipe or prepare a tested corrective release with a new recipe identity.

## Distributed cutover and rollback

1. Pause submissions in `/admin/settings` and let queued/active direct builds finish.
   Keep the current release/configuration for rollback. Stopping an active compiler
   interrupts its job; prefer a drained transition.
2. Apply migrations and publish a tested set of compatible service images. Copy the two production files
   to their respective hosts. Preserve the application Compose project name and
   Redis volume. Configure proxy upload limits and worker HTTPS reachability.
3. Stop existing direct builders using their old deployment definition:
   `docker compose --profile '*' stop builder web-builder android-builder macos-builder`.
   Stop only services that actually exist in that deployment.
4. Set both gateway enable flags true and start the application deployment above.
   Enroll each worker using the matching checkout; securely transfer only its token.
   Start the dedicated worker deployment and confirm `workers -- list` last-seen.
5. Submit a test build, watch stages/output/heartbeats, verify a private download and
   checksum, and perform the target's [export/runtime smoke test](../developers/smoke-tests.md).
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

Each host's existing `.env` selects independent per-service image tags.
`IMAGE_TAG` is a fallback for unset service tags, not a lockstep release version.
Compose builds bake the selected per-service tag into each image for worker
details, the Administration footer, and build READMEs. Existing `build`, `push`,
`publish`, and `release` syntax is unchanged. Retagging an existing image retains
its original baked release tag. Direct Docker builds can supply
`--build-arg MINGD_IMAGE_TAG=<tag>`; without it the image reports **local build**.
Use [deploy only what changed](#deploy-only-what-changed) for application-only
updates and the [compiler checklist](#compiler-recipe-and-toolchain-upgrade-checklist)
for binary recipe/toolchain changes. Rollback uses prior service tags with the
same pull/recreate procedure; a recipe enrollment change also needs compatible
worker enrollment, as described in the checklist. No separate inventory file is
required. Review migrations and protocol/recipe/target/toolchain compatibility.

Keep the existing Compose project name when replacing the full deployment with
`compose.web.prod.yml`, so `redis-data` remains the same volume. Inspect
`docker compose ls`; set `COMPOSE_PROJECT_NAME=<existing-name>` in that host's `.env`
or use a consistent `-p`. Worker hosts use their own project names and volumes.
Do not use `down -v` during updates. See [infrastructure identities](../developers/naming.md#infrastructure-identities).

Back up Postgres and Storage together with protected deployment settings and tokens.
Redis uses append-only persistence. Compiler/source caches are rebuildable; build
records/artifacts are user data. Test restores away from production.

Keep existing tokens for compatible application-only upgrades. Use `upgrade --all`
for the drained compiler fleet when enrolled recipe/toolchain capabilities change;
initial enrollment is for new worker identities. Pull before up:
`--no-build --pull never` makes missing images an explicit error.
Application CI does not build/publish production images or apply migrations.
The separate documentation workflow publishes the static documentation site.

Monitor queue wait, whole-container CPU/RAM, gateway upload disk, build failures,
worker last-seen and maintenance errors. Scheduled cleanup does not prune local
compiler/source caches; see [performance](../developers/performance.md) and [maintenance](maintenance.md).

## Source-checkout command reference

The operator entry points are `release`, `build`, `push`, `publish`, `compose`, and `workers`.
They require a source checkout with `package.json`; image-only production hosts
use Docker commands directly.

| Command | Effect |
| --- | --- |
| `npm run release -- platform <patch\|minor\|major> [--dry-run]` | Bump only the platform/root version and capture current package/image versions in an immutable release snapshot |
| `npm run release -- matrix [--dry-run]` | Refresh the platform release matrix from current metadata and captured snapshots without bumping versions |
| `npm run release -- bump <patch\|minor\|major> [--dry-run]` | Advance every component from its own current version; update lockfile, defaults and per-service image tags |
| `npm run release -- bump patch --service web` | Advance only the web package/image release; keep the repo and other services' versions |
| `npm run release -- tags [--env-file <file>]` | Optional local env-file editor; does not publish, deploy, or reach another host. Not a required release step |
| `npm run build -- <service> -- <tag>` | Build one image and remember its tag |
| `npm run push -- <service> -- <tag>` | Push one existing image at its version tag; remember its version |
| `npm run publish -- <service> -- <tag>` | Push one existing image at its version tag and update latest; remember its version |
| `npm run build -- all` | Optional full-set build at configured tags; prepare new tags for every changed image first |
| `npm run build -- <all\|service> --release` | Build using each selected service's prepared tag; build all accepts `--include-macos` |
| `npm run push -- <service> --release` | Push one already-built image at its prepared version tag |
| `npm run push -- all --release` | Optional full-set push, including unchanged services, without rebuilding or promoting latest |
| `npm run publish -- <all\|service> --release` | Push already-built images at their prepared version tags and update each latest alias |
| `npm run push -- all` | Push each service's configured version tag without rebuilding or retagging |
| `npm run publish -- all` | Push each service's configured version tag and update each latest alias without rebuilding |
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
[getting started](../developers/getting-started.md).
