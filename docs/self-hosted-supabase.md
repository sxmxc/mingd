# Self-hosted Supabase

Supabase runs on its own dedicated Docker server. This project's Compose file
runs the application, Redis, workers, and maintenance; it does not install or
reconfigure that Supabase server. Use the official
[self-hosted distribution](https://supabase.com/docs/guides/self-hosting/docker)
for production. `npx supabase start` is the separate local development stack.

## Two servers, two sets of configuration

| Change | Where to make it |
| --- | --- |
| App URL, public API key, worker connectivity | min.gd root `.env` for Compose; web `.env.local` for development |
| Auth site URL, allowed redirects, SMTP, email template URLs | Supabase server's deployment environment/Compose |
| Application tables, policies, bucket, scheduled jobs | This repo's migrations, applied to Supabase Postgres |
| Local mail/templates/ports | `supabase/config.toml`, affecting only local CLI Supabase |

Required Supabase services are Auth, Postgres, Storage, and the API gateway.
Studio is an operator interface; build status uses polling and does not require
Realtime. Keep Studio and privileged interfaces restricted to operators.

## API and Auth URLs

On the application server, use your real origins:

```dotenv
NEXT_PUBLIC_APP_URL=https://mingd.example.com
NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.com
SUPABASE_URL=https://supabase.example.com
```

On the **Supabase server**, set the application site URL and allowed callback:

```dotenv
SITE_URL=https://mingd.example.com
ADDITIONAL_REDIRECT_URLS=https://mingd.example.com/auth/callback
SUPABASE_PUBLIC_URL=https://supabase.example.com
```

Add local/development callback URLs only if those clients need this deployment.
For inline Auth environment configuration, the site/allow-list variables are
`GOTRUE_SITE_URL` and `GOTRUE_URI_ALLOW_LIST`. Keep API settings pointing at
Supabase, not the app. See [Auth configuration](https://supabase.com/docs/guides/self-hosting/auth/config).

`API_EXTERNAL_URL` depends on the installed Supabase release: current upstream
configuration includes `/auth/v1`, while older releases used the API origin.
Keep it consistent with your installer/Compose version instead of copying an
older value blindly. Review the
[Auth URL change](https://supabase.com/changelog/47093-self-hosted-supabase-api-external-url-to-include-auth-v1)
when upgrading. Client `NEXT_PUBLIC_SUPABASE_URL` remains the API origin.
Gateway names also vary by release; the
[Envoy transition](https://supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b)
changes the upstream default. Use your installation's service names/launcher.

## SMTP and application email templates

Configure SMTP on the Supabase server, enable email confirmations, and keep secure
email changes enabled. This repository provides confirmation, recovery, and
email-change HTML in [`supabase/templates`](../supabase/templates). Recovery
links use `/auth/confirm` to verify the token, set session cookies, and open
`/account/reset-password`.

Auth fetches template HTML over HTTP; a mounted file alone is insufficient.
The local CLI's `content_path` is not remote Auth configuration. See
[Supabase's template guide](https://supabase.com/docs/guides/self-hosting/custom-email-templates).

Perform these steps **in the existing Supabase deployment**, not the min.gd
Compose directory:

1. Create `volumes/mingd-templates/` beside the Supabase Compose files.
2. Copy the three HTML files from this repository's `supabase/templates/` into
   that directory. For different servers, transfer the files using your normal
   SSH/file-copy workflow.
3. Add the service and Auth environment/dependency entries below to the existing
   Compose configuration. Preserve all other Auth settings/dependencies.
4. Recreate Auth and start the template service using the installer's usual
   launcher, retaining its configured overrides.

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

This is a fragment to merge, not a replacement Supabase Compose file. The
private template service publishes no host port and must share Auth's network.
For a plain Compose installation, preserving its selected Compose files:

```bash
docker compose up -d auth mingd-auth-templates
```

If the installer uses `run.sh`, use its equivalent recreate command instead.
Auth can fall back to default emails if fetching/parsing a template fails.
Copy updated HTML to this directory whenever repository templates change.

## Verify recovery and deployment

Request fresh emails after changing settings; old messages keep old URLs.
Check both the application's Forgot password form and Studio's reset-email action.
The recipient should reach the application's password form, save a new password,
and sign in with it. Also check signup confirmation and secure email changes.
Token-hash links work across browsers; PKCE callback links require the originating
browser's verifier.

Default links passing through Supabase `/auth/v1/verify` are normal, but their
`redirect_to` should target the application. If it points at Supabase, inspect
site URL/allow-list/template configuration. See [troubleshooting](troubleshooting.md).

For the application database and images, follow [deployment](deployment.md).
Editing this repo's `config.toml` does not update the separately installed Auth
service. Self-hosted operators own backups, restore tests, TLS, SMTP, secret
rotation, Supabase upgrades, monitoring, and capacity.
