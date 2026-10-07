# min.gd

**Build only the Godot your game needs.**

min.gd is a bootstrap for a hosted custom Godot export-template builder. Users choose a supported target platform, starting preset, and removable engine features. min.gd turns that configuration into a reproducible Godot source build, caches identical artifacts, and stores the resulting `.tpz` in Supabase Storage.

This repository intentionally starts with a narrow, credible real-build milestone:

- Godot version selection: official stable Godot 4 releases from 4.5 onward, discovered automatically with verified source integrity metadata.
- Linux and Windows x86_64 release/debug templates, separately or together.
- Android APK/Gradle templates for ARM64, ARMv7 and x86 architectures; optional Linux macOS cross-worker for Apple Silicon, Intel or universal templates. These new targets initially support Godot 4.6.3 and 4.7.2 and need runtime acceptance. macOS requires an operator-supplied Apple SDK/toolchain.
- Portable `.gdbuild` import/export from build forms, saved recipes and shared links.
- Web wasm32 release/debug templates with single-threaded or threaded exports in a dedicated Emscripten 4.0.11 worker.
- Editable Standard, Lean 2D, Offline 2D and Lean 3D presets plus validated custom feature recipes; `optimize=size` and LTO disabled on all targets.
- The owner confirmed desktop preset smoke tests pass. Newly added versions, debug templates and Web targets need their own acceptance checks.
- Tool-focused workbench with searchable build history, live compiler output, stage timing and worker heartbeats.
- Windows retains Vulkan/OpenGL but omits D3D12, ANGLE, AccessKit and WinRT SDK integrations. See [build profiles](docs/build-profiles.md) for compatibility details.
- Supabase Auth, Postgres, Row Level Security, and private Storage.
- Redis + BullMQ for build jobs.
- Dockerized Linux builder with GCC, MinGW-w64 (POSIX thread model), SCons, and ccache.
  The Debian Bookworm toolchain uses GCC 12 and glibc 2.36; Linux templates target that glibc baseline or newer.
- Build-result deduplication by canonical configuration hash.

iOS, .NET, Web GDExtensions, custom modules, arbitrary `custom.py`, and arbitrary source patches remain out of scope.

## Architecture

Brand: **min.gd**. Repository/technical name: `mingd`; npm scope: `@mingd/`; builder image: `mingd/builder`. See [naming and rebrand rollout](docs/naming.md) for existing checkouts and caches. The future CLI name is `mingd`; no standalone CLI exists yet.

Documentation: [index](docs/README.md), [build profiles](docs/build-profiles.md), [smoke-test procedure](docs/smoke-tests.md), [workbench and activity rollout](docs/workbench.md), [performance and compiler-cache diagnostics](docs/performance.md).

```text
Browser
  |
  v
Next.js 16
  |-- Supabase Auth
  |-- Postgres build records
  |-- private artifact downloads
  |
  +----> Redis / BullMQ ----> Linux builder container
                                |-- official Godot source cache
                                |-- SCons
                                |-- GCC (Linux)
                                |-- MinGW-w64 (Windows)
                                |-- ccache
                                |
                                +----> Supabase Storage (.tpz)
```

The web application never runs a compiler. The builder receives only validated, declarative build configuration. Do not accept arbitrary shell arguments, Python build files, C++ modules, or source patches from users.

## Repo layout

```text
apps/web/                 Next.js App Router application
packages/build-config/    shared schemas, presets, feature dependencies, SCons mapping
services/builder/         BullMQ worker and Godot compiler orchestration
supabase/                 local config + migrations
infra/                    deployment notes
docs/                     build profiles, acceptance status and validation procedures
compose.yml               Redis and optional builder container
AGENTS.md                  repository guardrails for coding agents
```

## Prerequisites

- Node.js 22+
- npm 10+
- Docker / Docker Compose
- Supabase CLI for local development

For production self-hosting, use Supabase's maintained self-hosted Docker distribution rather than exposing the CLI development stack.

## Local setup

1. Copy environment variables.

```bash
cp .env.example .env
cp .env.example apps/web/.env.local
```

2. Install workspace dependencies.

```bash
npm install
```

3. Start local Supabase.

```bash
npx supabase start
```

Copy the local API URL, publishable/anon key, and secret/service-role key into
both `.env` (Compose) and `apps/web/.env.local` (direct Next development). The
names displayed by your Supabase CLI may differ from the newer publishable/secret
terminology; use the client-safe key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
and the server-only privileged key for `SUPABASE_SECRET_KEY`.

4. Apply the migration if your local CLI did not do so automatically.

```bash
npm run db:local:reset
```

