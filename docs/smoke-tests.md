# Template smoke tests

Use the standard Godot editor matching the selected **exact stable release** and
[`tests/fixtures/smoke-project`](../tests/fixtures/smoke-project). Compilation,
archive validation, template installation, export, and runtime launch are separate
checks. Record each; a successful worker job is not enough.

Desktop release acceptance is owner-confirmed, including a specific 4.7.2 Windows
Offline 2D debug+release smoke. See [acceptance tracking](build-profiles.md#acceptance-tracking).
Other versions/kinds/platforms/custom recipes need their own records.

## Prepare builds

Deploy migrations and matching web/workers using [deployment](deployment.md).
Set `BUILDER_DRY_RUN=false` and start the worker for the requested platform.
For example, `npm run compose:builder:build` starts desktop and
`npm run compose:web-builder:build` starts Web.

For desktop, cover Linux/Windows with Standard, Lean 2D, Offline 2D, and Lean 3D.
Request release/debug/both as applicable. Record build ID, normalized recipe,
recipe version, source/editor version, package/binary sizes, SHA-256, performance,
and errors. Compare reduced presets against Standard with the same toolchain/
recipe; do not infer reductions from preset names.

Submit an identical recipe again and confirm artifact reuse. Change platform,
version, template kinds, architecture, or Web threads and verify distinct cache
identities where applicable. Custom recipes need fixtures compatible with their
removed systems.

## Desktop installation and export

1. In the matching editor, choose **Editor > Manage Export Templates > Install
   from File** and select the TPZ. Installation can replace templates for that
   editor version.
2. Import the fixture's `project.godot` and let resources import.
3. Add a Linux or Windows Desktop preset with x86_64 architecture and
   Compatibility/OpenGL rendering.
4. Export into a separate output directory. A release export needs a release
   template; **Export With Debug** needs a debug template. For both-kind packages,
   exercise both separately and check editor debugger connection for debug.
5. On Windows, enable **Export Console Wrapper > Debug and Release** and exercise
   the wrapper. If resource modification tools are unavailable, disable
   **Application > Modify Resources** for this test.

Custom Template fields take extracted executables: `linux_release.x86_64` /
`linux_debug.x86_64`, or `windows_release_x86_64.exe` /
`windows_debug_x86_64.exe`. Keep each Windows console companion beside its main
executable. Never relabel a debug binary as release.

After saving the preset, terminal export can use its actual name:

```bash
godot --headless --path tests/fixtures/smoke-project --export-release "Windows Desktop" /absolute/path/to/output/smoke.exe
godot --headless --path tests/fixtures/smoke-project --export-debug "Windows Desktop" /absolute/path/to/output/smoke-debug.exe
```

Replace `godot` with the matching editor executable. For Linux, use the Linux
preset name and appropriate output filename. Headless export does not test launch.

Launch on the target OS. Linux may need executable permissions. On Windows,
launch the game and its console wrapper; retain the full export directory and
any `.pck`. Pass when a 640×360 window displays **min.gd smoke test passed**, logs
have no export/startup errors, and the app closes normally.

## Web

Install the TPZ and add a Web preset using Compatibility/WebGL 2. Match Thread
Support to the build and leave Extensions Support disabled. Custom Template
fields take the nested Web ZIP, not extracted WASM.

Export and serve over HTTP, not `file://`. Threaded exports require
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` on the exported game's hosting server;
verify `crossOriginIsolated === true`. These are game-hosting requirements,
not automatically settings for the min.gd frontend.

Exercise startup, displayed success message, console errors, debug connection,
and normal shutdown in a real browser for single-threaded/threaded and requested
kinds. Check exported support files and relevant asset loading.

## Android

Use 4.6.3 or 4.7.2 and the matching [Android worker](recipe-files-and-mobile-templates.md#android).
Each recipe builds one ABI; enable only that ABI in the export preset. Install
selected APK templates and use the bundled `android_source.zip` for the relevant
Gradle export workflow.

Test debug and release exports on actual matching devices/emulators for every
offered ABI. Record install/startup/log output, touch/display behavior, frame
pacing, and closure. Exercise Gradle/custom-source export separately. Matching
APK/AAR headers are fixture coverage, not device acceptance. Swappy is disabled.

## macOS

Provision the verified [cross-toolchain](recipe-files-and-mobile-templates.md#macos-on-linux)
and use 4.6.3 or 4.7.2. Install the TPZ containing `macos.zip`, export with
Compatibility/OpenGL, and run debug/release builds on actual Apple Silicon and
Intel Macs. Check a universal export on both architectures, app permissions,
startup logs, debugger behavior, and closure. Test signing/notarization through
your distribution workflow separately.

## Fixture limits and evidence

The fixture exercises 2D scene/type registration and GDScript startup. It needs
2D physics and does not suit a recipe removing that subsystem. Empty sprite/audio
nodes do not test decoding/playback. Real audio/video/SVG assets, networking,
complex-script text, 3D, and other removed/retained systems need feature-specific
projects. Compatibility guidance does not scan a project.

Keep acceptance records with build ID, recipe/source/editor version, platform,
architecture, kind, Web thread mode, artifact SHA-256, sizes, test environment,
and results for compilation, download, installation, export, and launch. Treat
new releases and changed toolchains/recipes as new acceptance work.
