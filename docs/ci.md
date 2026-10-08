# Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on pull requests,
pushes to `main`, and manual GitHub Actions runs. It uses GitHub-hosted Ubuntu
24.04 runners with read-only repository permissions and cancels older runs for
the same ref. No production secrets or private-network access are required.

## Jobs

| Required check name | What runs |
| --- | --- |
| `Application checks (Node 24)` | Lockfile install, Next.js route type generation, workspace typecheck/tests, web/builder build |
| `Database migrations and SQL tests` | Disposable local Supabase Postgres, full migration reset, pgTAP tests, cleanup even on failure |
| `Docker build (web)` | Build existing web Dockerfile with BuildKit caching |
| `Docker build (maintenance)` | Build existing maintenance Dockerfile with BuildKit caching |

Application/SQL jobs use Node **24.21.0** from `.nvmrc`, matching repository
operator commands; image-only production hosts need no Node/npm installation.
Supabase CLI is installed through the lockfile. Database tests cover access,
recipes, platform constraints, references, and maintenance in `supabase/tests`;
the job does not contact the deployed database.

Dockerfiles currently use Node 22 independently of the host. These image checks
validate the Dockerfiles as deployed; changing their runtime is a separate rollout.
Application checks use dummy public settings and loopback URLs. Docker image
builds need no deployment URL/key arguments. Images are not pushed or deployed.
The web app reads deployment configuration on the server at runtime, keeping
privileged keys server-only.

## Coverage limits

CI does not compile real Godot templates, build all platform-worker images,
provision Apple's SDK, perform native/device smoke tests, or test real Auth email
flows. Native-toolchain/source opt-in checks skip missing prerequisites. See
[development](development.md) and [smoke tests](smoke-tests.md).

CI also does not apply production migrations, publish release images, or deploy.
Deployment supports local builds or publishing locally built images to GHCR
and pulling them on production after checks pass; see
[deployment](deployment.md#build-here-pull-on-production-ghcr).

## Branch protection and workflow changes

After a successful GitHub run, configure a `main` ruleset requiring all four check
names in the table. The workflow does not configure repository rules itself.
Actions use immutable commit pins; update their pins and version comments together.
Keep CI builds isolated from production credentials and services.

To reproduce application checks locally:

```bash
nvm use
npm ci
npm exec --workspace @mingd/web -- next typegen
npm run typecheck
npm test
npm run build
```

Use configured development environment values. SQL checks need a disposable
local database; follow [development validation](development.md#database-changes),
not the production migration commands.
