# Self-hosted Supabase notes

For production, use Supabase's official self-hosted Docker distribution. Do not expose `supabase start` to the public internet; that stack is intended for local development/testing.

High-level production shape:

```text
Caddy / reverse proxy
  |-- mingd.example.com       -> Next.js
  `-- supabase.example.com       -> Supabase API gateway

Supabase Docker stack
  |-- Postgres
  |-- Auth
  |-- Storage
  |-- Realtime (optional for this app)
  `-- Studio (admin-only)

Redis
Builder workers
```

min.gd only requires Auth, Postgres, Storage, and the API gateway. Realtime is optional because the bootstrap polls build status.

Operational responsibilities when self-hosting include database backups, Storage backups, SMTP, TLS, secrets, upgrades, monitoring, and capacity management.

## Auth URLs and password recovery

`supabase/config.toml` configures the local Supabase CLI stack. It does not
configure a separate self-hosted deployment. Set these in the **Supabase
deployment's** `.env` (the official Compose file passes them to Auth):

```dotenv
# Use the address where users open min.gd. Until the public proxy is ready,
# use http://docker01.voidmoose.local:3000 (adjust the port if needed).
SITE_URL=https://mingd.voidmoose.net
ADDITIONAL_REDIRECT_URLS=https://mingd.voidmoose.net/auth/callback,http://localhost:3000/auth/callback,http://docker01.voidmoose.local:3000/auth/callback
# These remain the Supabase API address.
API_EXTERNAL_URL=https://supabase.voidmoose.net
SUPABASE_PUBLIC_URL=https://supabase.voidmoose.net
```

For deployments with inline environment configuration, the corresponding Auth
variables are `GOTRUE_SITE_URL` and `GOTRUE_URI_ALLOW_LIST`. Set the min.gd
repository's `NEXT_PUBLIC_APP_URL` to the same application origin as `SITE_URL`
in `.env` for Docker and `apps/web/.env.local` for Next.js development.
Use the actual application port in every URL.

Supabase's default email link passes through `/auth/v1/verify`; that is normal.
Its `redirect_to` must point to the application. A redirect back to Supabase
usually means `SITE_URL` is the API address or the requested application redirect
was not allowed. This app uses server-side cookie sessions, so configure the
repository's token-hash email templates as well, including for resets sent from
Studio. The recovery template links directly to `/auth/confirm`, which verifies
the token, sets session cookies, and opens `/account/reset-password`.

Self-hosted Auth fetches custom templates over HTTP; the CLI `content_path`
settings and Studio template editor do not configure them. Copy
`supabase/templates/` to `volumes/mingd-templates/` in the Supabase deployment,
then merge this into its Compose configuration:

```yaml
services:
  auth:
    environment:
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: http://mingd-auth-templates/confirmation.html
      GOTRUE_MAILER_TEMPLATES_RECOVERY: http://mingd-auth-templates/recovery.html
      GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: http://mingd-auth-templates/email-change.html
    depends_on:
      mingd-auth-templates:
        condition: service_started
  mingd-auth-templates:
    image: caddy:2-alpine
    restart: unless-stopped
    command: ["caddy", "file-server", "--root", "/templates", "--listen", ":80"]
    volumes:
      - ./volumes/mingd-templates:/templates:ro
```

The template service needs no published ports. Recreate `auth` and start
`mingd-auth-templates` **in the Supabase deployment**, preserving its existing
Compose files and other Auth settings. With the standard Docker Compose setup:

```bash
docker compose up -d auth mingd-auth-templates
```

Request a fresh reset email after applying the configuration. Existing emails
retain their old URLs. Test both the app's Forgot password form and Studio's
reset-email action; the link should open the application's password form.

If sign-in or recovery displays `Unexpected token ... Unauthorized`, verify the
public API key and rebuild the web image after changing it:

```bash
npm run compose:web:build
```

Next.js embeds `NEXT_PUBLIC_*` values at build time, including in server code.
Recreating an existing image with new runtime environment values is insufficient.
Never substitute a privileged secret key for the public key.

References: [Auth configuration](https://supabase.com/docs/guides/self-hosting/auth/config),
[custom email templates](https://supabase.com/docs/guides/self-hosting/custom-email-templates),
and [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Applying application migrations

The frontend is provided by the Compose `web` service using a non-root Next.js
standalone image. Set browser-safe Supabase URL/key values in the root `.env`
before building. The API URL must be reachable both from the browser and inside
the container. Rebuild after changing `NEXT_PUBLIC_*` values; the privileged key
is runtime-only. Use `WEB_PORT` to change the host port.

Apply pending migrations (including `20261005064025_build_matrix.sql`) before
starting expanded workers, then run:

```bash
docker compose --profile builder up -d --build
```

The shared `builder` profile enables both desktop compilation and the
separate Emscripten worker and Web queue. See the root README for queue variables
and service commands.

The application migrations in `supabase/migrations/` can target a self-hosted
database directly. Set `SUPABASE_DB_URL` in the repository-root `.env`,
deployment shell, or secret manager to a percent-encoded Postgres connection
URI, then review and apply. The scripts load `.env` locally; an already
exported deployment value takes precedence.

```bash
npm run db:status
npm run db:migrate:check
npm run db:migrate
```

These commands pass `--db-url` to the Supabase CLI, so they do not depend on a
linked Supabase Cloud project. Keep this URI server-only: it contains database
credentials and must not be committed or exposed as `NEXT_PUBLIC_*`.

Create a new source-controlled migration with:

```bash
npm run db:migration:new -- descriptive_name
```

Current official docs: https://supabase.com/docs/guides/self-hosting/docker
