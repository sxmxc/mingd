# Template smoke tests

Use the Godot **4.7.2 standard editor** and the repository fixture at `tests/fixtures/smoke-project`. The fixture contains Node2D, Sprite2D, Label, CharacterBody2D, CollisionShape2D, AudioStreamPlayer and GDScript. It checks scene/type registration and script startup; the empty sprite and audio player do not test texture decoding or audio playback.

## Build and download

After updating the application, rebuild the worker:

```bash
docker compose --profile builder up -d --build builder
```

Apply the build-activity migration first using [the workbench rollout](workbench.md), then restart the web process. No new environment variable is required. Keep `BUILDER_DRY_RUN=false` in the root `.env`.

Run this procedure for all four combinations: Linux Standard, Windows Standard, Linux Lean 2D, and Windows Lean 2D. Select target and profile, wait for completion and download through the authenticated route. Record the build ID, SHA-256 and artifact sizes from the inspector. Compare Lean 2D against a Standard artifact built with the same recipe/toolchain; do not claim a reduction before measuring it.

Submit the same profile again and confirm it completes as a cached artifact. A build for the other platform must have a different cache identity and its own correctly named artifact.

## Install and export

1. In Godot 4.7.2, use **Editor > Manage Export Templates > Install from File** and choose the TPZ. It installs the platform's release template under `4.7.2.stable`; this can replace an existing release template for that platform.
2. Import the fixture's `project.godot` and let the editor import its resources.
3. Add an export preset for **Linux** or **Windows Desktop**, matching the built template, with architecture **x86_64**. The fixture uses Compatibility/OpenGL.
4. Export to a separate output directory and **uncheck Export With Debug**: these packages include release templates only.
5. On Windows, set **Export Console Wrapper** to **Debug and Release** to exercise the packaged wrapper. If resource modification requires an unavailable tool, disable **Application > Modify Resources** for this smoke test.

For explicit custom-template selection instead of installation, extract the package and set the preset's **Custom Template > Release** to `linux_release.x86_64` or `windows_release_x86_64.exe`. For Windows keep `windows_release_x86_64_console.exe` beside the main executable.

Once the preset is saved, exporting can also be performed from a terminal (replace `godot` with your editor executable and use your preset's actual name):

```bash
godot --headless --path tests/fixtures/smoke-project --export-release "Windows Desktop" /absolute/path/to/output/smoke.exe
```

Use a Linux preset and output filename for Linux. Headless export checks exportability; launch the result on the target operating system for visual acceptance.

## Launch and pass criteria

Linux: make the exported executable executable if needed and run it. Windows: copy the complete export directory to a Windows x86_64 machine and run `smoke.exe`, then `smoke.console.exe`. Keep any exported `.pck` beside the executable. The wrapper should start the same project and allow startup errors to be inspected.

The smoke test passes when a 640×360 window displays **GDSlimmer smoke test passed**, the export/startup logs contain no errors, and the application closes normally. Compilation or ZIP validation alone does not satisfy this gate.

Record compilation, archive validation, authenticated download, Godot template acceptance, release export, and native launch separately. Include build ID, recipe version, editor version, target OS, artifact SHA-256, main binary/package sizes and any errors. Linux acceptance was confirmed by the project owner; Windows native acceptance remains pending until these steps are completed.
