# Self-hosted Supabase notes

For production, use Supabase's official self-hosted Docker distribution. Do not expose `supabase start` to the public internet; that stack is intended for local development/testing.

High-level production shape:

```text
Caddy / reverse proxy
  |-- gdslimmer.example.com       -> Next.js
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

gdslimmer only requires Auth, Postgres, Storage, and the API gateway. Realtime is optional because the bootstrap polls build status.

Operational responsibilities when self-hosting include database backups, Storage backups, SMTP, TLS, secrets, upgrades, monitoring, and capacity management.

Current official docs: https://supabase.com/docs/guides/self-hosting/docker
