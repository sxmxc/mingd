---
title: "Install and use templates"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/users/install-templates.md
---

# Install and use templates

Start with a completed build and its downloaded `.tpz` package. Use the
**exact stable Godot editor version** recorded in the build's recipe. The build
result also shows installation instructions specific to your target and kinds.

## Install the package

1. Open the matching Godot editor.
2. Choose **Editor → Manage Export Templates → Install from File**.
3. Select the downloaded `.tpz`.
4. Open your project, then add or select an export preset for the build's platform.
5. Match its architecture and settings to the recipe, then export.

Installing a package can replace templates already installed for that editor
version. A release-only package does not supply a debug template, and vice versa.
Enable **Export With Debug** for debug exports; disable it for release exports.

Run your exported game and check the features it uses. Exporting successfully
alone does not check gameplay, media, networking or language rendering.

## Use custom templates for one project

To select templates explicitly in a project's export preset, extract the TPZ
and set its **Custom Template → Release/Debug** fields to the matching file.
These fields take the platform executable, APK or nested ZIP, rather than the
outer TPZ. Only the kinds requested in your build are included.

| Target | Files inside the TPZ |
| --- | --- |
| Linux | `linux_release.x86_64`, `linux_debug.x86_64` |
| Windows | `windows_release_x86_64.exe`, `windows_debug_x86_64.exe`, with matching `_console.exe` companions |
| Web, single-threaded | `web_nothreads_release.zip`, `web_nothreads_debug.zip` |
| Web, threaded | `web_release.zip`, `web_debug.zip` |
| Android | `android_release.apk`, `android_debug.apk`, `android_source.zip` |
| macOS | `macos.zip` |

## Linux and Windows

Choose x86_64 in the export preset. Linux templates require glibc 2.36 or newer;
you may need to make the exported executable runnable on your target machine.
For Windows custom templates, keep each console companion beside its matching
executable. Keep the complete exported game directory, including any `.pck`.

## Web

Use the **Compatibility** renderer. Match **Thread Support** to your min.gd recipe
and leave **Extensions Support** disabled. Custom Template fields take the nested
Web ZIP, not an extracted WASM file.

Serve the exported game over HTTP rather than opening it with `file://`.
Threaded exports need these response headers on the **game's hosting server**:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The browser must report `crossOriginIsolated === true`. Single-threaded exports
do not require cross-origin isolation. min.gd does not host the exported game
or configure your game server's headers.

## Android

Enable only the recipe's selected ABI in your Android export preset:

| Recipe choice | Android ABI |
| --- | --- |
| ARM64 | arm64-v8a |
| ARMv7 | armeabi-v7a |
| x86_64 | x86_64 |
| x86 | x86 |

The package includes APK templates and `android_source.zip` with matching AARs
for Gradle exports. Use that source ZIP through Godot's Android build-template
workflow when using Gradle. You still need Godot's normal local Android export
setup. Check the exported game on a matching device or emulator. Swappy frame
pacing is excluded, so check frame timing if it matters to your project.

## macOS

Choose Apple Silicon, Intel or universal to match your recipe and use the
**Compatibility** renderer. Custom Template fields take `macos.zip`.
A universal recipe includes both architectures. Signing and notarizing your
exported game are handled through your own distribution workflow.

## If something goes wrong

See [help](user-help.md) for version mismatches, missing templates and project
compatibility. Developers checking compiler or packaging changes can use the
[smoke-project procedure](../developers/smoke-tests.md).

## Build version information

`README-mingd.txt` records the Godot version, builder image release tag and package version,
build recipe, optimization and release LTO setting used for the artifact.
Cached artifacts retain the information from their original build; downloading
an artifact again does not rewrite it with the current service versions.
