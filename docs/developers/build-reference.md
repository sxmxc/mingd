---
title: "Compiler and package reference"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/developers/build-reference.md
---

# Compiler and package reference

Use this guide when changing compiler or packaging behavior. User-facing
choices and restrictions live in [platforms and features](../users/build-profiles.md);
installation instructions live in [install templates](../users/install-templates.md).

## Toolchains

| Target | Current recipe/toolchain |
| --- | --- |
| Linux | Debian Bookworm, GCC 12, glibc 2.36 baseline; release LTO enabled by default |
| Windows | MinGW-w64 POSIX threads in the Linux worker; release LTO enabled by default |
| Web | Emscripten 6.0.11 in the digest-pinned SDK image |
| Android | NDK 29.0.14206865, SDK 36, build tools 36.1.0, Java 17; platform recipe 1 |
| macOS | Operator-provided OSXCross/SDK 27.0 archive; platform recipe 2 and archive digest |

The global build recipe is **11**, defined in
[`recipe.ts`](../../packages/build-config/src/recipe.ts). Source URL/checksum,
normalized settings and relevant platform identities determine cache identity.
See [architecture](architecture.md#cache-identity). Bump identity when compiler,
toolchain or packaging changes affect output equivalence.

Desktop system packages are not fully pinned. Inspect the actual image when
assessing rebuild equivalence. [Worker toolchains](../operators/worker-toolchains.md)
covers Android provisioning and macOS archive preparation.

## Package validation

Real TPZs include the exact release identifier in `version.txt` and
`README-mingd.txt`. Base releases such as `4.5.stable` must not acquire an
invented `.0` patch. Only requested kinds are included.

Workers validate ZIP integrity and ELF/PE/WASM/Mach-O structures as applicable.
Windows GUI and console AMD64 PE32+ files must have matching subsystems.
Android APK/AAR engine libraries must agree. macOS universal builds combine
both architecture outputs; archive permissions are preserved.

Filename mapping is maintained by the shared build contract and listed in the
[user installation guide](../users/install-templates.md#use-custom-templates-for-one-project).
Avoid maintaining a second filename table here.

## Developer checks and source references

Follow [development validation](development.md) for pure/fixture tests and opt-in
exact-source audits, and [smoke tests](smoke-tests.md) for exported-game checks.
Verify flags against the exact release being changed; references for one release
are not authority for a newer one.

- [Godot 4.7.2 SConstruct](https://github.com/godotengine/godot/blob/4.7.2-stable/SConstruct)
- [Windows SDK/toolchain options](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/detect.py)
- [Windows GUI/console compilation](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/SCsub)
- [Godot Windows template mapping](https://github.com/godotengine/godot/blob/4.7.2-stable/platform/windows/export/export_plugin.cpp)
