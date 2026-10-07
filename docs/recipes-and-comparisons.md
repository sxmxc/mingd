# Saved recipes, sharing and size comparisons

Apply `20261006215344_recipes_and_template_references.sql`, then rebuild the web
image. No worker restart or new environment variable is required. The build
recipe version stays unchanged: these features do not change compiled output.

## Saved recipes

Name the configuration in the build form and choose **Save recipe**. **Saved
recipes** is in the Builds menu. Edit/build, duplicate, rename through the editor,
save as a new recipe, or delete a recipe. The Recipe tab on a build can open its
configuration in the editor. Saving does not queue a build. Building does not
automatically overwrite a saved recipe.

Recipes store the full validated, normalized configuration, including the exact
Godot version, target, template kinds and Web thread mode. An unavailable catalog
version is not silently replaced. Choose another verified version explicitly.
The library shows the 100 most recently updated recipes.

Recipes are private by default. Owners can create an unguessable share link,
copy it, and revoke it using **Stop sharing**. Deleting a recipe also revokes the
link. Shared pages expose the saved name and configuration only, never an owner
identity, build history, artifact download or storage path. A share link follows
the saved recipe's edits. Anyone with the link may view it; it is not a public
directory. Disabled owners' links become unavailable while their account is
disabled. Other users can customize or save an independent private copy. Sign-in
preserves the recipe link.

Recipe writes require JSON and check the browser Origin against the incoming
Host or configured `NEXT_PUBLIC_APP_URL`. This supports standalone Docker's
internal listen address. A reverse proxy that replaces Host needs the public
app origin configured in `NEXT_PUBLIC_APP_URL`; arbitrary forwarded-host headers
are not trusted by this check.

## Compatibility guidance

Feature controls list representative nodes, resource formats and APIs affected
by removal. The compatibility check summarizes normalized removals, dependent
features, fallback text shaping and fixed platform restrictions. This guidance
does not scan a project or promise compatibility. Validate a compatible project
using the [smoke procedure](smoke-tests.md).

Representative class examples are checked against Godot 4.7.2's
[scene registrations](https://github.com/godotengine/godot/blob/4.7.2-stable/scene/register_scene_types.cpp)
and the existing shared feature mappings. They are not an exhaustive class list.

## Measured comparisons

The Artifact tab compares main executable bytes on desktop and uncompressed
WASM bytes on Web. Both kinds are summed when a package contains debug and
release. TPZ/ZIP overhead, JS support files and Windows console wrappers are
excluded from both sides. Comparisons match exact Godot version, platform,
architecture, template kind and Web thread mode. Missing, partial, invalid or
dry-run measurements produce no savings claim. Larger custom binaries are
reported as larger. Existing artifacts with recorded normalized configurations
and binary sizes can use new reference measurements without recompilation.

The migration includes eight verified Godot 4.7.2 measurements, from the official
TPZ with SHA-256
`f298490b8d44d934be425a5a65a51bf15f422428b229a06a6e11d9ffea248011`.
Its Windows x86_64 release executable is **109,268,480 bytes (104.21 MiB)**;
debug is **103,176,704 bytes (98.40 MiB)**. This corrects the earlier homepage
comparison that accidentally used the debug reference for a release claim.
The homepage's custom 15.47 MiB remains the owner's rounded measurement.
Build results compute percentages using exact recorded byte sizes.

Official templates and min.gd may use different toolchains and built-in features;
this measures resulting size, not runtime performance or final game download size.

### Adding another version's reference measurements

Download that version's standard official export-template TPZ from
`godotengine/godot-builds`. From the repository root:

```sh
node --import tsx scripts/import-template-references.mjs --version 4.7.2 --archive /path/to/Godot_v4.7.2-stable_export_templates.tpz --dry-run
node --import tsx scripts/import-template-references.mjs --version 4.7.2 --archive /path/to/Godot_v4.7.2-stable_export_templates.tpz
```

The importer requires Python 3 (standard library only) and network access to the
official release API. It checks the release identity, asset size and official
SHA-256 before reading any ZIP entries. It verifies the embedded version and
x86_64 ELF/GUI PE or WASM header. It neither extracts files to disk nor executes
templates. Missing entries or checksums abort the import. The write command
reads the root `.env` Supabase URL and privileged key; only administrators should
run it against their intended database. `--dry-run` does not access Supabase.
Reference timestamps and archive provenance are available in the inspector.

## Validation

Run `npm run typecheck` and `npm test`. On a disposable Supabase stack, apply all
migrations using `npx supabase db reset --local`, then `npx supabase test db --local`.
`supabase/tests/recipes.sql` covers ownership, writes, sharing revocation,
disabled users and privileged reference measurements. Never reset the hosted
project for validation.

Implementation validation passed the workspace typecheck, 48 application/shared/
builder tests (four opt-in toolchain checks skipped), and a production Next.js
image build. All migrations were reproduced by a reset of a separate disposable
Supabase stack; 37 pgTAP permission checks passed and security advisors reported
no issues. HTTP/browser checks covered saving, editing, duplication, anonymous
sharing, sign-in return, link copying/revocation, disabled owners, ownership and
390px layouts. Comparison display used a synthetic build against real measured
official references; it did not compile a new custom template. The importer was
tested in both dry-run and write mode against the disposable stack. No migrations,
resets, imports or deployment were performed on the self-hosted project.
