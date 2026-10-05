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

## Applying application migrations

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
