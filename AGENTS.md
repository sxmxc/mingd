# AGENTS.md — mingd

This file is for coding agents working in this repository. It defines how to inspect, modify, validate, and extend the codebase. Do not treat it as a product brief.

## 1. Start by inspecting, not guessing

Before changing code:

1. Read this file.
2. Read the relevant `package.json`, `tsconfig.json`, config files, and nearby implementation files.
3. Inspect the current git diff/status so you do not overwrite user changes.
4. Check which MCP servers, skills, plugins, and repo-aware tools are available in the current environment.
5. Use version-specific documentation/tooling before changing framework, Supabase, Godot, or build-system behavior.

Do not assume prior chat context is available. Do not invent files, APIs, environment variables, database columns, SCons flags, or framework conventions without checking the repository or authoritative tooling/docs.

Keep changes scoped to the task. Do not perform unrelated refactors, dependency upgrades, formatting sweeps, renames, or architecture changes unless required.

## 2. Prefer environment-provided MCPs and skills

Use available first-party or repo-aware tooling before relying on memory.

### Supabase tooling

This project uses Supabase for PostgreSQL, Auth, Storage, and related backend services.

When working with Supabase:

1. Prefer the project's Supabase MCP endpoint when it is available.
   A local `supabase start` development stack exposes an MCP endpoint, typically:

   http://127.0.0.1:54321/mcp

2. Before guessing about the current database schema, migrations, RLS policies,
   storage buckets, Auth configuration, or Supabase capabilities, inspect the
   live project through Supabase MCP/tooling when available.

3. Use Supabase MCP for inspection and validation, but keep persistent schema
   changes represented in source-controlled migrations under `supabase/migrations/`.

4. Do not make undocumented database changes only through MCP or Studio.
   A fresh `supabase db reset` must reproduce the required development schema.

5. Never expose service-role/secret credentials to client-side code.
   `NEXT_PUBLIC_*` variables are browser-visible.

6. When the local Supabase stack is not running, do not invent current project
   state. Inspect migrations and configuration files instead, or start the
   local stack if the environment permits it.

7. Prefer current Supabase MCP/API/schema information over remembered SDK behavior.

### Next.js

If a Next.js MCP, Next.js DevTools MCP, Next.js skill, or framework-aware documentation tool is available, use it before changing version-sensitive Next.js behavior such as:

- App Router conventions;
- Server vs Client Components;
- `proxy.ts` / request interception;
- caching and revalidation;
- route handlers;
- environment loading;
- Turbopack configuration;
- React/Next runtime APIs;
- build/runtime errors.

First read `apps/web/package.json` to determine the installed Next.js version. Do not answer from conventions from older Next.js releases when the installed version differs.

<!-- BEGIN:nextjs-agent-rules -->
 
# This is NOT the Next.js you know
 
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.
 
This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
 
<!-- END:nextjs-agent-rules -->

### Godot

When changing Godot compilation flags, supported versions, output names, modules, or toolchains, verify behavior against documentation/source for the **exact supported Godot version**. Do not assume a flag from another Godot release is still valid.

### Environment-aware tooling

Before implementing or debugging framework-specific behavior, inspect the tools
available in the current agent environment.

Prefer, when available:

- Supabase MCP for Supabase project/database/Auth/Storage state.
- Next.js MCP / Next.js DevTools MCP for the running Next.js application.
- Installed Next.js skills for current framework conventions and APIs.
- Package/framework documentation tools over remembered API behavior.
- Repository-aware tools over assumptions about file contents.

Do not claim an MCP, skill, plugin, or tool is unavailable until the current
environment has been inspected for it.

### If tooling is unavailable

Use official documentation or authoritative source code. State uncertainty when the repository or authoritative source does not establish the answer. Do not compensate by inventing configuration.

Do not add MCP servers or AI tooling as runtime application dependencies unless explicitly requested.

## 3. Repository layout and ownership

```text
apps/web/
  Next.js App Router application.
  UI, Supabase Auth integration, build submission/history, user-facing API/route handlers.

packages/build-config/
  Shared build contract.
  Zod schemas, types, defaults, presets, normalization, supported Godot versions,
  cache recipe semantics, and SCons argument generation.

services/builder/
  BullMQ worker.
  Fetches/verifies Godot source, compiles templates, packages artifacts,
  uploads artifacts, and updates build state.

supabase/
  Local Supabase configuration and source-controlled database/storage migrations.
```

Respect these boundaries.

