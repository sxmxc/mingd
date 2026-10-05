# min.gd naming

| Context | Name |
| --- | --- |
| Product brand, header/wordmark, page title, human-readable copy | **min.gd** |
| Repository and checkout name | `mingd` |
| Future CLI command | `mingd` |
| npm workspace scope | `@mingd/` (`web`, `builder`, `build-config`) |
| Builder Docker image | `mingd/builder` |
| Artifact prefix, technical identifiers and test paths | `mingd` |
| Project-specific environment prefix | `MINGD_` |

The period belongs only in visible branding, not package scopes, executable names, filesystem prefixes or Docker repository names. File extensions such as `.tpz` remain normal extensions. Godot's required filenames (`linux_release.x86_64`, `windows_release_x86_64.exe`, console companions and `version.txt`) are unchanged.

There is no standalone CLI in this repository yet. `mingd` is the reserved command name, not a newly installed executable. npm workspace scripts remain the supported development interface.

## Existing installations

Run `npm install` after the workspace rename so local workspace symlinks match `@mingd/...`. Let active/queued builds finish on the old worker, then rebuild it with `docker compose --profile builder up -d --build builder` and restart the web process to clear stale module references. Compose now tags the image `mingd/builder`. Do not interrupt an active build just to rebrand, or submit new recipe-7 jobs to a recipe-6 worker: the hash guard will reject them.

Recipe **7** changes the archive prefix and bundled README to `mingd-...tpz` and `README-mingd.txt`, containing the min.gd brand. This prevents new requests from reusing recipe-6 packages with old branding. Compiler flags/toolchains are unchanged and persisted ccache remains reusable. Existing build records and storage objects keep their original filenames; downloads still use their stored paths. No database migration is required for the rename.

The current working directory and any hosted Git repository were **not moved or renamed** automatically. The repository identity/package name and documentation use `mingd`; rename the hosted repository/checkout separately when convenient.

Moving a checkout can change Docker Compose's inferred project name and select different volumes. Preserve the existing Compose project name (for example `COMPOSE_PROJECT_NAME=gdslimmer` for an existing default checkout) or explicitly map the current volumes before moving. Never use `docker compose down -v` as part of a rename. The legacy local Supabase `project_id = "gdslimmer"` is intentionally retained to preserve its local-stack identity; it is not a brand identifier. Dedicated Supabase URLs/credentials, migrations, Redis queue names and artifact bucket names are unchanged. Fresh installations may deliberately choose their own infrastructure identities.

Naming policy does not establish domain ownership: `min.gd` is the brand here, not a configured or registered domain.

Validation: workspace typecheck, 30 regression tests (including naming and branded-package checks), production Next/Turbopack build, Compose configuration and `mingd/builder` image build passed. Node/tsx inside the actual image resolved `@mingd/build-config` with recipe 7. Browser checks confirmed the min.gd wordmark and page title without page errors. No active worker was restarted or dedicated Supabase state changed.
