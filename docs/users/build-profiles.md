---
title: "Platforms, presets and engine features"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/users/build-profiles.md
---

# Platforms, presets and engine features

Choose the target you intend to export for, then keep the engine features your
project uses. min.gd builds export templates from official stable Godot source;
it does not build a custom editor or accept arbitrary source repositories,
patches, modules or compiler commands. .NET and iOS are not supported.

## Supported matrix

| Platform | Architecture choices | Godot versions |
| --- | --- | --- |
| Linux | x86_64 | Official stable Godot 4 releases discovered by the app, from 4.5 onward |
| Windows | x86_64 | Same discovery policy |
| Web | wasm32 | Same discovery policy |
| Android | ARM64, ARMv7, x86_64, x86 | 4.6.3 and 4.7.2 |
| macOS | Apple Silicon, Intel, universal | 4.6.3 and 4.7.2 |

Match the **exact release** of your Godot editor. The version selector uses
verified release discovery. If discovery is temporarily unavailable, the form
shows previously verified versions and a notice. A saved recipe's unavailable
version is not silently replaced.

macOS builds depend on the instance operator enabling the required toolchain.
If the form says macOS builds are unavailable, you can still save and export a
recipe. Saving a recipe does not make a worker available.

## Template kinds

- **Release:** shipping exports; turn off **Export With Debug** in Godot.
- **Debug:** debugging exports; turn on **Export With Debug**.
- **Release + debug:** includes both kinds in one package.

All builds use size optimization. New Linux and Windows recipes enable link-time
optimization (LTO) for release templates by default; uncheck **Smaller release
template (LTO)** for a faster build. Imported and saved recipes retain their LTO
choice. Debug templates and Web, Android, and macOS builds keep LTO disabled.
The form does not provide arbitrary compiler flags.

## Presets and custom features

| Preset | Starting feature set |
| --- | --- |
| Standard | Keeps the default engine features, subject to platform restrictions |
| Lean 2D | Removes 3D and its dependent systems; keeps common 2D, GUI, audio and networking features |
| Offline 2D | Lean 2D plus removal of scene multiplayer, ENet, WebSocket and WebRTC |
| Lean 3D | Keeps 3D rendering, physics, navigation and glTF; removes OpenXR, CSG and GridMap |

Offline 2D does not remove core HTTP/TCP functionality on desktop. Standard is
not a byte-for-byte copy of the official Godot templates.

Choose a preset, then customize its feature checkboxes. Search by feature or
API, and open **Impact and examples** to see representative affected classes
and formats. **Reset to …** restores the starting preset's features. The recipe
is labelled Custom when its features no longer match a normalized preset.

Dependencies are applied automatically: removing 3D removes its dependent
systems; removing multiplayer removes its transports; removing Ogg/Vorbis also
removes Theora. Turning a parent back on does not automatically restore its
children. TileMap is always included.

**Text shaping → Fallback** reduces shaping support and can affect complex
scripts and bidirectional text. Keep **Advanced** when your UI needs them.
Compatibility guidance explains the selected configuration; it does not scan
your project or guarantee that removed features are unused.

## Fixed platform restrictions

| Platform | What to consider for your game |
| --- | --- |
| Linux | x86_64 exports require glibc 2.36 or newer |
| Windows | Vulkan and OpenGL are available; Direct3D 12, ANGLE, screen-reader support and WinRT/OneCore are excluded |
| Web | Use Compatibility/WebGL 2; native OpenXR, ENet and GDExtension libraries are excluded. Choose thread support to match your export and hosting |
| Android | One ABI per recipe; enable only that ABI in your export preset. Swappy frame pacing is excluded |
| macOS | Use Compatibility/OpenGL; Metal, Vulkan, ANGLE and screen-reader support are excluded. Choose the matching architecture |

[Installation](install-templates.md) covers export settings, Web hosting,
Android Gradle templates and macOS distribution considerations.

For implementation details, use the developer [build reference](../developers/build-reference.md).

<span id="acceptance-tracking"></span>
Earlier template results are retained in [recorded test reports](../archive/template-test-reports.md).
