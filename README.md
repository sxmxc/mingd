# gdslimmer

**Build only the Godot your game needs.**

gdslimmer is a bootstrap for a hosted custom Godot export-template builder. Users choose an official Godot version, target platform, optimization level, and removable engine features. gdslimmer turns that configuration into a reproducible Godot source build, caches identical artifacts, and stores the resulting `.tpz` in Supabase Storage.

This repository intentionally starts with a narrow, credible real-build milestone:

- Godot 4.7.2 stable is pinned to the official release source archive and SHA-256.
- Linux x86_64 `template_release` only.
- Standard (least-stripped) feature configuration, `optimize=size`, and LTO disabled.
- Windows and Lean 2D remain unavailable until the Linux Standard template has passed the packaging and smoke-test procedure below.
- Supabase Auth, Postgres, Row Level Security, and private Storage.
- Redis + BullMQ for build jobs.
- Dockerized Linux builder with GCC, MinGW-w64 (POSIX thread model), SCons, and ccache.
  The Debian Bookworm toolchain uses GCC 12 and glibc 2.36; Linux templates target that glibc baseline or newer.
- Build-result deduplication by canonical configuration hash.

Web, Android, macOS/iOS, .NET, custom modules, arbitrary `custom.py`, and arbitrary source patches are deliberately out of scope for the bootstrap.

## Architecture

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
```

2. Install workspace dependencies.

```bash
npm install
```

3. Start local Supabase.

```bash
supabase start
```

Copy the local API URL, publishable/anon key, and secret/service-role key into `.env`. The names displayed by your Supabase CLI may differ from the newer publishable/secret terminology; use the client-safe key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the server-only privileged key for `SUPABASE_SECRET_KEY`.

4. Apply the migration if your local CLI did not do so automatically.

```bash
supabase db reset
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

## Production Supabase

Supabase's CLI development stack is not intended to be internet-facing production infrastructure. For self-hosting, deploy the official Supabase Docker setup, configure backups and SMTP, and point gdslimmer at its public API endpoint. See `infra/self-hosted-supabase.md`.

## Build lifecycle

1. Authenticated user submits a `BuildConfig`.
2. The web app normalizes the config and computes `SHA-256(build recipe version + canonical JSON)`.
3. If a matching artifact already exists, a completed build record is created immediately and points at that artifact.
4. Otherwise a `builds` row is created with `queued` status and a BullMQ job is emitted.
5. Builder rechecks the artifact hash to avoid duplicate races.
6. Builder verifies/caches the exact official Godot source archive.
7. Builder generates only server-owned SCons options from the validated config.
8. SCons builds the Linux release template with only generated, allowlisted arguments.
9. Builder checks the compiled file is a non-empty x86_64 ELF executable, packages the canonical Godot filename (`linux_release.x86_64`), `version.txt`, and a README, then tests the ZIP before upload.
10. Artifact is uploaded to the private `build-artifacts` Supabase bucket.
11. Artifact metadata and final build status are written to Postgres.
12. The download route checks ownership and generates a short-lived signed Storage URL.


### Cache invalidation

`packages/build-config/src/recipe.ts` contains `BUILD_RECIPE_VERSION`. The cache identity includes this version, canonical normalized configuration, and the pinned official source URL/checksum. Bump it whenever the worker toolchain, compiler policy, packaging layout, or SCons mapping changes enough that existing artifacts should not be reused.

## Current pinned Godot source

`packages/build-config/src/versions.ts` currently pins Godot `4.7.2-stable`:

- Official release archive: `godot-4.7.2-stable.tar.xz`
- SHA-256: `a18ce0ccec3ecc40b0dd6c4f5132ca934e9fb7c2979717940ff32aee1eb35481`

Add versions deliberately. Every supported version should have an exact source URL and checksum. Do not dynamically build arbitrary Git refs for normal users.

## Important safety rules

- Never run user-provided `custom.py`.
- Never interpolate raw user strings into SCons command lines.
- Use `spawn()`/argument arrays, never `shell: true`.
- Keep the Supabase privileged key out of client bundles.
- Keep artifact Storage private and issue signed URLs after ownership checks.
- Treat the build container as disposable and deny unnecessary host mounts/capabilities in production.
- Add CPU, RAM, disk, queue, and wall-clock quotas before public launch.
- Validate the produced binaries before marking artifacts complete.

## Dry-run mode

Set `BUILDER_DRY_RUN=true` to test queue and database plumbing without compiling Godot. The worker will emit a small diagnostic `.tpz` describing the requested build. Never expose dry-run artifacts as real templates in production.

## Real-template smoke test

`tests/fixtures/smoke-project` is the repository-owned fixture for validating a completed real artifact. It has a small 2D scene using Node2D, Sprite2D, Label, CharacterBody2D, CollisionShape2D, AudioStreamPlayer, and GDScript.

1. Set `BUILDER_DRY_RUN=false`, submit the fixed Linux Standard profile, and download the completed `.tpz`.
2. In Godot 4.7.2, install the package through **Editor > Manage Export Templates**.
3. Import `tests/fixtures/smoke-project`, create a Linux/X11 export preset, and export it.
4. Run the exported executable. A 640×360 window showing `GDSlimmer smoke test passed` is a pass.

The worker records the package SHA-256 and size, compiled-template size, Godot/version/source identity, platform, architecture, normalized configuration, and build recipe version. The database deliberately leaves an official-template comparison empty until an actual official reference artifact is measured; no comparison is estimated.

## Suggested next milestones

1. Finish auth UX and email configuration.
2. Add build quotas/rate limits.
3. Add per-build log streaming/tailing.
4. Run real Windows/Linux builds and pin compiler/toolchain versions.
5. Compare artifact size to official templates and show savings in the UI.
6. Add `.gdbuild` import after validating its format and threat model.
7. Add Web builds in a dedicated Emscripten worker image.
8. Add billing only after build-cost measurements exist.

## License

No project license is selected in this bootstrap. Add the license you intend to use before publishing the repository.
