---
title: "Development and validation"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/development.md
---

# Development and validation

Use [getting started](getting-started.md) to configure development services.
Use [AGENTS.md](../AGENTS.md) for repository boundaries and change rules.
Commands here run from the repository root.

## Browser access to the dev server

Run `npm run dev:web` and open `http://localhost:3000` on the server, or
`http://docker01.voidmoose.local:3000` from the local network. The web config
explicitly allows that LAN hostname and `127.0.0.1` for Next.js development
assets and the `/_next/hmr` WebSocket; localhost is allowed by Next.js itself.
If you use a different LAN hostname, add its hostname (without scheme or port)
to `allowedDevOrigins` in `apps/web/next.config.ts`.

A blocked HMR origin can prevent client hydration, leaving navbar menus
unresponsive. After changing the allowlist, let the dev server restart (or
restart `npm run dev:web`) and reload the browser. A reverse proxy must also
forward WebSocket upgrades. This allowlist is development-only and does not
change production origins or Supabase configuration.

## Baseline checks

```bash
nvm use
npm ci
npm exec --workspace @mingd/web -- next typegen
npm run typecheck
npm test
npm run build
```

`next typegen` prepares generated route types on a fresh checkout. Next.js 16
loads the web config in the production phase for this command. The build uses
configured public frontend settings; neither a successful typecheck nor a build
establishes working Auth or database connectivity.

The root `package.json` records version-specific `allowScripts` approvals for
esbuild's binary setup and msgpackr-extract's native addon setup. With the npm
version bundled with `.nvmrc`, inspect new install-script warnings from the
repository root using `npm install-scripts ls`. After reviewing an updated
package's script, run `npm install-scripts approve <package>` and commit the
resulting approval. Approvals are pinned to the reviewed package versions;
upgrading either dependency can require another review. Run `npm ci` again to
apply approved scripts to a clean install.

Root scripts cover all applicable workspaces. `npm run build` builds web and
runs the Starlight documentation build and shared/service TypeScript build checks;
builder runtime uses `tsx` rather than a generated `dist` service. Production
web builds use Next.js's default Turbopack bundler through the same workspace
script in local builds, CI, and Docker.
Use workspace commands for focused tests:

```bash
npm test --workspace @mingd/build-config
npm test --workspace @mingd/web
npm test --workspace @mingd/builder
npm test --workspace @mingd/worker-protocol
npm test --workspace @mingd/worker-gateway
```

### Recovering a canceled Turbopack build

An observed Next.js 16.3.8 `ModuleGraph::from_graphs_inner was canceled` panic
repeated with dependencies matching the lockfile. Clearing generated `.next`
state allowed the same installation to build successfully with Turbopack.
The panic alone does not prove that every cancellation has this cause.

Stop any dev server or concurrent build in this checkout before resetting the
generated output. From the repository root:

```bash
nvm use
rm -rf apps/web/.next
npm run build
```

If the dependency installation may also be stale after a checkout or runtime
change, run `npm ci` before rebuilding. Keep `package-lock.json`; it defines the
dependency versions being validated. If a clean build still fails, inspect the
new panic log before changing bundlers or dependency versions.

