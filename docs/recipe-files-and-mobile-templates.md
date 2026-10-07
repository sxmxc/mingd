# Recipe files, Android and macOS templates

## Portable recipes

Export `.gdbuild` from the build form, saved recipes or a shared recipe. Import
one in the build form to load an editable copy. Importing neither queues a build
nor overwrites a saved recipe. Save explicitly to create a private recipe.

The file is UTF-8 JSON with `format: "gdbuild"`, `version: 1`, a recipe `name`,
and a validated `config`. It contains semantic settings only: no account IDs,
share tokens, credentials, source URLs, compiler commands or filesystem paths.
Files are limited to 64 KiB. Unknown keys, unsupported format versions and build
settings are rejected. The exact Godot version must appear in the verified
release catalog; import never substitutes another patch version. These files
can be committed beside `project.godot`; they are min.gd recipes, not a Godot
engine file format or executable build script.

## Android

Android supports exact Godot 4.6.3 and 4.7.2 releases. Choose ARM64,
ARMv7, x86_64 or x86 and release, debug or both. Each recipe builds one ABI; enable
only that ABI in the Godot Android export preset. Templates contain the selected
kinds and include `android_source.zip` with matching AARs for Gradle exports.

The worker pins NDK 29.0.14206865, Android SDK 36, build tools 36.1.0 and Java 17,
matching the checked Godot sources. It compiles native libraries with SCons,
then runs the source-owned `generateGodotTemplates` Gradle task with a timeout
and bounded parallelism/heap. It validates APK ZIP integrity, required entries,
ELF architecture and matching native libraries in APK/AAR before upload. Binary
size counts the engine `.so`, excluding the APK container and C++ runtime.
Swappy frame pacing is disabled; test frame timing on actual Android devices.

Apply all pending migrations and deploy compatible frontend/workers using
[deployment](deployment.md). To rebuild/start just the Android worker:

```bash
npm run compose:android-builder:build
```

The `builder` profile includes desktop, Web and Android workers. Android
has its own queue, source, compiler cache, Gradle cache and job workspace volumes.
Allow several additional GB of disk for the SDK image and ample compile space.

## macOS on Linux

The application supports Apple Silicon, Intel and universal macOS recipes for
exact Godot 4.6.3 and 4.7.2.
Universal recipes compile two architectures and combine them with `lipo`.
Output is `macos.zip` nested in the TPZ with the matching Godot app skeleton and
per-kind binaries. Mach-O headers and architectures are checked, and executable
permissions are preserved. Use the Compatibility/OpenGL renderer; Metal,
Vulkan, ANGLE and AccessKit are disabled in this initial recipe. Sign and
notarize your exported game using your own distribution workflow.

The operator-provisioning example uses `/data/mingd-toolchains/Xcode_27.xip`
and macOS SDK **27.0**. These files are not supplied by the repository; adapt
the workspace paths to your host. The worker uses OSXCross `darwin27`
wrappers for ARM64 and x86_64, plus `lipo`. The repository does not download
Apple SDKs from third parties. Saving, sharing and importing/exporting macOS
recipes works before the worker is provisioned; builds require its verified
archive identity.

Keep the installer and extraction workspace on `/data/mingd-toolchains`, away
from Docker's volume directories. The upstream [OSXCross SDK instructions](https://github.com/tpoechtrager/osxcross/blob/master/README.SDK.md)
describe Linux extraction. The documented preparation uses OSXCross commit
`27d21e4977c9751d01199c7a226a6faf494c3dd9`, which supports SDK 27.0 and
patches its libc++ math headers. SDK 27.0 recommends Clang 20 or newer; the
documented preparation uses Clang 21.1.8 from the [official LLVM packages](https://apt.llvm.org/). Build with
`UNATTENDED=1 BUILD_FLAVOR=latest SDK_VERSION=27.0 ENABLE_ARCHS="arm64 x86_64"`.
TAPI 1600 does not recognize SDK 27's `arm64e.x1` targets. After SDK installation,
run the filter against the **extracted SDK copy**:

```bash
scripts/filter-macos-sdk-targets.py /data/mingd-toolchains/osxcross/target/SDK/MacOSX27.0.sdk
```

It removes only X1 target declarations and verifies that every
other target's declarations stay identical. Do not run it against the original
installer or claim ARM64e/X1 support. The SDK preparation is included in the
archive identity. Verify both architecture compiler/linker tests before packaging.

Package the toolchain runtime with `target/` and the complete Clang 21
installation as `compiler/` at the archive root as
`toolchains/macos-toolchain.tar.xz`. That directory is git-ignored; `.xip` files
are excluded from the Docker context. The toolchain must run in the Debian
Bookworm worker and survive relocation to `/opt/osxcross`.

Calculate its SHA-256 and set `MACOS_TOOLCHAIN_SHA256` in root `.env` to the
64-character lowercase digest. Both web and worker must use that same value.
The Docker build verifies the archive before installing it. The worker checks
the installed identity, required SDK/wrappers, and both linkers before compiling. Changing the
archive digest changes the artifact cache identity.

```bash
sha256sum toolchains/macos-toolchain.tar.xz
npm run compose:macos-builder:build
npm run compose:web:build
```

The macOS worker has a separate optional `macos-builder` Compose profile. It is
excluded from the normal `builder` profile, so operators can provision it separately.
It has its own queue and cache/workspace volumes. Do not enable macOS by setting
a made-up digest: provision and verify the complete toolchain first.

## Cache and comparisons

Current global recipe **9** changes cache identity for every platform compared
with older recipes. Android also includes toolchain recipe 1; macOS includes
cross-toolchain recipe 2 and its operator-supplied archive SHA-256. Recipe 2 passes
`LD_LIBRARY_PATH` into SCons subprocesses so relocated linkers can load the bundled
BlocksRuntime, libdispatch and TAPI libraries. Older artifacts
remain downloadable but are not reused by new identities. Architecture and
selected kinds remain part of normalized configuration. Bump the relevant platform identity whenever
its toolchain or compilation/packaging semantics change. See
[cache architecture](architecture.md#cache-identity).

The official reference importer supports all five platforms. For Android it
measures the engine's ELF shared library inside each debug/release APK for every
supported ABI. For macOS it validates the universal Mach-O executables and records
both their full lengths and their ARM64/x86_64 slice lengths. Comparisons require
exact release, architecture and template-kind matches, using engine binary bytes
rather than APK/app wrapper sizes. Maintenance backfills older desktop-only
reference inventories. Coverage follows the build policy: Android/macOS rows are
required for Godot 4.6.3 and 4.7.2; other supported releases retain desktop/Web
coverage. The archive is verified against its official SHA-256 before measuring.

## Validation and acceptance

Pure tests cover portable file validation, architecture combinations, cache
identity and SCons generation. Fixture tests cover Android APK/AAR consistency,
Mach-O architecture and archive permissions. These checks do not establish
that a compiled/exported game runs. Android needs real debug/release device
smokes for each offered ABI; macOS needs both architecture smokes and a universal
export smoke after SDK provisioning. Leave runtime acceptance unconfirmed until
those checks are actually performed. Follow [platform smoke tests](smoke-tests.md)
and [development validation](development.md) for the separate gates.
