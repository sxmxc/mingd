---
title: "min.gd naming"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/naming.md
---

# min.gd naming

| Context | Name |
| --- | --- |
| Product brand, header, page title, human-readable copy | **min.gd** |
| Repository / checkout | `mingd` |
| npm scope | `@mingd/` (`web`, `builder`, `build-config`) |
| Docker images | `mingd/web`, `mingd/maintenance`, `mingd/builder`, and platform worker names |
| Artifact prefix and technical identifiers | `mingd` |
| Project-specific environment prefix | `MINGD_` |
| Portable recipe extension | `.gdbuild` |

The period belongs in visible branding, not package scopes or Docker repository
names. Godot's required template filenames and `version.txt` remain unchanged.
There is no standalone `mingd` CLI. Repository operator commands use npm scripts;
image-only production uses Docker Compose directly.
The product name does not configure DNS or establish ownership of `min.gd`.

## Infrastructure identities

The checked-in local Supabase project ID is **`mingd-local`**, defined in
[`config.toml`](../supabase/config.toml). It identifies local CLI containers/data,
not the separate production installation. Changing it selects a different local
stack and does not move existing data automatically.

Compose infers its project name from the checkout unless configured otherwise.
Moving/renaming a checkout can therefore select different volumes. Preserve the
existing `COMPOSE_PROJECT_NAME` or map existing volumes explicitly when moving
an installation; do not run `docker compose down -v` as part of a rename.
Historical deployments may retain older infrastructure names without changing
the visible brand.

Queue/bucket names and database migration history are operational identities,
not display labels. Keep them stable across upgrades unless intentionally migrating
all consumers/data. Existing artifacts retain stored filenames; new output uses
`mingd-...tpz` and `README-mingd.txt`. Current cache recipe policy is documented in
[architecture](architecture.md#cache-identity), not historical rebrand instructions.

Run `npm ci` after checkout/dependency changes to restore correct workspace links.
Follow [deployment](deployment.md) to drain jobs and deploy compatible service images at their independent tags.
