# Build profiles

Both selectable profiles use official Godot 4.7.2 source, x86_64, `template_release`, Standard features, `optimize=size`, and `lto=none`. Linux remains the default.

| Profile | Compiler | Package entries | Acceptance status |
| --- | --- | --- | --- |
| Linux Standard | GCC 12, Debian Bookworm, glibc 2.36 baseline | `linux_release.x86_64` | Build, download, Godot install, fixture export and launch confirmed by the project owner |
| Windows Standard | MinGW-w64 with POSIX threads, cross-compiled in the Linux builder | `windows_release_x86_64.exe`, `windows_release_x86_64_console.exe` | Enabled for validation; Windows export and launch pending |

Windows keeps Vulkan and OpenGL and the shared Standard engine modules. The existing worker policy disables D3D12, ANGLE, AccessKit and WinRT, because their additional SDK dependencies are not installed. This means no Direct3D 12 renderer, ANGLE fallback, AccessKit screen reader integration or WinRT/OneCore integration. Use Compatibility/OpenGL for the smoke fixture. These platform exceptions make this a conservative Standard profile rather than a byte-for-byte replica of the official template.

The builder validates the main Linux ELF binary. On Windows it requires both the GUI executable and console wrapper and validates MZ/PE signatures, AMD64 architecture, PE32+ format and the expected GUI/console subsystem before packaging. These structural checks do not establish that an exported project runs: follow [the smoke test](smoke-tests.md).

Every TPZ includes `version.txt` (`4.7.2.stable`) and `README-gdslimmer.txt`. The worker tests ZIP integrity before upload. Artifact metadata records the main executable size, package size and SHA-256, normalized configuration, source checksum and recipe version. Official-template comparisons require a measured reference artifact.

## Cache and recipe

Recipe version **4** covers the Windows GUI/console packaging contract and explicit GUI subsystem policy. Hash input includes recipe version, official source URL and SHA-256, and normalized configuration (including platform, architecture, template kind, features, optimization and LTO). Linux and Windows never share a cache key; dry-run diagnostics use a separate namespace. The recipe bump also causes Linux builds to use new cache identities.

Changes affecting binary output, toolchains, generated flags or package semantics require a recipe bump. The current container uses the existing Bookworm/MinGW toolchain; its dependencies are not fully pinned, so cache recipe discipline is still required when rebuilding with changed toolchain versions.

## Milestone order

1. Linux Standard: accepted based on the owner's completed smoke test.
2. Windows Standard: current validation target.
3. Linux Lean 2D: gated on Windows Standard acceptance.
4. Windows Lean 2D: gated on Linux Lean 2D acceptance.

Debug templates, extra size optimization, LTO and feature stripping are rejected by the real-build guard. The broader schema remains for future profile work.

## Developer validation

Run `npm run typecheck` and `npm test` from the repository root. Builder packaging tests require `zip` and `unzip`, both already present in the worker image. When the host lacks them, run the test suite in a temporary builder container with the repository mounted read-only (replace the absolute path with your checkout):

```bash
docker compose --profile builder run --rm --no-deps -v /absolute/path/to/gdslimmer:/app:ro --entrypoint npm builder test
```

These tests exercise profile guards, cache separation, generated arguments, invalid Windows headers, missing wrappers, archive filenames, version metadata and preservation of compiled bytes. They use synthetic binary fixtures; native acceptance still requires the smoke test.

## Exact-version references

- [Godot 4.7.2 Windows toolchain and SDK options](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/detect.py)
- [Windows GUI and console wrapper compilation](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/SCsub)
- [SCons options and console filename construction](https://github.com/godotengine/godot/blob/4.7.2-stable/SConstruct)
- [Godot's Windows template filename mapping](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/export/export_plugin.cpp)
- [Custom release templates and console wrapper lookup](https://github.com/godotengine/godot/blob/4.7.2-stable/editor/export/editor_export_platform_pc.cpp)
