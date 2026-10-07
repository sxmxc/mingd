# Saved recipes, sharing, and size comparisons

Recipes preserve validated semantic build settings. Saving, sharing, and portable
files do not execute commands or queue builds automatically. Deployment uses the
complete current migration history; see [deployment](deployment.md).

## Saved recipes

Name a configuration in the build form and choose **Save recipe**. The Builds
menu opens Saved recipes. Edit/build, duplicate, rename through the editor, save
as a new recipe, or delete. The build monitor's Recipe tab opens its settings in
the editor. Building does not overwrite a saved recipe.

Recipes store normalized settings including exact release, platform, architecture,
kinds, and Web threads. An unavailable catalog version is not silently replaced;
choose a different verified release explicitly. The library displays the 100
most recently updated recipes. `.gdbuild` import/export is described in
[portable recipes](recipe-files-and-mobile-templates.md#portable-recipes).

## Share links and privacy

Recipes are private by default. Owners can create an unguessable link, copy it,
and revoke it with **Stop sharing**. Deletion also revokes access. Anyone holding
a current link can view the saved name/configuration, and the link follows saved
edits. It is not a public recipe directory.

Shared pages reveal no owner identity, build history, artifact download, or
Storage path. Disabled owners' links become unavailable while disabled. Other
users can customize/build or save an independent private copy; sign-in preserves
the shared-recipe destination.

Recipe writes require JSON and compare browser Origin with incoming Host or
configured `NEXT_PUBLIC_APP_URL`. If a proxy changes Host, configure the public
app origin; arbitrary forwarded-host headers are not trusted for this check.

## Compatibility guidance

Feature controls show representative affected nodes, formats, and APIs. Guidance
summarizes normalized removals, dependencies, fallback text shaping, and platform
restrictions. It does not scan a project or guarantee compatibility. Use a
[compatible smoke fixture](smoke-tests.md#fixture-limits-and-evidence).

Feature examples/mappings are based on exact supported source, including
[Godot 4.7.2 scene registration](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/register_scene_types.cpp).
They are not an exhaustive class inventory.

## Measured comparisons

The Artifact tab compares the main engine bytes with matching official templates:

| Platform | Measured binary |
| --- | --- |
| Linux / Windows | Main executable; exclude Windows console wrapper |
| Web | Uncompressed WASM; exclude HTML/JS/ZIP overhead |
| Android | Engine `libgodot_android.so`; exclude APK/C++ runtime |
| macOS | Main universal Mach-O executable or matching architecture slice; exclude app wrapper |

Debug and release are summed for a both-kind recipe. Match exact release,
platform, architecture, kind, and Web thread mode. Missing, partial, invalid,
or dry-run measurements produce no savings claim. Larger binaries are reported
as larger. Existing artifacts with normalized config and binary size can use
new references without recompilation.

The reference migration seeds eight verified 4.7.2 desktop/Web measurements.
Maintenance backfills the current inventory: 22 rows for 4.6.3/4.7.2 including
Android/macOS, eight for releases without those build targets. The measured 4.7.2
Windows release executable is 109,268,480 bytes (104.21 MiB), distinct from its
103,176,704-byte debug executable. The homepage's 15.47 MiB custom example is the
owner's rounded measurement; build results use exact recorded bytes.

Official/min.gd toolchains and features may differ. A size comparison measures
resulting engine bytes, not runtime performance or final game download size.
Reference provenance and measurement timestamps appear in the inspector.

## Import reference measurements manually

Normally [maintenance](maintenance.md) manages these. For an operator-run import,
download the exact standard official TPZ from `godotengine/godot-builds`, then:

```bash
node --import tsx scripts/import-template-references.mjs --version 4.7.2 --archive /path/to/Godot_v4.7.2-stable_export_templates.tpz --dry-run
node --import tsx scripts/import-template-references.mjs --version 4.7.2 --archive /path/to/Godot_v4.7.2-stable_export_templates.tpz
```

Python 3 and outbound official release API access are required. The importer
checks identity, file size, official SHA-256, embedded version, and ELF/PE/WASM/
Mach-O structure before upsert. It never executes templates; bounded nested
archives can spool to temporary disk. Missing/invalid entries abort the import.

`--dry-run` measures without accessing Supabase. Write mode loads root `.env`
and prefers `NEXT_PUBLIC_SUPABASE_URL` over `SUPABASE_URL`; confirm the intended
URL/privileged key before running. Only operators should import into production.

## Validation

[Development checks](development.md) include recipe/sharing SQL tests, comparison
pure tests, and archive/reference fixtures. Manually check save/edit/duplicate,
sharing/sign-in return/revocation, disabled-owner links, ownership, and narrow
layouts when changing these flows. Synthetic comparisons and archive fixtures do
not establish that a newly compiled template runs.
