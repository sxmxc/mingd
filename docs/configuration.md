# Configuration reference

Use [`.env.example`](../.env.example) as the starting point. Never put a real
secret in documentation, source control, or a `NEXT_PUBLIC_*` variable.

## Environment files

| Location | Consumer | Applying changes |
| --- | --- | --- |
| Root `.env` | Compose, migration scripts, admin/import scripts | Recreate affected containers; rebuild web for public settings |
| `apps/web/.env.local` | Web workspace Next.js development/build commands | Restart development; rebuild for public settings |
| Supabase deployment `.env` / Compose | Separately installed production Auth/API/Storage/database | Recreate relevant Supabase services with that installation's launcher |
| `supabase/config.toml` | Local Supabase CLI stack only | Apply changes to the appropriate local development stack |

Direct builder/maintenance npm commands do not automatically load root `.env`.
Export their variables or use `npx dotenv -- <command>`. Admin grant and reference
import scripts explicitly load root `.env`. Exported values take precedence.

## Web and shared services

| Variable | Consumer | Default / purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Web/Auth | Canonical app origin; Compose fallback `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and web server | Required API origin without `/auth/v1`; reachable by both |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and web server | Required public key for that installation |
| `SUPABASE_SECRET_KEY` | Web server, workers, maintenance, operator scripts | Required privileged key; runtime-only in web image |
| `SUPABASE_URL` | Workers and maintenance | Required directly; Compose default `http://host.docker.internal:54321` |
| `SUPABASE_DB_URL` | Migration scripts | Private, percent-encoded PostgreSQL URI for self-hosted database |
| `REDIS_URL` | Web and workers | Required; host example `redis://127.0.0.1:6379`; Compose sets `redis://redis:6379` |
| `WEB_PORT` | Compose frontend | Host port, default `3000` |
| `ARTIFACT_BUCKET` | Web, workers, maintenance | `build-artifacts`; must match the private migrated bucket |
| `SIGNED_DOWNLOAD_TTL_SECONDS` | Download route | `900`; issued links remain usable until expiry |
| `MACOS_TOOLCHAIN_SHA256` | Web and macOS image/worker | Verified operator archive digest, required for macOS submissions/builds |

Older self-hosted installations may use their browser-safe legacy `anon` and
backend `service_role` keys under these names. Use keys supported by the installed
API gateway; a privileged key never belongs in the public variable. See
[Supabase's API key guide](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys).

`NEXT_PUBLIC_*` settings are embedded at web image build time. After changing
one, run `npm run compose:web:build`; recreating an old image is insufficient.

## Queue routing

| Web/Compose variable | Queue default | Worker / target |
| --- | --- | --- |
| `BUILDER_QUEUE_NAME` | `godot-builds` | `builder` / `desktop` (Linux and Windows) |
| `WEB_BUILDER_QUEUE_NAME` | `godot-web-builds` | `web-builder` / `web` |
| `ANDROID_BUILDER_QUEUE_NAME` | `godot-android-builds` | `android-builder` / `android` |
| `MACOS_BUILDER_QUEUE_NAME` | `godot-macos-builds` | `macos-builder` / `macos` |

Every worker internally reads `BUILDER_QUEUE_NAME`. Compose translates the
platform-specific setting into that worker's environment. For a direct worker,
set `BUILDER_TARGET` and matching `BUILDER_QUEUE_NAME` explicitly. Maintenance
polls Postgres and does not use Redis queues.

## Worker controls

| Variable | Default | Meaning |
| --- | --- | --- |
| `BUILDER_TARGET` | `desktop` | `desktop`, `web`, `android`, or `macos`; Compose sets it |
| `BUILDER_CONCURRENCY` | `1` | Concurrent jobs per worker process |
| `SCONS_JOBS` | `4` | Parallel SCons jobs per compilation |
| `BUILDER_DRY_RUN` | `false` | Exact value `true` produces diagnostic archives |
| `BUILDER_COMPILE_TIMEOUT_MS` | `7200000` | Compile-command timeout; minimum 60 seconds |
| `GODOT_CACHE_DIR` | `/cache/godot` | Verified source cache |
| `GODOT_WORK_DIR` | `/work/jobs` | Isolated workspaces |
| `CCACHE_DIR` | `/cache/ccache` | Persistent compiler cache |

Compose has separate source/compiler/work volumes per target. Android also mounts
`/cache/gradle`. For direct host processes, override container paths with writable
host paths. Tune concurrency using [performance measurements](performance.md).

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
