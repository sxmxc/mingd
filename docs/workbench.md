# Template workbench and activity

Signed-in users land on build history. Search by platform, profile, or build ID,
filter by state, and open a build to inspect compiler activity, recipe, and artifact.
The Builds menu includes history, new build, and saved recipes; the account menu
provides settings/sign-out. SuperAdmins also see administrative navigation.

## Build monitor

The monitor places live counters and a stage rail above compiler output, with
Performance, Artifact, and Recipe inspector tabs. At narrow widths the workspace
stacks. Tabs support arrow keys, Home/End, visible focus, and reduced-motion
preferences. Output-follow can be disabled to inspect earlier lines.

Build details poll every 2.5 seconds without overlapping requests, abort on
unmount, and stop at terminal states. Active history refreshes every 10 seconds
while visible. History timestamps use explicit `YYYY-MM-DD HH:mm:ss UTC` to
keep server/browser rendering consistent.

## Interpret the observations

| Observation | Meaning |
| --- | --- |
| Heartbeat | Worker publishes every 10 seconds independently of compiler output |
| Heartbeat under 45 seconds old | Recently observed worker activity; not proof the compiler is advancing |
| Overdue heartbeat | UI warns that work may be stalled; a connection failure is shown separately |
| Output tail | Bounded, sanitized 12,000-character compiler tail; quiet linking can be normal |
| Output timestamp/bytes | Actual observations, not a completion estimate |
| Stage and elapsed times | Wall-clock observations, not estimated time remaining |
| Artifact reuse | Existing artifact fulfilled this request; compiler timings/cache counters may be absent |

The stage sequence covers source preparation/verification, workspace,
compilation/linking, validation, packaging, upload, and readiness. Internal stage
markers are not a meaningful compilation percentage and are not shown as one.
Completed builds stop their clocks.

Known credentials/common token patterns are redacted from persisted output.
Local command logs are capped at 2 MiB per command. Daily maintenance clears
older terminal log tails while retaining results and metrics.

## Inspector tabs

**Performance** shows observed durations, linking, process peak RSS, and per-build
compiler-cache counters when available. Older builds can have null measurements.
Read [measurement scope](performance.md) before interpreting memory/cache values.

**Artifact** shows package/main-binary sizes, SHA-256, recipe version, and eligible
[official-template comparisons](recipes-and-comparisons.md#measured-comparisons).
Metadata and signed downloads require ownership or SuperAdmin access; private
Storage paths are not returned as ordinary build-detail fields.

**Recipe** shows the normalized recipe and can open it in the editor for a new
build. Saved/shared/portable recipes preserve semantic settings, not compiler
commands. See [recipes](recipes-and-comparisons.md).

## Deployment and validation

Apply pending migrations and deploy compatible web/workers using
[deployment](deployment.md).

For UI changes, exercise queued, active-output, quiet, overdue-heartbeat,
network-loss/recovery, complete, failed, and cache-hit states. Check narrow
screens, keyboard navigation, reduced motion, output-follow, artifact availability,
and unauthorized access. Rendering/formatting tests are in the web workspace.
Check template export and launch using [smoke tests](smoke-tests.md).
