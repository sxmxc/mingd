# Build profiles

Use a matching official stable Godot editor to install and export with these
custom templates. Structural validation and source audits establish packaging/
compiler inputs, not runtime acceptance. See [smoke tests](smoke-tests.md).

## Supported matrix

| Platform | Architectures | Releases | Toolchain |
| --- | --- | --- | --- |
| Linux | x86_64 | Discovered stable Godot 4, 4.5 onward | Debian Bookworm, GCC 12, glibc 2.36 baseline |
| Windows | x86_64 | Same discovery policy | MinGW-w64 POSIX threads in Linux worker |
| Web | wasm32 | Same discovery policy | Emscripten 4.0.11, digest-pinned SDK image |
| Android | arm64, arm32, x86_64, x86_32 | Exact 4.6.3 / 4.7.2 | NDK 29.0.14206865, SDK 36, build tools 36.1.0, Java 17 |
| macOS | arm64, x86_64, universal | Exact 4.6.3 / 4.7.2 | Operator-supplied OSXCross, SDK 27.0, verified archive digest |

Each target offers release, debug, or both kinds. Real builds require size
optimization and LTO disabled. Linux Standard release 4.7.2 is the default.
Release discovery requires official source integrity metadata, caches success
hourly, and has a verified fallback on outage; see
[architecture](architecture.md#release-discovery). Newly discovered releases are
selectable under policy but need their own runtime smoke evidence.

## Presets and custom features

| Preset | Keeps / removes |
| --- | --- |
| Standard | Shared default engine modules, subject to fixed platform restrictions |
| Lean 2D | Keeps 2D physics/navigation, GUI, audio, networking; removes 3D and 3D-only systems |
| Offline 2D | Lean 2D plus removal of scene multiplayer, ENet, WebSocket, and WebRTC |
| Lean 3D | Keeps 3D rendering/physics/navigation and glTF; removes OpenXR, CSG, GridMap |

Offline 2D is not networkless: core HTTP/TCP functionality remains on desktop.
Presets are editable starting points. A changed configuration is Custom unless
it matches a normalized preset. Features cover 3D, physics/navigation, multiplayer
transports, advanced GUI, SVG, codecs, ZIP, and text server.

Normalization removes dependent children when a parent is disabled: 3D removes
3D-only systems/glTF; multiplayer removes its transports; removing Ogg/Vorbis
removes Theora. Restoring a parent does not silently restore children. Fallback
text omits complex-script shaping/advanced layout. TileMap stays enabled because
supported sources have no supported TileMap-only build flag.

[Compatibility guidance](recipes-and-comparisons.md#compatibility-guidance) does
not scan a game. Projects using removed classes/formats need different settings.
Arbitrary flags, modules, patches, and source repositories are prohibited.

## Fixed platform restrictions

**Linux:** x86_64 binaries use the Bookworm glibc 2.36 baseline or newer.
Validate on the intended Linux distribution rather than assuming older systems
can run them.

**Windows:** Vulkan/OpenGL remain available; D3D12, ANGLE, AccessKit, and WinRT are
disabled because their SDK dependencies are not installed. Standard therefore
is not a byte-for-byte official template. The worker requires valid GUI and
console AMD64 PE32+ executables with matching subsystems.

**Web:** Compatibility/WebGL 2, single-threaded by default, optional threads.
Native OpenXR and UDP/ENet are normalized away. GDExtensions are disabled.
WebRTC/WebSocket remain unless removed. Threaded game hosting needs COOP/COEP
and browser cross-origin isolation; see [Web acceptance](smoke-tests.md#web).

**Android:** One ABI per recipe; match enabled export ABIs. Swappy is disabled.
Native engine bytes and APK/AAR consistency are validated. Gradle runs with
bounded parallelism/heap and timeout.

**macOS:** Compatibility/OpenGL only; Metal, Vulkan, ANGLE, and AccessKit are
disabled. Universal builds combine Apple Silicon/Intel binaries with `lipo`.
Provision the [SDK/toolchain](recipe-files-and-mobile-templates.md#macos-on-linux)
and use your own signing/notarization workflow for distribution.

## Packages and filenames

Every real TPZ includes the selected release identifier in `version.txt` and
`README-mingd.txt`. Examples are `4.7.2.stable` and `4.5.stable`; base releases
must not acquire an invented `.0` patch component.

| Target | Installed template entries |
| --- | --- |
| Linux | `linux_release.x86_64`, `linux_debug.x86_64` |
| Windows | `windows_release_x86_64.exe`, `windows_debug_x86_64.exe`, and corresponding `_console.exe` companions |
| Web, single-threaded | `web_nothreads_release.zip`, `web_nothreads_debug.zip` |
| Web, threaded | `web_release.zip`, `web_debug.zip` |
| Android | `android_release.apk`, `android_debug.apk`, `android_source.zip` with matching AARs |
| macOS | `macos.zip` containing the matching app skeleton and selected-kind binaries |

Only requested kinds are included. The worker checks archive integrity and
ELF/PE/WASM/Mach-O structure as applicable. Install the TPZ through Manage Export
Templates; Custom Template fields take the platform executable/nested ZIP as
appropriate, not the outer TPZ. Keep Windows companions alongside their binaries.

Artifact metadata records package/main-binary sizes, SHA-256, normalized recipe,
source integrity, and recipe version. Main-binary size sums requested kinds,
excluding wrapper/support overhead. Downloads use the recorded TPZ basename.

## Cache and recipe

Current global recipe **9** includes exact source URL/checksum and normalized
version/platform/architecture/kinds/features/Web threads. Android adds pinned
platform recipe 1; macOS adds platform recipe 1 and its archive digest.
Equivalent inputs share artifacts; changes to these identities produce different
keys. Older recipe artifacts remain downloadable but are not reused by new keys.
See [cache architecture](architecture.md#cache-identity).

Changed compiler flags, toolchains, or packaging semantics require identity
review and a bump when output equivalence changes. Desktop image packages are
not fully pinned. Rebuild/deploy web and workers compatibly.

## Acceptance tracking

The owner confirms previous Linux/Windows desktop release smokes for Standard,
Lean 2D, Offline 2D, and Lean 3D. That broad report does not include every exact
version/hash or certify the expanded matrix. Android/macOS, Web modes, custom
recipes, new versions, and other debug combinations need separate acceptance.

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

Stage accounting changes from compiling to linking at the observed main link
marker; these recorded intervals do not double-count time. Parallel compiler
activity may still occur during the linking interval. This historical result
does not establish acceptance of a newly deployed recipe/toolchain.

## Developer checks and source references

Follow [development validation](development.md) for pure/fixture tests and opt-in
exact-source compiler audits. Real export/launch remains a separate gate.

Exact-version source references for the documented policy:

- [Godot 4.7.2 SConstruct](https://github.com/godotengine/godot/blob/4.7.2-stable/SConstruct)
- [Windows SDK/toolchain options](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/detect.py)
- [Windows GUI/console compilation](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/SCsub)
- [Godot Windows template mapping](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/export/export_plugin.cpp)

Verify the exact supported release source before changing flags or toolchains;
these links are not authority for an arbitrary newer release.
