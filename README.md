# min.gd

[![CI](https://github.com/sxmxc/mingd/actions/workflows/ci.yml/badge.svg)](https://github.com/sxmxc/mingd/actions/workflows/ci.yml)

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
See [build profiles](docs/build-profiles.md) for restrictions and acceptance
records. Desktop smoke results are owner-confirmed; the expanded version/Web/
mobile matrix still needs its own runtime acceptance.

iOS, .NET, arbitrary source repositories, custom modules, patches, and compiler
commands are outside the supported build contract.

## Run it

Use npm workspaces and Node **24.21.0**, pinned in [.nvmrc](.nvmrc). Docker images
currently use Node 22 independently of the host runtime.

- **Develop locally:** follow [getting started](docs/getting-started.md) for
  local Supabase, Next.js development, and workers.
- **Deploy to a dedicated server:** follow [deployment](docs/deployment.md) and
  [self-hosted Supabase](docs/self-hosted-supabase.md). Supabase runs separately
  from this project's Compose stack.
- **Configure processes:** use the [environment reference](docs/configuration.md).
  Next.js development reads `apps/web/.env.local`; Compose reads the root `.env`.

Production uses `compose.web.prod.yml` on the application host and
`compose.workers.prod.yml` on dedicated build hosts, each with its own `.env`.
Workers connect over authenticated HTTPS; Redis stays private. Builds and
migrations run from an authorized checkout. See [production deployment](docs/deployment.md#production-with-only-compose-and-env)
for setup, updates, optional macOS workers, and rollback.

## Documentation

The [documentation index](docs/README.md) groups every guide by task.
The Starlight site is configured for [GitHub Pages](https://sxmxc.github.io/mingd/);
see [documentation site setup](docs/documentation.md) for publishing and local preview.

| I want to… | Guide |
| --- | --- |
| Understand the components and build lifecycle | [Architecture](docs/architecture.md) |
| Pick features and install templates | [Build profiles](docs/build-profiles.md), [smoke tests](docs/smoke-tests.md) |
| Save/share recipes and understand comparisons | [Recipes and comparisons](docs/recipes-and-comparisons.md) |
| Import recipes or provision mobile workers | [Recipe files and mobile templates](docs/recipe-files-and-mobile-templates.md) |
| Understand activity and cache measurements | [Workbench](docs/workbench.md), [performance](docs/performance.md) |
| Manage accounts and administrators | [Accounts and administration](docs/accounts-and-admin.md) |
| Operate jobs or diagnose failures | [Maintenance](docs/maintenance.md), [troubleshooting](docs/troubleshooting.md) |
| Validate changes and understand CI | [Development and validation](docs/development.md), [CI](docs/ci.md) |

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
See [naming](docs/naming.md). Contributor and agent workflow rules live in
[AGENTS.md](AGENTS.md).

No project `LICENSE` file is currently included. Godot and dependencies retain
their own licenses.
