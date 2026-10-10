---
title: "Build history and results"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/users/workbench.md
---

# Build history and results

Open **Builds → All builds** to browse your history, 50 builds per page. Use
**Previous** and **Next** to reach older builds. Search by recipe,
target, version or build ID; filter by state and target; sort newest or oldest
first. These controls apply to the loaded builds, rather than searching all
other pages. Open **View** or **View build** for details.

Use **Delete** on a completed or failed build to remove it from your history.
The build page also offers Delete. Confirming removes its retained diagnostics
and access through that build's download link. Active builds cannot be deleted.
**Clear failed builds** removes all your failed builds, including older pages,
after confirmation. Downloaded files and saved recipes are unaffected. Shared
artifacts remain managed by the server's existing cache maintenance.

## Build monitor

| State | Meaning |
| --- | --- |
| Queued | The request is waiting for a worker |
| Building | Work is underway; the build page shows the current stage and retained compiler output |
| Ready | The build completed; download appears when artifact details are available |
| Failed | The build could not complete; read the reason and retry or review the recipe |

The build page refreshes while active. It shows observed stages and elapsed
times, rather than an estimated time remaining. A recent heartbeat means the
worker has been heard from; it does not mean compiler output is advancing.
Linking can be quiet. A monitor connection error concerns the page's connection
and does not by itself mean the build failed.

The compiler output is a bounded recent tail, not a complete downloadable log.
Use **Search output**, the match arrows, **Follow** and **Wrap lines** to inspect
it. Turn Follow off when reading earlier output. Older completed/failed build
output may be cleared by server maintenance.

## Completed builds

Choose **Download template .tpz** from the result or Download in history.
Follow [installation](install-templates.md) for the exact editor version and
template kinds you selected. Build activity is collapsed after completion and
can be reopened.

An identical completed recipe can reuse an existing artifact. **Cached artifact**
means this request used that artifact; no compiler ran for the request. It does
not grant access to another user's build history.

If the result instead says **Dry-run diagnostic ready**, it is a diagnostic
package produced by the instance's test configuration. It cannot be installed
as an export template; contact the instance operator if you expected a real build.

## Failed builds

The result shows the recorded reason. **Retry this recipe** submits a new build
with the same settings. **Review recipe** opens the settings for changes.
**Copy diagnostics** copies the build ID, error, recipe and retained output;
review the text before sharing it with your administrator. A manual-copy field
appears if clipboard access is unavailable.

## Inspector tabs

- **Performance:** observed stage durations, compiler-cache counters and peak
  process memory when recorded. Missing measurements are shown as unavailable.
- **Artifact:** package and template-binary sizes, SHA-256, recipe version and
  eligible [size comparisons](template-sizes.md).
- **Recipe:** the normalized configuration actually used, with edit/save and
  portable-file actions.

Peak process RSS measures the largest observed process/child memory value,
not total worker memory. Compiler cache hits describe reuse during compilation;
artifact reuse bypasses compilation entirely. Timing observations are not
completion predictions. Developer [measurement details](../developers/performance.md)
explain their collection.

See [help](user-help.md) for queued builds, stale activity and download problems.
