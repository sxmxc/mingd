---
title: "Continuous integration"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/developers/ci.md
---

# Continuous integration

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on pull requests,
pushes to `main`, and manual GitHub Actions runs. It uses GitHub-hosted Ubuntu
24.04 runners with read-only repository permissions and cancels older runs for
the same ref. No production secrets or private-network access are required.

## Jobs

| Required check name | What runs |
| --- | --- |
| `Application checks (Node 24)` | Lockfile install, Next.js route type generation, workspace typecheck/tests, production web build |
| `Database migrations and SQL tests` | Disposable local Supabase Postgres, full migration reset, pgTAP tests, cleanup even on failure |
| `Docker build (web)` | Build existing web Dockerfile with BuildKit caching |
| `Docker build (maintenance)` | Build existing maintenance Dockerfile with BuildKit caching |
| `Docker build (worker-gateway)` | Build Fastify/Node 24 gateway image with upload validator |

Application/SQL jobs use Node **24.21.0** from `.nvmrc`, matching repository
operator commands; image-only production hosts need no Node/npm installation.
Supabase CLI is installed through the lockfile. Database tests cover access,
recipes, platform constraints, references, and maintenance in `supabase/tests`;
the job does not contact the deployed database.

Dockerfiles currently use Node 24 independently of the host. These image checks
validate the Dockerfiles as deployed; changing their runtime is a separate rollout.
Application checks use dummy public settings and loopback URLs. Docker image
builds need no deployment URL/key arguments. Images are not pushed or deployed.
The web app reads deployment configuration on the server at runtime, keeping
privileged keys server-only.
Validation image tags use the current `github.repository`, lowercased for GHCR,
and their OCI source label identifies the same repository. Forks do not need to
edit the workflow's registry namespace. Operator builds/deployments use their
configured `IMAGE_PREFIX`; upstream production defaults remain available.

Production web builds use Next.js's default Turbopack bundler through the
workspace script, including the web Dockerfile. For local build-cache recovery,
see [development](development.md#recovering-a-canceled-turbopack-build).

## Coverage limits

Workspace tests check build contracts, rendered UI states, worker HTTP routes,
packaging, and operator/release commands. Command tests use temporary checkouts
and mocked Docker commands; they do not build or publish images. The Compose
metadata test renders configuration with fixture environment files, so it needs
no local `.env` or deployment credentials.

Prefer tests of observable behavior. Extend an existing scenario when it covers
a fix, rather than adding another overlapping test. Test version arithmetic and
other pure rules directly; reserve subprocess tests for command behavior and
file changes. Avoid assertions about source text, branding copy, exact layout
counts, or log formatting unless those are part of a required contract.

Workspace typechecking already checks the builder and gateway; the application
job builds only the web workspace. Documentation builds run in the separate
documentation workflow, and container checks validate image construction.

CI does not compile real Godot templates, build all platform-worker images,
provision Apple's SDK, perform native/device smoke tests, or test real Auth email
flows. Native-toolchain/source opt-in checks skip missing prerequisites. See
[development](development.md) and [smoke tests](smoke-tests.md).

Application CI does not apply production migrations, publish release images, or deploy the application.
Deployment supports local builds or publishing locally built images to GHCR
and pulling them on production after checks pass; see
[deployment](../operators/deployment.md#build-here-pull-on-production-ghcr).

## Branch protection and workflow changes

After a successful GitHub run, configure a `main` ruleset requiring all five check
names in the table. The workflow does not configure repository rules itself.
Actions use immutable commit pins; update their pins and version comments together.
Keep CI builds isolated from production credentials and services.

## Documentation workflow

The separate [Documentation workflow](../../.github/workflows/docs.yml) runs
`Documentation checks` for changes to the docs, Starlight workspace, npm metadata,
Node version, or its workflow. It checks and builds the static site on pull
requests and publishes successful builds from `main` to GitHub Pages. Documentation
pull requests use this workflow even when their `doc*` source branch causes the
application workflow to skip its jobs. Push builds run on `main`.
See [documentation site setup](documentation.md) for the one-time Pages setting
and local preview commands. Its path-filtered check is not part of the five
application checks listed above.

To reproduce application checks locally:

```bash
nvm use
npm ci
npm exec --workspace @mingd/web -- next typegen
npm run typecheck
npm test
npm run build --workspace @mingd/web
```

Use configured development environment values. SQL checks need a disposable
local database; follow [development validation](development.md#database-changes),
not the production migration commands.
