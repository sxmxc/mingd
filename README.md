# min.gd

[![CI](https://github.com/sxmxc/mingd/actions/workflows/ci.yml/badge.svg)](https://github.com/sxmxc/mingd/actions/workflows/ci.yml)
[![Documentation](https://github.com/sxmxc/mingd/actions/workflows/docs.yml/badge.svg)](https://github.com/sxmxc/mingd/actions/workflows/docs.yml)

**Build only the Godot your game needs.**

min.gd builds custom Godot export templates from official, checksum-verified
source. Choose a platform and preset, remove engine features your project does
not need, and download an installable `.tpz`. Equivalent recipes reuse cached
artifacts.

The application includes saved and shared recipes, portable `.gdbuild` files,
build history with live compiler output, measured template-size comparisons,
account management, an admin area, and scheduled maintenance.

## Supported builds

| Platform | Architectures | Versions |
| --- | --- | --- |
| Linux | x86_64 | Discovered official stable Godot 4 releases, 4.5 onward |
| Windows | x86_64 | Same release policy as Linux |
| Web | wasm32, single-threaded or threaded | Same release policy as Linux |
| Android | ARM64, ARMv7, x86_64, x86 | 4.6.3 and 4.7.2 |
| macOS | Apple Silicon, Intel, universal | 4.6.3 and 4.7.2; operator-provided SDK/toolchain required |

All targets offer release, debug, or both kinds, using size optimization with
LTO disabled. Standard, Lean 2D, Offline 2D, and Lean 3D are editable presets.
See [build profiles](https://sxmxc.github.io/mingd/build-profiles/) for restrictions and acceptance
records. Desktop smoke results are owner-confirmed; the expanded version/Web/
mobile matrix still needs its own runtime acceptance.

iOS, .NET, arbitrary source repositories, custom modules, patches, and compiler
commands are outside the supported build contract.

## Run it

Use npm workspaces and Node **24.21.0**, pinned in [.nvmrc](.nvmrc). Docker images
currently use Node 22 independently of the host runtime.

- **Develop locally:** follow [getting started](https://sxmxc.github.io/mingd/getting-started/) for
  local Supabase, Next.js development, and workers.
- **Deploy to a dedicated server:** follow [deployment](https://sxmxc.github.io/mingd/deployment/) and
  [self-hosted Supabase](https://sxmxc.github.io/mingd/self-hosted-supabase/). Supabase runs separately
  from this project's Compose stack.
- **Configure processes:** use the [environment reference](https://sxmxc.github.io/mingd/configuration/).
  Next.js development reads `apps/web/.env.local`; Compose reads the root `.env`.

Production uses `compose.web.prod.yml` on the application host and
`compose.workers.prod.yml` on dedicated build hosts, each with its own `.env`.
Workers connect over authenticated HTTPS; Redis stays private. Builds and
migrations run from an authorized checkout. See [production deployment](https://sxmxc.github.io/mingd/deployment/#production-with-only-compose-and-env)
for setup, updates, optional macOS workers, and rollback.

## Documentation

Browse the [documentation site](https://sxmxc.github.io/mingd/) for guides grouped by task.
See [documentation site setup](https://sxmxc.github.io/mingd/documentation/) for publishing and local preview.

| I want to… | Guide |
| --- | --- |
| Understand the components and build lifecycle | [Architecture](https://sxmxc.github.io/mingd/architecture/) |
| Pick features and install templates | [Build profiles](https://sxmxc.github.io/mingd/build-profiles/), [smoke tests](https://sxmxc.github.io/mingd/smoke-tests/) |
| Save/share recipes and understand comparisons | [Recipes and comparisons](https://sxmxc.github.io/mingd/recipes-and-comparisons/) |
| Import recipes or provision mobile workers | [Recipe files and mobile templates](https://sxmxc.github.io/mingd/recipe-files-and-mobile-templates/) |
| Understand activity and cache measurements | [Workbench](https://sxmxc.github.io/mingd/workbench/), [performance](https://sxmxc.github.io/mingd/performance/) |
| Manage accounts and administrators | [Accounts and administration](https://sxmxc.github.io/mingd/accounts-and-admin/) |
| Operate jobs or diagnose failures | [Maintenance](https://sxmxc.github.io/mingd/maintenance/), [troubleshooting](https://sxmxc.github.io/mingd/troubleshooting/) |
| Validate changes and understand CI | [Development and validation](https://sxmxc.github.io/mingd/development/), [CI](https://sxmxc.github.io/mingd/ci/) |

## Repository

```text
apps/web/               Next.js UI, Auth, and authorized API routes
packages/build-config/  Shared schemas, presets, normalization, and build recipe
services/builder/       Workers, compilation, packaging, and maintenance
supabase/               Migrations, database tests, local config, email templates
scripts/                Admin bootstrap, reference importer, source audits
docs/                   Setup, product behavior, operations, and validation
```

Technical identifiers use `mingd` and `@mingd/`; visible branding uses `min.gd`.
See [naming](https://sxmxc.github.io/mingd/naming/). Contributor and agent workflow rules live in
[AGENTS.md](AGENTS.md).

No project `LICENSE` file is currently included. Godot and dependencies retain
their own licenses.