Gateway enrollment and idle-heartbeat diagnostics are documented in
[worker control](distributed-workers.md#authentication-and-operator-controls).
The operator CLI reads root `.env`; the HTTPS probe needs only its worker token.

For Next.js route/UI changes, exercise affected states in development and run the
web build. For shared build-contract changes, validate both Next/Turbopack and
Node/tsx consumers, including package resolution and cache semantics.

## Test coverage and tool requirements

Node 24 is the runtime baseline in `.nvmrc`, CI, Dockerfiles, and `@types/node`.
Dependabot keeps minor and patch updates enabled but holds Node image/type and
TypeScript major upgrades for coordinated validation. Emscripten major upgrades
are also held; minor, patch, and digest PRs remain enabled. Compiler image PRs require
manual review: verify the exact Godot releases with real compilation and export
smoke tests, then bump `BUILD_RECIPE_VERSION` before publishing new workers.
Recipe 10 accounts for the Emscripten 6.0.11 update; it invalidates recipe 9
artifacts that may have used either Emscripten 4.0.11 or 6.0.11. Unit checks do
not establish native acceptance of the new compiler. Follow the
[compiler rollout checklist](deployment.md#compiler-recipe-and-toolchain-upgrade-checklist)
for releasing these changes; this guide covers local validation, not production deployment.

| Checks | What they establish | Additional requirements |
| --- | --- | --- |
| Shared pure tests | Normalization, schemas, recipes/hashes, presets, versions, SCons arguments, comparisons, portable files | Node/npm |
| Web tests | Rendering/access-flow helpers, request handling, account/UI invariants | Node/npm |
| Builder tests | Process handling, archive/binary fixtures, performance, recovery, maintenance, reference measurement | Python 3, `zip`, `unzip`; some compiler checks opt in |
| Worker protocol/gateway tests | Protocol negotiation, credential parsing, ownership RPC adapters, HTTPS client, Fastify health/body/error handling | Node/npm and Python 3 for upload-validation fixtures |
| SQL tests | Migrations, constraints, ownership, roles, sharing, maintenance policies | Docker and disposable local Supabase Postgres |
| Native smoke tests | Real template install, export, and game launch | Matching Godot editor and target OS/browser/device |

For template installation, export, and launch checks, use
[smoke tests](smoke-tests.md). Previous results are in the
[acceptance record](build-profiles.md#acceptance-tracking).

With a configured checkout, test inside the desktop image when host archive/
compiler tools are missing:

```bash
docker compose build builder
docker compose run --rm --no-deps -v "$PWD/scripts:/app/scripts:ro" -v "$PWD/services/worker-gateway:/app/services/worker-gateway:ro" --entrypoint npm builder test --workspace @mingd/builder
```

The image includes builder source/tests and shared configuration. The read-only
`scripts/` mount supplies the official-reference measurement helper, which the
desktop image does not copy. Fixture tests need no running production queue. To check unbuilt source edits,
rebuild first; mounting the whole checkout over `/app` can hide image dependencies.
macOS/Android fixture tests validate synthetic archives, not native compilers.

## Database changes

Create a new migration rather than changing deployed history:

```bash
npm run db:migration:new -- descriptive_name
```

On a disposable local project only:

```bash
npx supabase start
npm run db:local:reset
npx supabase test db --local
```

This reapplies the complete migration history, then tests all SQL files in
`supabase/tests`. Reset destroys local data. Never point this workflow at the
self-hosted production database. Production applies pending migrations using
[deployment commands](deployment.md#database-migrations).

## Direct worker development

`npm run dev:builder` starts the desktop worker under `tsx watch`. Export the
server variables or load root `.env`, and use writable host cache/work paths.
A Web process needs its own toolchain and explicit routing, for example inside
an environment already provisioned with Emscripten:

```bash
BUILDER_TARGET=web BUILDER_QUEUE_NAME=godot-web-builds npx dotenv -- npm run dev:builder
```

`npm run dev:web-builder` loads root `.env` and selects the Web target/default
Web queue. For a custom queue, use the explicit command above. Desktop, Web, Android, and macOS
all use `services/builder` with different toolchains/targets.

Use `BUILDER_DRY_RUN=true` only for diagnostic pipeline checks in a disposable
setup. Dry-run still downloads/verifies source and cannot produce a usable
export template. Return to real mode for acceptance.

## Opt-in compiler/source audits

GCC/MinGW cache integration checks run when their tools are present; they require
cold miss, warm hit from a different workspace, and matching object bytes.
The optional exact-source SCons audit requires a verified cached source directory.
For the pinned Godot 4.7.2 source in the desktop builder:

```bash
MINGD_GODOT_SOURCE=/cache/godot/4.7.2/a18ce0ccec3ecc40b0dd6c4f5132ca934e9fb7c2979717940ff32aee1eb35481/source
docker compose run --rm --no-deps -e MINGD_GODOT_SOURCE="$MINGD_GODOT_SOURCE" --entrypoint node builder --import tsx --test services/builder/test/godot-source.test.ts
```

Confirm that path exists in the service's source-cache volume. Source paths are
`<cache>/<version>/<source-sha256>/source`; use the resolved digest for other
releases. The test copies source to a disposable workspace and checks flags/output names without compiling
a full template. See [performance](performance.md) for measurement limits.

`scripts/audit-build-matrix.mjs` runs discovered-release Linux/Windows/Web audits
with three concurrent SCons dry-runs. Run it with `node --import tsx` inside a
provisioned Web worker image, with `scripts/` available at `/app/scripts` and
`GODOT_CACHE_DIR` set to a disposable writable cache. It downloads/verifies official
sources and requires network access. Worker-config URL/key/Redis placeholders
satisfy configuration loading; the audit does not connect to a database or queue.
Do not run it against an active worker's mutable workspace.

## Contribution checklist

Keep changes within the owning component. Feature changes must update the shared
schema, defaults/presets, normalization, guidance, SCons mapping, tests, and cache
identity as needed. Never accept raw compiler/source/command inputs.

Update setup/examples when configuration changes, and update the relevant guide
plus [documentation index](README.md). Preserve user edits and deployed migration
history. Review `git diff --check` and changes before submitting.

Local screenshots, `.playwright-mcp/`, secrets, SDK/toolchain archives, and
compiled artifacts are not source files. Ignore rules do not untrack files
already committed; review staged files before committing. Test reports should
state actual checks and skips, rather than repeating old success counts.

[CI](ci.md) provides application/database/image gates. It currently does not
compile every Godot target, test real Auth emails, or deploy production.
