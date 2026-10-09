# min.gd

[![CI](https://github.com/sxmxc/mingd/actions/workflows/ci.yml/badge.svg)](https://github.com/sxmxc/mingd/actions/workflows/ci.yml)
[![Documentation](https://github.com/sxmxc/mingd/actions/workflows/docs.yml/badge.svg)](https://github.com/sxmxc/mingd/actions/workflows/docs.yml)

**Build only the Godot your game needs.**

min.gd builds custom Godot export templates from official, checksum-verified
source. Choose an export target and preset, retain the engine features your game
uses, and download an installable `.tpz`. Matching recipes reuse cached artifacts.
Your game project stays on your machine.

The app includes private build history with live compiler output, saved/shared
recipes, portable `.gdbuild` files, measured template-size comparisons, account
settings and administration. It supports Linux, Windows, Web, Android and macOS
recipes within the [documented platform and version limits](https://sxmxc.github.io/mingd/build-profiles/).
macOS compilation requires an operator-provided toolchain. iOS, .NET and
arbitrary source or compiler inputs are outside the build contract.

## Use min.gd

You can use an existing instance without installing compilers or hosting the service.

- [Build your first template](https://sxmxc.github.io/mingd/first-template/).
- [Choose platforms and engine features](https://sxmxc.github.io/mingd/build-profiles/).
- [Install templates and export your game](https://sxmxc.github.io/mingd/install-templates/).
- [Save and share recipes](https://sxmxc.github.io/mingd/recipes-and-comparisons/), or [keep a .gdbuild file](https://sxmxc.github.io/mingd/recipe-files-and-mobile-templates/).
- [Understand build results](https://sxmxc.github.io/mingd/workbench/) and [get help](https://sxmxc.github.io/mingd/user-help/).

## Host or develop min.gd

Production uses a Next.js application, separately managed Supabase, a private
Redis/BullMQ queue and an HTTPS gateway for isolated build workers. Remote
workers receive enrollment credentials; the application host owns privileged
backend access.

- **Host an instance:** [deployment](https://sxmxc.github.io/mingd/deployment/), [configuration](https://sxmxc.github.io/mingd/configuration/) and [self-hosted Supabase](https://sxmxc.github.io/mingd/self-hosted-supabase/).
- **Manage the service:** [workers](https://sxmxc.github.io/mingd/distributed-workers/), [administration](https://sxmxc.github.io/mingd/accounts-and-admin/) and [maintenance](https://sxmxc.github.io/mingd/maintenance/).
- **Develop locally:** [local setup](https://sxmxc.github.io/mingd/getting-started/) and [development checks](https://sxmxc.github.io/mingd/development/). Use npm workspaces and the Node version pinned in [.nvmrc](.nvmrc).

The [documentation site](https://sxmxc.github.io/mingd/) and [repository documentation index](docs/README.md)
separate user, operator and developer guides. [Documentation editing](https://sxmxc.github.io/mingd/documentation/)
covers preview and publishing.

## Repository

```text
apps/web/                 Next.js UI, accounts and authorized API routes
apps/docs/                Starlight documentation site
packages/build-config/    Shared validated build semantics
packages/worker-protocol/ HTTPS worker contract
services/worker-gateway/  Queue orchestration, enrollment and artifact publication
services/builder/         Compilation, packaging and maintenance
supabase/                 Migrations, database tests, config and email templates
docs/users/               Using the application and templates
docs/operators/           Hosting and administration
docs/developers/          Implementation, local development and validation
docs/archive/             Historical reports
```

Technical identifiers use `mingd` and `@mingd/`; visible branding uses `min.gd`.
Contributor and agent workflow rules live in [AGENTS.md](AGENTS.md).
No project `LICENSE` file is currently included. Godot and dependencies retain
their own licenses.
