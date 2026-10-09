---
title: "Understand template sizes"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/users/template-sizes.md
---

# Understand template sizes

min.gd shows the downloaded **package size** and, when measured, the size of its
**template binaries**. The package includes archive/container overhead and
support files, so those numbers measure different things.

## Official-template comparisons

When a matching reference is available, the build result and Artifact tab compare
engine binary bytes with official Godot templates. References match the exact
release, platform, architecture, template kind and Web thread mode.

| Platform | Bytes being compared |
| --- | --- |
| Linux / Windows | Main engine executable, excluding the Windows console wrapper |
| Web | Uncompressed WASM, excluding HTML, JavaScript and ZIP overhead |
| Android | Engine `libgodot_android.so`, excluding the APK container and C++ runtime |
| macOS | Main executable for the selected architecture, or the full universal executable |

A both-kind build sums debug and release engine bytes. When a matching reference
is missing or incomplete, the app does not invent a savings percentage. A
larger custom binary is reported as larger. Diagnostic packages are excluded.

Removing features can reduce engine size, but the result depends on the recipe,
version and toolchain. These measurements do not predict frame rate, total game
size or download size after adding your game's assets.

## Homepage examples

The homepage shows a recorded snapshot of real Offline 2D builds, rather than
your account's current builds or a promised reduction for every game. Your build
result uses its own measured bytes and matching reference when available.

For collecting and interpreting measurements as a developer, see
[performance](../developers/performance.md). Operators maintain references through
[maintenance](../operators/maintenance.md#official-release-and-reference-refresh).