5. Start Redis.

```bash
docker compose up -d redis
```

6. Run the web app.

```bash
npm run dev:web
```

7. Run the builder either directly (requires the native Godot toolchains) or through Docker.

```bash
docker compose --profile builder up --build builder
```

Open `http://localhost:3000`.

## Docker application services

The `web` service builds `apps/web/Dockerfile` into a non-root Next.js standalone
runtime on `${WEB_PORT:-3000}`. Compose loads the root `.env`; direct `next dev`
uses `apps/web/.env.local`. Configure the public Supabase API URL so it is
reachable by both the browser and the web container. Container loopback is not
the host's loopback. Browser-safe `NEXT_PUBLIC_*` values are embedded at image
build time, so rebuild the web image when changing them. The privileged key is
passed only at runtime and is never a Docker build argument.

Let existing jobs finish on the old workers before deploying recipe 8. Deploy
the web app and workers together so queued hashes use matching recipe semantics.
Apply pending migrations before starting the expanded workers, including
`20261005064025_build_matrix.sql`. Then run:

```bash
npm run db:migrate:check
npm run db:migrate
docker compose --profile builder up -d --build
```

`web` and Redis are default services. The shared `builder` profile enables both
the desktop (`builder`), Emscripten (`web-builder`) and Android (`android-builder`) workers. macOS has a separate optional `macos-builder` profile. Desktop jobs use
`BUILDER_QUEUE_NAME`; Web jobs use `WEB_BUILDER_QUEUE_NAME` (default
`godot-web-builds`). The Web worker has separate source, compiler-cache and job
volumes. Start only the frontend with `npm run compose:web`, or only the Web
worker with `npm run compose:web-builder:build`. A `/login` HTTP health check
checks frontend readiness without requiring an authenticated session.

Use `npm run compose:builders` to start both workers, or
`npm run compose:builders:build` to rebuild and start both. Their logs are available
with `npm run compose:builders:logs`. The singular `compose:builder` and
`compose:web-builder` commands (and their `:build` variants) target only that
worker and its Redis dependency. Explicit service targets do not need a profile
flag. `npm run compose:up` starts the default web/Redis services; the full-stack
command above enables both workers too.

## Production Supabase configuration

Supabase's CLI development stack is not intended to be internet-facing production infrastructure. For self-hosting, deploy the official Supabase Docker setup, configure backups and SMTP, and point min.gd at its public API endpoint. See `infra/self-hosted-supabase.md`.

Set the server-only `SUPABASE_DB_URL` in `.env` or the deployment environment
to the percent-encoded Postgres connection URI for the self-hosted database.
The database scripts load the repository-root `.env`; an already-exported
deployment value takes precedence. Review pending migrations before applying
them:

```bash
npm run db:status
npm run db:migrate:check
npm run db:migrate
```

`db:migrate` only uses that explicit connection URI; it does not require or
attempt to link a Supabase Cloud project. Do not use `db:local:reset` against
production: it recreates the target database.

Common operational commands:

```bash
npm run compose:ps
npm run compose:logs
npm run compose:down
```

## Build lifecycle

1. Authenticated user submits a `BuildConfig`.
2. The web app normalizes the config and computes `SHA-256(build recipe version + canonical JSON)`.
3. If a matching artifact already exists, a completed build record is created immediately and points at that artifact.
4. Otherwise a `builds` row is created with `queued` status and a BullMQ job is emitted.
5. Builder rechecks the artifact hash to avoid duplicate races.
6. Builder verifies/caches the exact official Godot source archive.
7. Builder generates only server-owned SCons options from the validated config.
8. SCons builds the selected target and template kinds with only generated, allowlisted arguments.
9. Builder validates platform binaries and nested template archives (Android native ELF/APK/AAR, macOS Mach-O, Web WASM, Linux ELF or Windows PE32+ output) (including the Windows console wrapper), packages Godot filenames, `version.txt`, and a README, then tests ZIP integrity before upload.
10. Artifact is uploaded to the private `build-artifacts` Supabase bucket.
11. Artifact metadata and final build status are written to Postgres.
12. The download route checks ownership and generates a short-lived signed Storage URL.


### Cache invalidation

`packages/build-config/src/recipe.ts` contains `BUILD_RECIPE_VERSION`. The cache identity includes this version, canonical normalized configuration, and the pinned official source URL/checksum. Bump it whenever the worker toolchain, compiler policy, packaging layout, or SCons mapping changes enough that existing artifacts should not be reused.

## Godot release discovery

