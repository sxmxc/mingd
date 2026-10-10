---
title: "Configuration reference"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/operators/configuration.md
---

# Configuration reference

Use [`.env.example`](../../.env.example) as the starting point. Never put a real
secret in documentation, source control, or a `NEXT_PUBLIC_*` variable.

## Environment files

| Location | Consumer | Applying changes |
| --- | --- | --- |
| Root/deployment `.env` | Compose; operator scripts when run from a checkout | Recreate affected containers |
| `apps/web/.env.local` | Web workspace Next.js development commands | Restart development after changing settings |
| Supabase provider settings or self-hosted `.env` / Compose | Production Auth/API/Storage/database | Apply settings through the provider or recreate affected self-hosted services |
| `supabase/config.toml` | Local Supabase CLI stack only | Apply changes to the appropriate local development stack |

Direct builder/maintenance npm commands do not automatically load root `.env`.
Export their variables or use `npx dotenv -- <command>`. Admin grant and reference
import scripts explicitly load root `.env`. Exported values take precedence.

## Container image selection

| Variable | Default | Meaning |
| --- | --- | --- |
| `IMAGE_PREFIX` | `mingd` | Repository prefix for application images, e.g. `ghcr.io/sxmxc/mingd`; no trailing slash |
| `IMAGE_TAG` | `latest` | Fallback image tag for services without an individual tag |
| `MINGD_IMAGE_SOURCE` | Derived by image build commands; direct Compose defaults to the upstream repository | Optional OCI source label override for Docker builds |

Root and production Compose accept per-service tags. Production defaults are
recorded independently in the two production Compose files; root Compose falls
back to `latest`:

| Variable | Service | Production file (also supported in root Compose) |
| --- | --- | --- |
| `WEB_IMAGE_TAG` | `web` | `compose.web.prod.yml` |
| `WORKER_GATEWAY_IMAGE_TAG` | `worker-gateway` | `compose.web.prod.yml` |
| `MAINTENANCE_IMAGE_TAG` | `maintenance` | `compose.web.prod.yml` |
| `BUILDER_IMAGE_TAG` | `builder` (desktop) | `compose.workers.prod.yml` |
| `WEB_BUILDER_IMAGE_TAG` | `web-builder` | `compose.workers.prod.yml` |
| `ANDROID_BUILDER_IMAGE_TAG` | `android-builder` | `compose.workers.prod.yml` |
| `MACOS_BUILDER_IMAGE_TAG` | `macos-builder` | `compose.workers.prod.yml` |

Selection is service tag, then `IMAGE_TAG`, then the Compose default.
Unset or empty service tags fall back to `IMAGE_TAG`. Remove a service tag to
return that service to the fallback. These settings apply to root Compose as
well as the corresponding production file.

