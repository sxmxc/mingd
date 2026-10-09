---
title: "Recorded template test reports"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/archive/template-test-reports.md
---

# Recorded template test reports

These notes preserve the scope of earlier results. They are historical reports,
not additional release requirements. The owner also reports having used the
smoke project to export with the templates successfully; no additional target
or configuration details were supplied in that report.

## Acceptance tracking

The owner confirms previous Linux/Windows desktop release smokes for Standard,
Lean 2D, Offline 2D, and Lean 3D. The earlier report did not list exact
build IDs/hashes or describe the expanded platform/version matrix.

### Owner-reported smoke test: Windows 4.7.2 Offline 2D

The owner reported a passing smoke test for Godot **4.7.2**, Windows **x86_64**,
with **debug + release** templates, `optimize=size` and LTO disabled. The supplied
normalized features exactly match the Offline 2D preset in
`packages/build-config/src/presets.ts`.

Reported stage durations total **3204.8 seconds (53m 24.8s)**: compiling 3051.2s,
linking 78.5s, preparing workspace 34.2s, uploading 20.5s, packaging 9.7s,
verifying source 7.1s, preparing source 2.0s, validating 1.1s and recording
artifact 0.5s. Compiler: `x86_64-w64-mingw32-g++ (GCC) 12-posix`; ccache 4.7.5
reported **1160 preprocessed hits / 2645 misses (30.5% hit rate)**. Peak process
RSS was **1138.1 MiB**; this is not total parallel-worker memory.

This records the owner's smoke-test result for the combined package. Separate
debug/release launch results, debugger connection, console-wrapper launch,
build ID, artifact hash/sizes and deployed recipe version were not supplied.
The report does not describe other configurations or audio/video/SVG/network tests.

Measurement definitions are maintained in [performance](../developers/performance.md).
