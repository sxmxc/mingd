# Build profiles

Linux, Windows and Web profiles and editable custom recipes use dynamically discovered official
stable Godot 4 releases from 4.5 onward. The catalog refreshes hourly; only official
source archives with SHA-256 digests are selectable. See the root README for
discovery and outage behavior. Availability is separate from smoke-test acceptance.
Linux/Windows use x86_64; Web uses wasm32. Release, debug or both template kinds
are selectable with `optimize=size` and `lto=none`. Linux Standard release on
4.7.2 remains the default. Official source URLs/checksums are resolved centrally.

The owner confirmed the existing desktop preset smoke tests pass, and reported
a passing smoke test for a Godot 4.7.2 Windows x86_64 Offline 2D package containing
debug and release templates. See the acceptance record below for its scope.
Other debug/version/Web combinations require separate acceptance.
Structural packaging checks and SCons dry-runs are not runtime tests.

Android and macOS initially support verified 4.6.3 and 4.7.2 recipes. See
[recipe files and mobile templates](recipe-files-and-mobile-templates.md) for
architectures, platform limitations, setup and pending runtime acceptance.

## Expanded build matrix

Web runs in a separate worker/queue with Emscripten 4.0.11 pinned by image digest.
Choose single-threaded (default) or threaded, and match Thread Support in the
Godot export preset. Use Compatibility/WebGL 2. Threaded hosting needs
cross-origin isolation: `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. Web normalization removes native
OpenXR and UDP/ENet. GDExtensions are disabled (`dlink_enabled=no`). WebRTC and
WebSocket remain available unless removed by the recipe.

Web templates are nested ZIPs in the TPZ: `web_nothreads_release.zip` /
`web_nothreads_debug.zip` for single-threaded, `web_release.zip` /
`web_debug.zip` for threaded. The worker checks ZIP integrity, required HTML/JS
support files and WASM magic/version before packaging. Custom Template fields
take the nested ZIP, not the extracted WASM. Desktop debug entries use
`linux_debug.x86_64`, `windows_debug_x86_64.exe` and the matching console wrapper.
For both kinds, binary-size metadata sums main executable/WASM bytes across
kinds; Windows wrappers and archive overhead are excluded.

| Profile | Compiler | Package entries | Acceptance status |
| --- | --- | --- | --- |
| Linux Standard | GCC 12, Debian Bookworm, glibc 2.36 baseline | `linux_release.x86_64` | Build, download, Godot install, fixture export and launch confirmed by the project owner |
| Windows Standard | MinGW-w64 with POSIX threads, cross-compiled in the Linux builder | `windows_release_x86_64.exe`, `windows_release_x86_64_console.exe` | Desktop release smoke passed, owner confirmed |
| Linux Lean 2D | Same GCC toolchain | `linux_release.x86_64` | Desktop release smoke passed, owner confirmed |
| Windows Lean 2D | Same MinGW toolchain | GUI + console executable filenames above | Desktop release smoke passed, owner confirmed |
| Linux Offline 2D | Same GCC toolchain | `linux_release.x86_64` | Desktop release smoke passed, owner confirmed |
| Windows Offline 2D | Same MinGW toolchain | GUI + console executable filenames above | Desktop release smoke passed, owner confirmed |
| Linux Lean 3D | Same GCC toolchain | `linux_release.x86_64` | Desktop release smoke passed, owner confirmed |
| Windows Lean 3D | Same MinGW toolchain | GUI + console executable filenames above | Desktop release smoke passed, owner confirmed |

Lean 2D retains 2D physics/navigation, GUI, audio and networking. It removes the 3D engine, 3D physics/navigation, Jolt, OpenXR, glTF, CSG and GridMap. Projects depending on removed systems are incompatible.

Offline 2D starts from Lean 2D and removes scene multiplayer, ENet, WebSocket and WebRTC. It is **not networkless**: core HTTP/TCP functionality remains on desktop. Lean 3D retains the 3D engine, physics/navigation and glTF but removes OpenXR, CSG and GridMap.

Presets are starting points, not a separate build implementation. Editing features produces a Custom recipe unless it exactly matches another preset. Controls cover 3D, physics, navigation, multiplayer transports, advanced GUI, SVG, audio/video codecs, ZIP and the text server. Dependency normalization removes children when a parent is disabled: 3D removes 3D-only systems and glTF; multiplayer removes its transports; Ogg/Vorbis removes Theora. Restoring a parent does not silently restore children. Fallback text omits complex-script shaping and advanced text layout. TileMap remains locked on because this Godot release has no supported TileMap-only build flag. Arbitrary compiler flags, patches and modules remain prohibited.

Windows keeps Vulkan and OpenGL and the shared Standard engine modules. The existing worker policy disables D3D12, ANGLE, AccessKit and WinRT, because their additional SDK dependencies are not installed. This means no Direct3D 12 renderer, ANGLE fallback, AccessKit screen reader integration or WinRT/OneCore integration. Use Compatibility/OpenGL for the smoke fixture. These platform exceptions make this a conservative Standard profile rather than a byte-for-byte replica of the official template.

The builder validates the main Linux ELF binary. On Windows it requires both the GUI executable and console wrapper and validates MZ/PE signatures, AMD64 architecture, PE32+ format and the expected GUI/console subsystem before packaging. These structural checks do not establish that an exported project runs: follow [the smoke test](smoke-tests.md).

Every TPZ includes `version.txt` for the selected release (for example, `4.7.2.stable` or `4.5.0.stable`) and `README-mingd.txt`. The worker tests ZIP integrity before upload. Artifact metadata records the main executable size, package size and SHA-256, normalized configuration, source checksum and recipe version. Official-template comparisons require a measured reference artifact.

## Cache and recipe

Recipe version **8** adds version/debug/Web selection, Web thread normalization,
the pinned Emscripten toolchain and multi-kind size/packaging semantics. Hash
input includes recipe version, exact official source URL/checksum, normalized
features, target/architecture, template kinds and Web thread support. Equivalent
normalized recipes share artifacts; different versions/kinds/thread modes do
not. Previous artifacts remain downloadable but are not reused for new requests.

Changes affecting binary output, toolchains, generated flags or package semantics require a recipe bump. The current container uses the existing Bookworm/MinGW toolchain; its dependencies are not fully pinned, so cache recipe discipline is still required when rebuilding with changed toolchain versions.

## Acceptance tracking

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
It does not establish acceptance for other configurations or feature-specific
audio/video/SVG/network behavior.

Run the smoke procedure for each newly discovered version/platform/kind matrix and compare sizes against Standard builds using the same recipe/toolchain. Custom recipes need a project that does not reference removed classes or resource formats. Compilation, packaging and native runtime acceptance are separate checks.

Other architectures/optimizations and LTO remain rejected by submission and real-build guards.

## Template names

The archive is `mingd-4.7.2-<platform>-x86_64-release.tpz`. Its ZIP entries use Godot's expected names:

| Target | Release executable | Windows console companion |
| --- | --- | --- |
| Linux | `linux_release.x86_64` | None |
| Windows | `windows_release_x86_64.exe` | `windows_release_x86_64_console.exe` |

Debug names are `linux_debug.x86_64` and `windows_debug_x86_64.exe`, with `windows_debug_x86_64_console.exe`. Source output names are mapped centrally to installation names. Downloads explicitly request the stored TPZ basename. Install the TPZ through Manage Export Templates; desktop Custom Template fields instead take an extracted executable. Never rename a debug executable to release.

## Developer validation

For the focused compiler audit, run `node --import tsx scripts/audit-build-matrix.mjs`
inside the Web worker image with `GODOT_CACHE_DIR` pointing at a disposable cache
and the repository mounted read-only at `/app`. It downloads and verifies all discovered
official sources, then checks each target/kind/Web-thread mode using three
concurrent SCons dry-runs. It never compiles or publishes an artifact. Dummy
`SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `REDIS_URL` satisfy worker configuration;
no database or queue connection is made. Pure tests separately cover every preset.

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
