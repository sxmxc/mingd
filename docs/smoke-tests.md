# Template smoke tests

Use the standard editor matching the selected **4.7.2 or 4.6.3** template version
and the repository fixture at `tests/fixtures/smoke-project`. The owner confirms
the previous desktop release smoke tests pass. Repeat acceptance for the new
version/debug/Web combinations. The fixture checks scene registration and
GDScript startup; empty sprite/audio nodes do not test decoding or playback.

## Debug and Web acceptance

For each version, select release, debug or both. A debug export requires a debug
template; a release export requires a release template. Both must stay distinct
inside the TPZ. Verify debug exports connect to the editor's debugger.

For Web, start the dedicated worker (`npm run compose:web-builder:build`), install
the TPZ and add a Web preset using Compatibility. Match Thread Support to the
build selection; leave Extensions Support disabled. If using Custom Template,
select the nested Web ZIP. Export and serve over HTTP rather than `file://`.
For threaded exports configure COOP/COEP headers and verify
`crossOriginIsolated === true`. Test startup, displayed success message, console
errors and normal shutdown in an actual browser. Repeat with single-threaded
and threaded release/debug builds. Confirm cache reuse and separation across
versions, platforms, template kinds and thread settings.

## Build and download

After updating the application, rebuild the worker:

```bash
docker compose --profile builder up -d --build builder
```

Apply all pending migrations, including build performance and build matrix, first using the root README's rollout commands, then restart the web process. Configure `WEB_BUILDER_QUEUE_NAME` consistently in both processes if overriding its default. Keep `BUILDER_DRY_RUN=false` in the root `.env`.

Run this procedure for all eight combinations: Linux and Windows with Standard, Lean 2D, Offline 2D and Lean 3D. Select target and profile, wait for completion and download through the authenticated route. Record the build ID, SHA-256, artifact sizes and performance measurements from the inspector. Compare reduced profiles against Standard built with the same recipe/toolchain; do not claim a reduction before measuring it.

For Custom, test dependency toggles and select a fixture compatible with removed features. This fixture requires 2D physics; it is not suitable when that subsystem is removed. Actual audio/video/SVG assets, transport connections and complex-script text require separate feature-specific fixtures. An empty sprite/audio node or an Offline 2D label does not establish those capabilities.

Submit the same profile again and confirm it completes as a cached artifact. A build for the other platform must have a different cache identity and its own correctly named artifact.

## Install and export

1. In the matching Godot editor version, use **Editor > Manage Export Templates > Install from File** and choose the TPZ. It installs the selected kinds under that editor's version directory and can replace existing templates.
2. Import the fixture's `project.godot` and let the editor import its resources.
3. Add an export preset for **Linux** or **Windows Desktop**, matching the built template, with architecture **x86_64**. The fixture uses Compatibility/OpenGL.
4. Export to a separate output directory and match **Export With Debug** to the requested template kind.
5. On Windows, set **Export Console Wrapper** to **Debug and Release** to exercise the packaged wrapper. If resource modification requires an unavailable tool, disable **Application > Modify Resources** for this smoke test.

For explicit custom-template selection instead of installation, extract the package and set the preset's **Custom Template > Release** to `linux_release.x86_64` or `windows_release_x86_64.exe`. For Windows keep `windows_release_x86_64_console.exe` beside the main executable.

Once the preset is saved, exporting can also be performed from a terminal (replace `godot` with your editor executable and use your preset's actual name):

```bash
godot --headless --path tests/fixtures/smoke-project --export-release "Windows Desktop" /absolute/path/to/output/smoke.exe
```

Use a Linux preset and output filename for Linux. Headless export checks exportability; launch the result on the target operating system for visual acceptance.

## Launch and pass criteria

Linux: make the exported executable executable if needed and run it. Windows: copy the complete export directory to a Windows x86_64 machine and run `smoke.exe`, then `smoke.console.exe`. Keep any exported `.pck` beside the executable. The wrapper should start the same project and allow startup errors to be inspected.

The smoke test passes when a 640×360 window displays **min.gd smoke test passed**, the export/startup logs contain no errors, and the application closes normally. Compilation or ZIP validation alone does not satisfy this gate.

Record compilation, archive validation, authenticated download, Godot template acceptance, export and native/browser launch separately. Include build ID, recipe version, editor version, target, template kind, Web thread mode, artifact SHA-256, binary/package sizes and any errors. The owner confirmed existing desktop release acceptance; the expanded matrix requires its own records.
