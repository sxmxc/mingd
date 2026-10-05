# Build profiles

All profiles and editable custom recipes are available on Linux and Windows. They use official Godot 4.7.2 source, x86_64, `template_release`, `optimize=size`, and `lto=none`. Linux Standard remains the default.

| Profile | Compiler | Package entries | Acceptance status |
| --- | --- | --- | --- |
| Linux Standard | GCC 12, Debian Bookworm, glibc 2.36 baseline | `linux_release.x86_64` | Build, download, Godot install, fixture export and launch confirmed by the project owner |
| Windows Standard | MinGW-w64 with POSIX threads, cross-compiled in the Linux builder | `windows_release_x86_64.exe`, `windows_release_x86_64_console.exe` | Compilation confirmed by owner; native export/launch not separately recorded |
| Linux Lean 2D | Same GCC toolchain | `linux_release.x86_64` | Enabled; real compile/export/native launch pending |
| Windows Lean 2D | Same MinGW toolchain | GUI + console executable filenames above | Enabled; real compile/export/native launch pending |
| Linux Offline 2D | Same GCC toolchain | `linux_release.x86_64` | Enabled; real compile/export/native launch pending |
| Windows Offline 2D | Same MinGW toolchain | GUI + console executable filenames above | Enabled; real compile/export/native launch pending |
| Linux Lean 3D | Same GCC toolchain | `linux_release.x86_64` | Enabled; real compile/export/native launch pending |
| Windows Lean 3D | Same MinGW toolchain | GUI + console executable filenames above | Enabled; real compile/export/native launch pending |

Lean 2D retains 2D physics/navigation, GUI, audio and networking. It removes the 3D engine, 3D physics/navigation, Jolt, OpenXR, glTF, CSG and GridMap. Projects depending on removed systems are incompatible.

Offline 2D starts from Lean 2D and removes scene multiplayer, ENet, WebSocket and WebRTC. It is **not networkless**: core HTTP/TCP functionality remains. Lean 3D retains the 3D engine, physics/navigation and glTF but removes OpenXR, CSG and GridMap. Both additional profiles are enabled on both targets; native compile/export/launch acceptance remains pending.

Presets are starting points, not a separate build implementation. Editing features produces a Custom recipe unless it exactly matches another preset. Controls cover 3D, physics, navigation, multiplayer transports, advanced GUI, SVG, audio/video codecs, ZIP and the text server. Dependency normalization removes children when a parent is disabled: 3D removes 3D-only systems and glTF; multiplayer removes its transports; Ogg/Vorbis removes Theora. Restoring a parent does not silently restore children. Fallback text omits complex-script shaping and advanced text layout. TileMap remains locked on because this Godot release has no supported TileMap-only build flag. Arbitrary compiler flags, patches and modules remain prohibited.

Windows keeps Vulkan and OpenGL and the shared Standard engine modules. The existing worker policy disables D3D12, ANGLE, AccessKit and WinRT, because their additional SDK dependencies are not installed. This means no Direct3D 12 renderer, ANGLE fallback, AccessKit screen reader integration or WinRT/OneCore integration. Use Compatibility/OpenGL for the smoke fixture. These platform exceptions make this a conservative Standard profile rather than a byte-for-byte replica of the official template.

The builder validates the main Linux ELF binary. On Windows it requires both the GUI executable and console wrapper and validates MZ/PE signatures, AMD64 architecture, PE32+ format and the expected GUI/console subsystem before packaging. These structural checks do not establish that an exported project runs: follow [the smoke test](smoke-tests.md).

Every TPZ includes `version.txt` (`4.7.2.stable`) and `README-mingd.txt`. The worker tests ZIP integrity before upload. Artifact metadata records the main executable size, package size and SHA-256, normalized configuration, source checksum and recipe version. Official-template comparisons require a measured reference artifact.

## Cache and recipe

Recipe version **7** introduces the `mingd` archive/README names and min.gd brand. It retains recipe-6 build semantics: editable features, glTF/Theora dependencies, explicit physics-module flags, removal of the nonexistent TileMap-module flag, explicit ccache launchers and release-specific archive filenames. Hash input includes recipe version, official source URL and SHA-256, and normalized configuration. Equivalent normalized recipes share artifacts regardless of the selected starting preset. Different targets/features never share a key; dry-run diagnostics use a separate namespace. Previous recipe artifacts are not reused; existing downloads remain accessible.

Changes affecting binary output, toolchains, generated flags or package semantics require a recipe bump. The current container uses the existing Bookworm/MinGW toolchain; its dependencies are not fully pinned, so cache recipe discipline is still required when rebuilding with changed toolchain versions.

## Acceptance tracking

Run the smoke procedure for all eight platform/preset combinations, record actual sizes, and compare against recipe-7 Standard builds. Custom recipes need a project that does not reference removed classes or resource formats. Compilation, packaging and native runtime acceptance are separate checks.

Debug templates, other architectures/optimizations and LTO remain rejected by submission and real-build guards. Filename helpers nevertheless distinguish release/debug correctly; no debug binary is mislabeled as release.

## Template names

The archive is `mingd-4.7.2-<platform>-x86_64-release.tpz`. Its ZIP entries use Godot's expected names:

| Target | Release executable | Windows console companion |
| --- | --- | --- |
| Linux | `linux_release.x86_64` | None |
| Windows | `windows_release_x86_64.exe` | `windows_release_x86_64_console.exe` |

Debug names would be `linux_debug.x86_64` and `windows_debug_x86_64.exe`, with `windows_debug_x86_64_console.exe`, but debug builds are not offered yet. Source output names (`godot.*.template_release.*`) are mapped centrally to installation names. Downloads explicitly request the stored TPZ basename. Install the TPZ through Manage Export Templates; Custom Template > Release instead takes an extracted executable. Never just rename a debug executable to release.

## Developer validation

Run `npm run typecheck` and `npm test` from the repository root. Builder packaging tests require `zip` and `unzip`, both already present in the worker image. When the host lacks them, run the test suite in a temporary builder container with the repository mounted read-only (replace the absolute path with your checkout):

```bash
docker compose --profile builder run --rm --no-deps -v /absolute/path/to/mingd:/app:ro --entrypoint npm builder test
```

These tests exercise profile guards, cache separation, generated arguments, invalid Windows headers, missing wrappers, archive filenames, version metadata and preservation of compiled bytes. They use synthetic binary fixtures; native acceptance still requires the smoke test.

## Exact-version references

- [Godot 4.7.2 Windows toolchain and SDK options](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/detect.py)
- [Windows GUI and console wrapper compilation](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/SCsub)
- [SCons options and console filename construction](https://github.com/godotengine/godot/blob/4.7.2-stable/SConstruct)
- [Jolt physics module configuration](https://github.com/godotengine/godot/blob/4.7.2-stable/modules/jolt_physics/config.py)
- [Navigation 3D module configuration](https://github.com/godotengine/godot/blob/4.7.2-stable/modules/navigation_3d/config.py)
- [OpenXR module configuration](https://github.com/godotengine/godot/blob/4.7.2-stable/modules/openxr/config.py)
- [Godot's Windows template filename mapping](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/export/export_plugin.cpp)
- [Custom release templates and console wrapper lookup](https://github.com/godotengine/godot/blob/4.7.2-stable/editor/export/editor_export_platform_pc.cpp)
