# Template workbench

The interface is organized around recipes, compiler activity and artifacts rather than a marketing dashboard. Signed-in users land on the build list. Search by platform, profile or build ID, filter by state, and open a build to inspect its recipe, output and artifact metadata.

The build monitor uses a desktop workbench layout, without a narrow centered content column: a compact toolbar places status beside live counters, with a slim horizontal stage rail underneath. The connected workspace gives the compiler console the remaining width beside a fixed 380px diagnostics pane. Performance, Artifact and Recipe tabs replace stacked inspector cards; stage timings use compact label/value rows, with detailed notes/counters expandable. Below 900px the workspace stacks; the toolbar wraps below 1100px, and small screens use two-column counters. Tabs support arrow keys, Home/End and visible focus. Polling, output-follow, worker liveness semantics and build execution are unchanged; this layout update requires no migration or worker restart.

The application header aligns with the full-width workbench gutters. Layout checks used synthetic builds, not the owner's running job: desktop panes were measured at 1920px and visually inspected at 1440px, with no overflow at 390px; keyboard tabs, output-follow, completion/artifact visibility and failure messages were exercised. Temporary fixture routes were removed. Rendering regression tests cover the tabset, activity strip, artifact reuse and failure information.

## Rollout

Apply all pending migrations before deploying the new worker and web app. The activity migration adds heartbeat/stage/output observations; `20261005044808_build_performance.sql` adds nullable, object-valued `performance_metrics`. Existing rows and ownership RLS are preserved; artifact storage stays private.

For a linked hosted project, verify the linked project is the intended dedicated project, inspect pending migrations, then push:

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
docker compose --profile builder up -d --build builder
```

For dedicated self-hosted Supabase, apply this same source-controlled SQL through your established migration workflow and record the migration in that workflow. Do not reset the dedicated database. A local development stack can be reproduced with `npx supabase start` and `npx supabase db reset --local` (reset destroys local development data).

If your established self-hosted workflow uses the CLI database URL, run `npx supabase migration list --db-url "$MINGD_DATABASE_URL"`, then `npx supabase db push --db-url "$MINGD_DATABASE_URL" --dry-run` and `npx supabase db push --db-url "$MINGD_DATABASE_URL"`. This variable is your private, URL-encoded Postgres connection string, not the Supabase HTTP API URL. Do not commit it or paste it into logs.

Restart the web development process or rebuild/redeploy it. No environment changes are needed. Keep root builder credentials and web server credentials privileged, and keep `BUILDER_DRY_RUN=false`.

## Activity semantics

- Worker heartbeat: published every 10 seconds during a running job, independently of compiler output. Under 45 seconds old means recently observed worker activity, not proof the compiler is advancing.
- Overdue heartbeat: the UI stops its active animation and warns that the worker may be stalled. A network failure is shown separately and polling retries.
- Compiler output: a bounded, sanitized 12,000-character tail, updated with heartbeats and stage transitions. Known credentials and common token patterns are redacted. Local process logs are capped at 2 MiB per command.
- Last output and output bytes: actual observed output, not an invented completion estimate. Linking can remain quiet while the worker is alive.
- Stage pipeline: queue, source preparation/verification, workspace, compilation, binary validation, packaging, upload, ready. Percentages remain internal stage markers; the UI does not present them as compilation progress.
- Elapsed and stage time: wall-clock observations, not estimated time remaining. Completed builds stop their clocks. A cache hit may have no worker/compiler history.
- Performance panel: persisted stage durations, observed linking interval, compiler-process peak RSS and per-build ccache hits/misses. See [measurement scope and benchmarking](performance.md). Older builds show measurements unavailable; artifact reuse is not shown as compiler-cache effectiveness.

Build detail polling runs every 2.5 seconds without overlapping requests, stops at terminal states, and aborts on unmount. The active build list refreshes every 10 seconds while visible. Output-follow can be disabled to inspect earlier lines. Keyboard focus and reduced-motion preferences are supported.

Build-history timestamps use an explicit UTC format (`YYYY-MM-DD HH:mm:ss UTC`) so the server and browser render identical text regardless of locale or timezone. Regression tests run with the web workspace's `npm test` command and the root test suite.

Artifact size, main-binary size, SHA-256 and recipe version are exposed only after the user's build ownership is verified; storage paths are not returned.

## Validation checklist

Test queued, compiling with output, quiet compilation, overdue heartbeat, network loss/recovery, complete, failed and cache-hit states. Check narrow screens, keyboard navigation, reduced motion, output-follow and unauthorized build access. Native Lean 2D compilation/export/launch on Linux and Windows still requires the [smoke procedure](smoke-tests.md); unit fixtures are not executable acceptance evidence.

Implementation validation: workspace typecheck and 13 shared/builder tests passed, including Linux ELF packaging, Windows GUI/console packaging, profile/hash guards and activity redaction. Browser checks used a temporary local fixture (removed afterward), covering queued/active/stale/complete/failed states, connection and submission errors, 390px layout without horizontal overflow, desktop layout, keyboard focus and reduced-motion animation suppression. Unauthenticated page redirects and API 401 responses were checked.

Customization/performance pass: workspace typecheck, production Next/Turbopack build in Docker, and 26 regression tests passed. The separate opt-in exact-source audit also passed all eight preset/target SCons dry-runs, observing ccache launchers and release output names. GCC and MinGW tests each required a cold miss, a warm hit from a different workspace and identical object bytes. Browser checks exercised preset loading/reset, parent dependencies, codec dependencies, fallback text, normalized Windows submission (intercepted; no real job queued), the performance panel and a 390px layout without overflow. The temporary UI fixture was removed. New presets/custom recipes still require full compilation and native acceptance; these checks are not evidence of a full-build speedup.

The activity migration and nonnegative byte constraint were tested in disposable Supabase Postgres with a minimal Storage fixture; ownership RLS returned only one user's row. This was not a full Supabase-stack reset or verification of the dedicated project's current state. Apply the migration there before deployment.

The complete migration history, including performance metrics, was also applied in disposable Supabase Postgres. Two synthetic owners verified one-row visibility and blocked authenticated updates; non-object metrics were rejected. That container and its synthetic data were removed. No dedicated-project migration or worker deployment was performed by these tests.
