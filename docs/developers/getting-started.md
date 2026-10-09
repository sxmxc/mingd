---
title: "Local development setup"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/developers/getting-started.md
---

# Local development setup

Use this guide to run min.gd from a checkout and make your first Linux build.
Supabase and Redis run in Docker, Next.js runs on the host, and a direct Docker
worker compiles Godot. The example assumes you open the browser on the same
machine. For access from another computer, see
[development browser access](development.md#browser-access-to-the-dev-server)
and [URLs and networking](../operators/configuration.md#urls-and-networking); review the app
origin and Supabase Auth redirects for the address you use.

For production with separate application and build hosts and a separately managed
Supabase installation, follow the [deployment guide](../operators/deployment.md).

## Prerequisites

- Node 24.21.0 and npm; `.nvmrc` pins the host/CI version.
- Docker Engine with Docker Compose v2, accessible to your account.
- A Linux x86_64 build host for the current cross-compilation images.
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
environment files are separate; see [configuration](../operators/configuration.md).

## Start Supabase

```bash
npx supabase start
npx supabase status
```

The local project ID is `mingd-local`. The API normally uses port 54321,
Postgres 54322, and Studio 54323. Read actual status output for API keys and the
local mail viewer URL. Do not commit or share the privileged key.

For a fresh disposable development database, reproduce all migrations. This
removes local project data:

```bash
npm run db:local:reset
```

To preserve an existing development database, inspect `npm run db:local:status`
and apply pending migrations with
`npx supabase db push --local --skip-vault` instead. Never reset production.

## Configure the web app and worker

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
host networking/firewall rules allow containers to reach the API. Keep the public
URL/key and privileged key populated in root `.env` as well: Compose reads these
settings even when you start only selected services.

Keep `BUILDER_DRY_RUN=false` for usable templates. Dry-run still fetches and
verifies source but creates a diagnostic archive with no compiled template.

## Start the app and desktop worker

```bash
npm run compose -- up -d redis
npm run dev:web
```

Leave the web process running. In another terminal, start the desktop worker,
which handles both Linux and Windows:

```bash
npm run compose -- up -d --build builder
docker compose ps redis builder
docker compose logs --tail=100 builder
```

Check that Redis is healthy, the worker is running, and its logs show no startup
or connection errors. The startup commands select Redis and the desktop worker.
The host-run development app occupies port 3000; starting the Compose `web`
service on that port will conflict with it.

## Make your first build

Open `http://localhost:3000`, create an account, and confirm it through the local
mail viewer whose URL appears in `npx supabase status`. Sign in and submit a
Linux x86_64 Standard release build. Follow its status and compiler output, then
download the completed template package.

The first build downloads source and compiles Godot; allow time and disk space
for both. To install the template and check an exported game, follow the
[smoke procedure](smoke-tests.md) with the matching Godot editor. For
administration, follow
[initial SuperAdmin setup](../operators/accounts-and-admin.md#initial-superadmin).

## Optional services

Start additional workers only for the targets you want to build:

```bash
npm run compose -- up -d --build web-builder      # Web
npm run compose -- up -d --build android-builder  # Android
```

`npm run compose -- up -d --build builder web-builder android-builder` starts desktop, Web, Android, and Redis together.
macOS requires [toolchain provisioning](../operators/worker-toolchains.md#macos-on-linux).

For template-size comparisons and scheduled artifact cleanup, start maintenance.
It also refreshes the official release catalog:

```bash
npm run compose -- up -d --build maintenance
```

See [maintenance](../operators/maintenance.md) for schedules and task status.

## Development checks

```bash
npm exec --workspace @mingd/web -- next typegen
npm run typecheck
npm test
```

Builder tests need archive/Python tools and optionally compilers. See
[development and validation](development.md) for image-based and opt-in checks.
To validate the local database migrations and access policies, run
`npx supabase test db --local`.

## Shutdown

Stop the development web process with Ctrl+C. To stop containers while preserving
Compose volumes:

```bash
npm run compose -- --profile '*' down
npx supabase stop
```

Let active builds finish before shutdown when practical. Compose and Supabase
CLI manage separate stacks; stopping one does not stop the other.