The web application must not compile Godot directly.

The builder must not define its own independent interpretation of build features.

`packages/build-config` is the canonical source of truth for build semantics shared by the web app and builder.

## 4. Package and module-resolution discipline

This is an npm-workspaces monorepo. Use the repository's existing npm workspace structure rather than adding another package manager or monorepo framework.

`@mingd/build-config` is consumed by both:

- Next.js/Turbopack in `apps/web`;
- the Node/tsx builder in `services/builder`.

Do not casually change its ESM/import/module-resolution strategy. A change that satisfies TypeScript alone can still break Turbopack, and a change that satisfies Turbopack can still break the builder runtime.

When touching package exports, relative import extensions, `module`, `moduleResolution`, or `transpilePackages`, verify **both consumers**.

Do not alternate between `.js`, `.ts`, and extensionless imports based on guesswork. Inspect the current package metadata and tsconfigs, choose one coherent strategy, and validate it end-to-end.

## 5. Next.js rules

- Use the App Router already present in `apps/web`.
- Prefer Server Components by default; add `"use client"` only where browser state/effects/events require it.
- Keep route handlers and server actions thin. Put reusable build semantics in `packages/build-config`.
- Do not access privileged Supabase credentials from Client Components.
- Do not duplicate authentication/session logic when the existing Supabase helpers can be extended.
- Preserve current framework conventions unless current Next.js tooling/docs show they need to change.

### Environment files

The web workspace and Docker services do not automatically read the same env file.

- Next.js development reads `apps/web/.env.local`.
- Docker Compose/builder configuration uses the repository-root `.env`.

When adding an environment variable, determine which process needs it and update the correct example/documentation. Do not assume a root `.env` will be loaded by `next dev` running from `apps/web`.

Only values intentionally safe for browser exposure may use the `NEXT_PUBLIC_` prefix.

## 6. Supabase rules

Source-controlled migrations are authoritative for database/storage structure.

When changing schema, indexes, constraints, RLS, buckets, or storage policies:

1. inspect the current migration history;
2. add a new migration rather than editing deployed history unless the task is explicitly resetting an unreleased bootstrap migration;
3. preserve/strengthen RLS;
4. test against local Supabase;
5. verify application queries still respect ownership boundaries.

Use `npx supabase ...` from this repository; do not assume a globally installed Supabase CLI.

Useful local validation includes:

```bash
npx supabase start
npx supabase db reset
```

Do not use Supabase Studio/dashboard-only edits as the final implementation.

### Secrets and privileged access

- `NEXT_PUBLIC_SUPABASE_URL` and the publishable key are browser-safe configuration.
- `SUPABASE_SECRET_KEY` is privileged and must never enter browser bundles or `NEXT_PUBLIC_*` variables.
- The builder may use privileged Supabase access for artifact writes and build-state updates.
- User-facing downloads must be authorized before creating a signed/private download URL.

### Storage

Artifacts are application-generated, not user-uploaded executable inputs.

Keep the artifact bucket private unless the product requirements explicitly change.

Do not trust object paths, metadata, or filenames derived directly from unvalidated user input.

## 7. Build configuration is a trust boundary

All build requests must pass through the shared validated `BuildConfig` schema before they are normalized, hashed, queued, or compiled.

The following must never come directly from user input into a compiler command:

- arbitrary shell text;
- arbitrary SCons arguments;
- `custom.py`;
- compiler flags;
- source URLs;
- Git refs/commits;
- C/C++ modules;
- source patches;
- filesystem paths.

Build commands must be constructed from allowlisted typed configuration.

Do not use `shell: true` for compiler orchestration.

When adding a user-selectable build feature, update the feature across the whole shared contract as applicable:

1. schema/type;
2. defaults;
3. presets;
4. dependency normalization;
5. UI metadata/help text;
6. SCons mapping;
7. tests;
8. cache recipe/version if build semantics changed.

Do not add a frontend-only toggle that the builder ignores.

## 8. Godot source and version rules

Supported Godot releases must be explicitly allowlisted in `packages/build-config/src/versions.ts` (or its current replacement if refactored).

For each supported release, preserve enough immutable metadata to verify the source being built, including an exact official source location and SHA-256/checksum when available.

Never build arbitrary user-selected repositories, branches, commits, forks, or URLs.

Do not silently substitute a different Godot patch release for the version requested.

When changing build flags or supported modules, verify them against the exact Godot release being supported.

## 9. Cache correctness

