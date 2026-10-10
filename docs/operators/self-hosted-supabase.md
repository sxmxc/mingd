---
title: "Supabase configuration"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/operators/self-hosted-supabase.md
---

# Supabase configuration

min.gd requires Supabase Auth, Postgres, Storage and its API endpoint. Supabase
can be managed or self-hosted; a dedicated Supabase machine is not required.
Apply this repository's migrations, configure the application URLs and keys,
and set Auth redirects and email delivery in the Supabase deployment you use.
For self-hosting, use the official
[self-hosted distribution](https://supabase.com/docs/guides/self-hosting/docker)
for production. `npx supabase start` is for local development. The supplied min.gd
Compose files do not provision production Supabase. The self-hosted environment
and Compose examples below are one setup option; managed projects use their
provider's Auth and email settings instead.

## Configuration ownership

| Change | Where to make it |
| --- | --- |
| App URL, public API key, privileged Supabase key, gateway settings | Application host `.env`; `apps/web/.env.local` for web development |
| Worker gateway URL, token files, target resource limits | Worker host `.env` and private `worker-tokens/`; no Supabase keys |
| Auth site URL, allowed redirects, SMTP, email templates | Supabase project settings or self-hosted Auth configuration |
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

In Supabase Auth, set the application site URL and allow
`https://mingd.example.com/auth/callback`. For self-hosted Compose, an example is:

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

Configure SMTP in Supabase Auth, enable email confirmations, and keep secure
email changes enabled. This repository provides confirmation, recovery, and
email-change HTML in [`supabase/templates`](../../supabase/templates). Recovery
links use `/auth/confirm` to verify the token, set session cookies, and open
`/account/reset-password`.

For self-hosted Auth template URL settings, Auth fetches HTML over HTTP; a mounted file alone is insufficient.
The local CLI's `content_path` is not remote Auth configuration. See
[Supabase's template guide](https://supabase.com/docs/guides/self-hosting/custom-email-templates).

Managed projects can set the repository HTML in their Auth email template editor.
For self-hosted Auth, the following optional template service serves that HTML.
Add it to the Supabase deployment's Compose configuration:

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
The three templates use inline styling, a text wordmark and the app's existing
PNG logo at `{{ .SiteURL }}/web-app-manifest-192x192.png`. Keep that image publicly
reachable over HTTPS; no extra assets need to be copied to the template server.
The wordmark remains visible when an email client blocks remote images. Each includes a
fallback URL using the same token hash and confirmation type as its action button.
Browser previews validate layout only; request fresh emails after deployment to
check rendering in your email clients and the actual confirmation flows.

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