Release preparation advances selected services' independent versions and records
their tags in the root `.env`, production Compose defaults and production env
examples. Build and push use `--release` to select those prepared tags. The root
package version does not force a shared image version. For the exact command
order, use [deployment](deployment.md#build-here-pull-on-production-ghcr).
After preparing components, `release platform` bumps only the root/platform
version and captures their versions in `releases/v<version>.json`. It does not
change image selection or deployment configuration.

Each production host's existing `.env` is its deployment configuration. Copy only
published services' `*_IMAGE_TAG` values from the prepared env examples; preserve
that host's other settings. Publishing from a source checkout does not update
production `.env` files or restart containers. Pull/recreate is a separate action.
`WEB_PORT` is optional; omit it to keep the default host port `3000`.

## Web and shared services

| Variable | Consumer | Default / purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Web/Auth | Canonical app origin; Compose fallback `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Web server/Auth | Required API origin without `/auth/v1`; browser-safe configuration |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Web server/Auth | Required browser-safe public key for that installation |
| `SUPABASE_SECRET_KEY` | Web server, gateway, direct workers, maintenance, operator scripts | Required privileged key; runtime-only in web image |
| `SUPABASE_URL` | Gateway, direct workers and maintenance | Required directly; Compose default `http://host.docker.internal:54321` |
| `SUPABASE_DB_URL` | Migration scripts | Private, percent-encoded PostgreSQL URI for self-hosted database |
| `REDIS_URL` | Web, gateway and direct workers | Required; host example `redis://127.0.0.1:6379`; Compose sets `redis://redis:6379` |
| `WEB_PORT` | Compose frontend | Host port, default `3000` |
| `WORKER_GATEWAY_INTERNAL_URL` | Web server | Gateway origin for the Administration version footer; npm defaults to `http://127.0.0.1:3001`, Compose to `http://worker-gateway:3001`. Set npm overrides in `apps/web/.env.local`; no credentials or URL paths |
| `ARTIFACT_BUCKET` | Web, gateway, direct workers, maintenance | `build-artifacts`; must match the private migrated bucket |
| `SIGNED_DOWNLOAD_TTL_SECONDS` | Download route | `900`; issued links remain usable until expiry |
| `MACOS_TOOLCHAIN_SHA256` | Web and macOS image/worker | Verified operator archive digest, required for macOS submissions/builds |

Older self-hosted installations may use their browser-safe legacy `anon` and
backend `service_role` keys under these names. Use keys supported by the installed
API gateway; a privileged key never belongs in the public variable. See
[Supabase's API key guide](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys).

The current app reads these existing `NEXT_PUBLIC_*` names dynamically on the
server at runtime. Auth callbacks, recipe origin checks, and Supabase clients
use the deployment's values; the web image needs no URL/key build arguments.
Local development can use localhost in `apps/web/.env.local` while the same
published image uses production's root `.env`. After changing deployment values,
recreate web with `docker compose up -d --no-deps --no-build --force-recreate web`.
Deploy the runtime-configuration code once before relying on this behavior;
older web images still embed their build settings.

Direct `process.env.NEXT_PUBLIC_*` references are still inlined by Next.js.
Use the server environment helper for runtime reads. The unused browser Supabase
helper accepts an explicit public URL/key; any future browser caller must receive
only those public values from the server, never the privileged key.

## Queue routing

| Web/Compose variable | Queue default | Worker / target |
| --- | --- | --- |
| `BUILDER_QUEUE_NAME` | `godot-builds` | `builder` / `desktop` (Linux and Windows) |
| `WEB_BUILDER_QUEUE_NAME` | `godot-web-builds` | `web-builder` / `web` |
| `ANDROID_BUILDER_QUEUE_NAME` | `godot-android-builds` | `android-builder` / `android` |
| `MACOS_BUILDER_QUEUE_NAME` | `godot-macos-builds` | `macos-builder` / `macos` |

The gateway reads all four queue names; remote workers receive no queue settings.
Every direct worker internally reads `BUILDER_QUEUE_NAME`. Root Compose translates the
platform-specific setting into that worker's environment. For a direct worker,
set `BUILDER_TARGET` and matching `BUILDER_QUEUE_NAME` explicitly. Maintenance
polls Postgres and does not use Redis queues.

## Worker controls

| Variable | Default | Meaning |
| --- | --- | --- |
| `BUILDER_TARGET` | `desktop` | `desktop`, `web`, `android`, or `macos`; Compose sets it |
| `BUILDER_CONCURRENCY` | `1` | Concurrent jobs per worker process |
| `SCONS_JOBS` | `4` | Parallel SCons jobs per compilation |
| `BUILDER_DRY_RUN` | `false` | Gateway/direct mode owns diagnostic build selection; remote workers follow the assignment |
| `BUILDER_COMPILE_TIMEOUT_MS` | `7200000` | Compile-command timeout; minimum 60 seconds |
| `GODOT_CACHE_DIR` | `/cache/godot` | Verified source cache |
| `GODOT_WORK_DIR` | `/work/jobs` | Isolated workspaces |
| `CCACHE_DIR` | `/cache/ccache` | Persistent compiler cache |

Compose has separate source/compiler/work volumes per target. Android also mounts
`/cache/gradle`. For direct host processes, override container paths with writable
host paths. Tune concurrency using [performance measurements](../developers/performance.md).

## URLs and networking

`localhost` inside a container means that container. `host.docker.internal` is
for a same-host service, not Supabase on another machine. Use the remote server's
reachable API address for a remote deployment.

An HTTPS app needs a browser-reachable HTTPS Supabase endpoint. The web container
must resolve and trust it too. Private DNS and TLS can work entirely inside a
private network; HTTPS does not imply internet accessibility.

The Auth site URL is the app origin, separate from the API origin. See
[self-hosted Supabase](self-hosted-supabase.md). Changing `WEB_PORT` does not
update the canonical URL or allowed Auth redirects automatically.

## Distributed-worker settings

Use [`.env.web.prod.example`](../../.env.web.prod.example) on the application host and
[`.env.workers.prod.example`](../../.env.workers.prod.example) for workers, whether on
dedicated hosts or a separate Compose project on the application host.
Production files default to `ghcr.io/sxmxc/mingd` and per-service release tags;
root Compose retains `mingd` and `latest`. Existing `.env` values override these defaults. Do not copy
privileged application configuration to remote hosts.

| Variable | Consumer | Default / meaning |
| --- | --- | --- |
| `WORKER_GATEWAY_HOST` | Gateway | Local npm `127.0.0.1`; Compose `0.0.0.0` |
| `WORKER_GATEWAY_PORT` | Gateway/Compose | 3001; host publication can override the port |
| `WORKER_GATEWAY_LOG_LEVEL` | Gateway | `info` |
| `WORKER_GATEWAY_WORKERS_ENABLED` | Gateway | `false`; enable authenticated control after migrations |
| `WORKER_GATEWAY_EXECUTION_ENABLED` | Gateway | `false`; enable dispatch after stopping direct workers |
| `WORKER_GATEWAY_QUEUE_CONCURRENCY` | Gateway | 16 pending deliveries per target; 1–64 |
| `WORKER_GATEWAY_MAX_UPLOADS` | Gateway | 2 simultaneous uploads; 1–4 |
| `WORKER_GATEWAY_MAX_JOB_MS` | Gateway | 43200000 (12 hours); maximum 48 hours |
| `WORKER_GATEWAY_WORK_DIR` | Gateway npm | `/tmp/mingd-gateway`; private temporary uploads |
| `BUILDER_MODE` | Builder | `direct`; worker production Compose forces `remote` |
| `WORKER_GATEWAY_URL` | Remote worker | `https://worker.mingd.voidmoose.net`; HTTPS origin, no paths/redirects |
| `WORKER_TOKEN_FILE` | Remote worker | `/run/secrets/worker_token`; per-process enrollment file |
| `WORKER_CPUS` | Worker Compose | 4 CPU limit per container |
| `WORKER_MEMORY_LIMIT` | Worker Compose | 8 GiB per non-desktop container |
| `DESKTOP_WORKER_MEMORY_LIMIT` | Worker Compose | 16 GiB for the desktop container, independently of `WORKER_MEMORY_LIMIT` |
| `DESKTOP_WORKER_TOKEN_FILE` | Worker Compose | `./worker-tokens/desktop.token` |
| `WEB_WORKER_TOKEN_FILE` | Worker Compose | `./worker-tokens/web.token` |
| `ANDROID_WORKER_TOKEN_FILE` | Worker Compose | `./worker-tokens/android.token`; android profile |
| `MACOS_WORKER_TOKEN_FILE` | Worker Compose | `./worker-tokens/macos.token`; macos profile |

Remote concurrency is 1–16, SCons jobs 1–256, and command timeout 60 seconds–48
hours. Budget CPU/RAM across containers, not just within each. Enrollment capacity
must cover concurrency. The gateway controls dry-run and Storage settings;
workers control local paths/toolchain resources. Detailed fixed protocol/upload
limits and rollout are in [distributed workers](distributed-workers.md).
