# Template workbench

The interface is organized around recipes, compiler activity and artifacts rather than a marketing dashboard. Signed-in users land on the build list. Search by platform, profile or build ID, filter by state, and open a build to inspect its recipe, output and artifact metadata.

## Rollout

Apply `supabase/migrations/20261005025929_build_activity.sql` before deploying the new worker and web app. It adds nullable heartbeat/stage/output timestamps and a nonnegative output-byte count. Existing rows and ownership RLS are preserved; artifact storage stays private.

For a linked hosted project, verify the linked project is the intended dedicated project, inspect pending migrations, then push:

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
docker compose --profile builder up -d --build builder
```

For dedicated self-hosted Supabase, apply this same source-controlled SQL through your established migration workflow and record the migration in that workflow. Do not reset the dedicated database. A local development stack can be reproduced with `npx supabase start` and `npx supabase db reset --local` (reset destroys local development data).

Restart the web development process or rebuild/redeploy it. No environment changes are needed. Keep root builder credentials and web server credentials privileged, and keep `BUILDER_DRY_RUN=false`.

## Activity semantics

- Worker heartbeat: published every 10 seconds during a running job, independently of compiler output. Under 45 seconds old means recently observed worker activity, not proof the compiler is advancing.
- Overdue heartbeat: the UI stops its active animation and warns that the worker may be stalled. A network failure is shown separately and polling retries.
- Compiler output: a bounded, sanitized 12,000-character tail, updated with heartbeats and stage transitions. Known credentials and common token patterns are redacted. Local process logs are capped at 2 MiB per command.
- Last output and output bytes: actual observed output, not an invented completion estimate. Linking can remain quiet while the worker is alive.
- Stage pipeline: queue, source preparation/verification, workspace, compilation, binary validation, packaging, upload, ready. Percentages remain internal stage markers; the UI does not present them as compilation progress.
- Elapsed and stage time: wall-clock observations, not estimated time remaining. Completed builds stop their clocks. A cache hit may have no worker/compiler history.

Build detail polling runs every 2.5 seconds without overlapping requests, stops at terminal states, and aborts on unmount. The active build list refreshes every 10 seconds while visible. Output-follow can be disabled to inspect earlier lines. Keyboard focus and reduced-motion preferences are supported.

Artifact size, main-binary size, SHA-256 and recipe version are exposed only after the user's build ownership is verified; storage paths are not returned.

## Validation checklist

Test queued, compiling with output, quiet compilation, overdue heartbeat, network loss/recovery, complete, failed and cache-hit states. Check narrow screens, keyboard navigation, reduced motion, output-follow and unauthorized build access. Native Lean 2D compilation/export/launch on Linux and Windows still requires the [smoke procedure](smoke-tests.md); unit fixtures are not executable acceptance evidence.

Implementation validation: workspace typecheck and 13 shared/builder tests passed, including Linux ELF packaging, Windows GUI/console packaging, profile/hash guards and activity redaction. Browser checks used a temporary local fixture (removed afterward), covering queued/active/stale/complete/failed states, connection and submission errors, 390px layout without horizontal overflow, desktop layout, keyboard focus and reduced-motion animation suppression. Unauthenticated page redirects and API 401 responses were checked.

The activity migration and nonnegative byte constraint were tested in disposable Supabase Postgres with a minimal Storage fixture; ownership RLS returned only one user's row. This was not a full Supabase-stack reset or verification of the dedicated project's current state. Apply the migration there before deployment.
