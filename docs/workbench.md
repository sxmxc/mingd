---
title: "Template workbench and activity"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/workbench.md
---

# Template workbench and activity

Signed-in users land on build history. Search by platform, profile, or build ID,
filter by state, and open a build to inspect compiler activity, recipe, and artifact.
The Builds menu includes history, new build, and saved recipes; the account menu
provides settings/sign-out. SuperAdmins also see administrative navigation.
History uses a table on desktop and compact cards on narrow screens. Search and
filters apply to the latest 50 loaded builds; clear filters from the empty state.

## Build monitor

The monitor places live counters and a stage rail above compiler output, with
Performance, Artifact, and Recipe inspector tabs. At narrow widths the workspace
stacks. Tabs support arrow keys, Home/End, visible focus, and reduced-motion
preferences. Output-follow can be disabled to inspect earlier lines.

Completed builds lead with the download, package size, measured official/custom
size bars when a reference is available, and instructions for the exact editor
version, platform, template kinds, and Web thread mode. The custom-template
instructions use the shared package filename mapping. Dry-run diagnostics never
show template-installation instructions. Completed-build activity and compiler
diagnostics are collapsed and can be reopened.

Failed builds show the recorded reason with actions to retry, review the recipe,
and copy diagnostics. The copied summary contains the build ID, recorded stage,
error, recipe, and retained output; review it before sharing. If clipboard access
is unavailable, a selectable text field provides a manual copy fallback. An exact
failure stage is still unavailable when the backend did not retain it; timing
observations are not presented as proof of which stage failed.

The configuration sidebar keeps build actions visible and groups saving,
importing, and exporting recipes in an expandable section. Editing a saved recipe
opens that section. Loading, unavailable-build, and load-error screens provide
feedback and a route back to history.

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
