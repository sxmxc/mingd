# Getting started locally

This guide uses local Supabase, a host-run Next.js app, and direct Docker workers.
For separate production build hosts, use [distributed deployment](deployment.md).
For a dedicated server with separate Supabase, use [deployment](deployment.md).

## Prerequisites

- Node 24.21.0 and npm; `.nvmrc` pins the host/CI version.
- Docker Engine with Docker Compose v2, accessible to your account.
- Git and outbound access for npm, container images, and official Godot releases.
- CPU, RAM, and disk for compilation. Worker concurrency and parallel SCons jobs
  multiply resource demand; start with the example defaults.

From your checkout:

```bash
nvm install
nvm use
npm ci
cp .env.example .env
cp .env.example apps/web/.env.local
```

Without nvm, install the version in `.nvmrc` by your normal method. The two
environment files are separate; see [configuration](configuration.md).

## Start Supabase

```bash
npx supabase start
npx supabase status
```

The local project ID is `mingd-local`. The API normally uses port 54321,
Postgres 54322, and Studio 54323. Read actual status output for API keys and the
local mail viewer URL. Do not commit or share the privileged key.

For a fresh disposable development database, reproduce all migrations:

```bash
npm run db:local:reset
npx supabase test db --local
```

Reset removes local project data. To preserve an existing development database,
inspect `npm run db:local:status` and apply pending migrations with
`npx supabase db push --local --skip-vault` instead. Never reset production.

## Configure web and workers

In `apps/web/.env.local`, set:

```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<public key from local Supabase>
SUPABASE_SECRET_KEY=<privileged key from local Supabase>
REDIS_URL=redis://127.0.0.1:6379
```

In root `.env`, replace the key placeholders with the same project's keys.
Leave `SUPABASE_URL=http://host.docker.internal:54321` for Docker workers when
Supabase runs on this host. Compose supplies a host-gateway mapping; confirm
host networking/firewall rules allow containers to reach the API. For remote
Supabase, use its reachable HTTPS API origin instead.

Keep `BUILDER_DRY_RUN=false` for usable templates. Dry-run still fetches and
verifies source but creates a diagnostic archive with no compiled template.

## Start development

```bash
npm run compose:redis
npm run dev:web
```

In another terminal, start the workers you need:

```bash
npm run compose:builder:build          # Linux and Windows
npm run compose:web-builder:build      # Web
npm run compose:android-builder:build  # Android
npm run compose:maintenance:build      # References and cleanup
```

Or use `npm run compose:builders:build` for all three non-macOS workers and Redis.
These targeted commands do not start the Compose frontend; the development app
already occupies port 3000. Avoid starting the full default stack on that port.
macOS requires [toolchain provisioning](recipe-files-and-mobile-templates.md#macos-on-linux).

Open `http://localhost:3000`, create an account, and confirm it through the local
mail viewer. Start with a Linux Standard build and follow the
[smoke procedure](smoke-tests.md). A complete job alone does not establish that
an exported game runs. For administration, follow
[initial SuperAdmin setup](accounts-and-admin.md#initial-superadmin).

## Checks and shutdown

```bash
npm exec --workspace @mingd/web -- next typegen
npm run typecheck
npm test
```

Builder tests need archive/Python tools and optionally compilers. See
[development and validation](development.md) for image-based and opt-in checks.

Stop the development web process with Ctrl+C. To stop containers while preserving
Compose volumes:

```bash
npm run compose:down:all
npx supabase stop
```

Let active builds finish before shutdown when practical. Compose and Supabase
CLI manage separate stacks; stopping one does not stop the other.