The version selector reads GitHub's official `godotengine/godot-builds` release
catalog on the server. It includes stable Godot 4 releases from **4.5 onward**,
including initial minor releases and all available patches, sorted newest first.
Development snapshots, betas, release candidates, older branches and future major
versions are excluded. 4.5 is the minimum for the current feature/module recipe;
older branches need separate mappings and toolchain validation.

The catalog refreshes hourly per process, follows pagination and accepts only
official source assets with a SHA-256 digest. Submission and the worker resolve
the selected release independently; source URL/checksum remain part of the cache
identity, and the downloaded archive is verified before compilation. Users cannot
supply repositories, Git refs, source URLs or checksums. Source-cache directories
include the checksum so changed release bytes cannot reuse an old extracted tree.

If GitHub is unavailable or rate limited, a process retains its last verified
catalog and retries after one minute. A fresh process falls back to the two
previously pinned releases and shows a notice in the selector. Newly published
releases appear after refresh without a code change or redeployment. Discovery
does not establish runtime acceptance; use the smoke tests for each new release.

`packages/build-config/src/versions.ts` retains Godot `4.7.2-stable` as an offline fallback:

- Official release archive: `godot-4.7.2-stable.tar.xz`
- SHA-256: `a18ce0ccec3ecc40b0dd6c4f5132ca934e9fb7c2979717940ff32aee1eb35481`

The fallback also includes 4.6.3. Minimum-version policy lives in the shared
build configuration package; lower it only after verifying the older build flags.

## Important safety rules

- Never run user-provided `custom.py`.
- Never interpolate raw user strings into SCons command lines.
- Use `spawn()`/argument arrays, never `shell: true`.
- Keep the Supabase privileged key out of client bundles.
- Keep artifact Storage private and issue signed URLs after ownership checks.
- Treat the build container as disposable and deny unnecessary host mounts/capabilities in production.
- Keep worker resource limits and compile timeouts configured for the host.
- Validate the produced binaries before marking artifacts complete.

## Dry-run mode

Set `BUILDER_DRY_RUN=true` to test queue and database plumbing without compiling Godot. The worker will emit a small diagnostic `.tpz` describing the requested build. Never expose dry-run artifacts as real templates in production.

## Real-template smoke test

`tests/fixtures/smoke-project` is the repository-owned fixture for validating a completed real artifact. It has a small 2D scene using Node2D, Sprite2D, Label, CharacterBody2D, CollisionShape2D, AudioStreamPlayer, and GDScript.

Follow [the smoke-test procedure](docs/smoke-tests.md) for both platforms and all four presets. Apply pending migrations, including `20261005044808_build_performance.sql`, before rebuilding the worker and restarting the web application; see [rollout instructions](docs/workbench.md). Use release export because these packages do not contain debug templates.

The worker records the package SHA-256 and size, compiled-template size, Godot/version/source identity, platform, architecture, normalized configuration, and build recipe version. The database deliberately leaves an official-template comparison empty until an actual official reference artifact is measured; no comparison is estimated.

## Current status snapshot

The repository now includes the following implemented capabilities in code and documentation:

- official Godot 4 release discovery with verified source metadata and cache identities;
- Linux and Windows desktop template builds, plus Android and macOS worker support under toolchain-specific validation;
- `.gdbuild` portability/import support, saved recipes and shared recipe links;
- account and admin access controls, queue recovery and build visibility flows;
- size-comparison and compatibility guidance based on measured official references where they exist;
- workbench, build-history and performance diagnostics.

These features are real, implemented and documented. However, they are not all production-accepted yet. Runtime acceptance remains pending for Android and macOS exports on real devices and Apple toolchains, and the self-hosted rollout still needs operator configuration for SMTP, admin provisioning and deployment validation.

## Current focus

1. Validate the expanded version/debug/Web build matrix and browser exports.
2. Verify Android and macOS runtime acceptance on target devices and toolchains.
3. Complete self-hosted rollout for [accounts and administration](docs/accounts-and-admin.md), including SMTP setup and SuperAdmin assignment.
4. Finish the UX and validation pass for [saved/shared recipes, compatibility guidance and measured size comparisons](docs/recipes-and-comparisons.md).
5. Finish the remaining UI review and authenticated end-to-end smoke tests.

## License

No project license is selected in this bootstrap. Add the license you intend to use before publishing the repository.

Portable `.gdbuild` recipes, Android templates and optional macOS cross-compilation are described in [Recipe files and mobile templates](docs/recipe-files-and-mobile-templates.md). Android joins the `builder` profile; macOS uses its own optional profile and requires an operator-supplied Apple SDK/toolchain. Apply new migrations through your normal push workflow before using the new artifact targets.