Build artifacts may be deduplicated only when their complete build recipe is equivalent.

The canonical artifact/cache identity must include all inputs that can change the produced binary, including as applicable:

- Godot version/source identity;
- platform;
- architecture;
- template kind;
- normalized build configuration;
- optimization settings;
- build recipe version;
- toolchain/container semantics when they materially affect output.

If compiler/toolchain behavior or SCons mapping changes such that an old cached binary is no longer equivalent, bump `BUILD_RECIPE_VERSION` (or the current equivalent) rather than reusing stale artifacts.

Normalization must happen before canonical hashing.

## 10. Builder security and reliability

The builder is a privileged execution boundary.

- Never mount the Docker socket into build workers.
- Never mount host root filesystems.
- Never execute user-provided code or command fragments.
- Use isolated per-job work directories.
- Keep source/cache directories separate from job workspaces.
- Verify downloaded Godot source before compiling.
- Treat build jobs as retryable/idempotent where practical.
- Handle duplicate queue deliveries safely.
- Sanitize artifact paths and filenames.
- Add explicit process timeouts/resource controls when introducing potentially unbounded work.
- Do not expose privileged Supabase credentials in logs.

If a requested feature requires relaxing one of these boundaries, stop and surface the tradeoff instead of silently weakening it.

## 11. Database and build-state behavior

User-owned build records must remain protected by RLS/authorization.

Artifact/cache records may be shared internally across multiple user build records when the canonical build hash matches, but users must not gain access to other users' build metadata as a consequence.

Keep build-state transitions explicit. Avoid code that can accidentally move a failed/completed build back into an earlier state without a defined retry path.

Do not claim a build succeeded merely because a queue job completed; artifact creation/upload and required validation must have succeeded.

## 12. UI behavior

The UI should expose semantic build choices, not raw compiler flags.

Do not make users understand SCons internals to use normal presets.

Warnings should explain concrete compatibility consequences rather than generic danger text.

Keep advanced/raw build details behind advanced UI where appropriate, but raw arbitrary command input is never allowed.

## 13. Validation workflow

Run the smallest relevant checks while working, then run the repository-level checks before finishing when practical.

Baseline checks:

```bash
npm run typecheck
npm test
```

For Next.js changes, also exercise the affected route/page in development and run the web build when the environment is configured for it.

For Supabase migration/RLS/storage changes, reset/test the local stack:

```bash
npx supabase db reset
```

For builder changes, test dry-run mode first when applicable before spending time on a real Godot compile.

For changes to shared build configuration, verify both:

- `apps/web` can import/use the package under Next/Turbopack;
- `services/builder` can import/use it under its Node/tsx runtime.

Do not say a command/test passed unless you actually ran it or the user supplied its successful output.

## 14. Tests expected for shared build logic

Add/update tests when changing shared build behavior. Important invariants include:

- normalization is deterministic and idempotent;
- invalid/conflicting feature combinations normalize or reject safely;
- canonical build/cache input is stable;
- supported versions contain required integrity metadata;
- SCons arguments contain only allowlisted generated values;
- output/template filename mapping matches the supported Godot version/platform;
- build recipe changes invalidate cache identity when required.

Prefer pure tests for `packages/build-config` over testing the same rules indirectly through UI components.

## 15. Dependency and architecture changes

Before adding a dependency, confirm the existing stack cannot reasonably solve the problem.

Do not introduce new backend platforms, auth providers, ORMs, queues, object stores, monorepo systems, container orchestrators, or cloud services without an explicit requirement.

The current stack is intentionally understandable:

- Next.js;
- Supabase Auth/Postgres/Storage;
- Redis/BullMQ;
- isolated Godot builder service;
- npm workspaces.

This list is architectural context, not permission to duplicate capabilities.

## 16. Documentation and agent behavior

Update README/config examples when a change alters setup, required environment variables, supported platforms, or developer workflow.

Keep `AGENTS.md` focused on **how agents should work in the repository**. Product positioning, marketing copy, roadmap, and feature pitches belong elsewhere.

When repository state contradicts documentation, inspect the implementation and authoritative tooling, call out the inconsistency, and fix the appropriate source rather than blindly following stale prose.

When you encounter an error:

1. read the complete error;
2. inspect the exact files/configuration involved;
3. reproduce or verify the cause where possible;
4. make the smallest coherent fix;
5. rerun the relevant validation.

Do not cycle through mutually incompatible fixes without first determining which module/runtime/toolchain strategy the repository actually uses.
