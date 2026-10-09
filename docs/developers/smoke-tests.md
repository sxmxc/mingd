---
title: "Template smoke tests"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/developers/smoke-tests.md
---

# Template smoke tests

Use this guide to check template changes with an exported game. Choose cases
relevant to the change and the environments available to you. This is a test
procedure, not a requirement to cover every supported combination.

For ordinary installation and export, use the [user installation guide](../users/install-templates.md).
Compilation, package validation, export and runtime launch check different things.

## Prepare builds

Use real compiled templates, not dry-run diagnostic archives, and the official
stable editor matching the exact release. Production workers follow the gateway's
dry-run setting; local direct workers use their own setting. Deployment and worker
startup are covered by [deployment](../operators/deployment.md) and
[local setup](getting-started.md).

Record enough to identify the result: build ID or artifact, recipe, exact
source/editor release, platform, architecture, kind and test environment.
A before/after size comparison should use matching recipe/toolchain conditions.

The fixture is [`tests/fixtures/smoke-project`](../../tests/fixtures/smoke-project).
It exercises 2D scene/type registration and GDScript startup, and needs 2D physics.
Use a feature-compatible project for recipes that remove that subsystem.

## Desktop installation and export

Install the TPZ and configure the target using [installation](../users/install-templates.md).
Import the fixture's `project.godot` and let resources import. Select the
Compatibility renderer for the fixture.

Export the requested kind. If testing a package with both kinds, debug and
release exports can be checked separately. Debugger connection and Windows
console-wrapper launch are useful checks when those paths changed. If resource
modification tools are unavailable on the Windows export host, disable
**Application → Modify Resources** for that test.

After saving your export preset, terminal export can use its actual name:

```bash
godot --headless --path tests/fixtures/smoke-project --export-release "Windows Desktop" /absolute/path/to/output/smoke.exe
godot --headless --path tests/fixtures/smoke-project --export-debug "Windows Desktop" /absolute/path/to/output/smoke-debug.exe
```

Replace `godot` with the matching editor executable, and use the Linux preset
name/output filename for Linux. Headless export does not test runtime launch.

Launch on the target OS. A passing fixture opens a 640×360 window displaying
**min.gd smoke test passed**, has no export/startup errors, and closes normally.
Retain the full export directory, including any `.pck` and Windows companions.

## Web

Use the [Web installation and hosting settings](../users/install-templates.md#web).
In a browser, check startup, the success message, console errors, relevant asset
loading and closure. Include threaded/single-threaded and debug cases when they
are relevant to the change. Threaded exports must be cross-origin isolated.

## Android

Match the build's ABI and kinds using [Android export settings](../users/install-templates.md#android).
On an available matching device or emulator, check installation, startup, logs,
touch/display behavior and closure. Check Gradle/source export if that path changed.
APK/AAR structural tests alone do not establish device behavior.

## macOS

Use the [macOS export settings](../users/install-templates.md#macos). Check available
matching Macs for startup, logs and closure. A universal binary can be checked
on both architectures when available. Signing/notarization belongs to the game's
distribution workflow rather than this fixture.

## Fixture limits and evidence

Empty sprite/audio nodes do not test decoding or playback. Use feature-specific
projects when investigating audio/video/SVG, networking, complex text, 3D or
other retained/removed systems. Report the cases exercised and any relevant
limitations without claiming coverage beyond them.

The owner reports successfully using the smoke project to export with the
templates. Earlier detailed reports remain in the
[template test archive](../archive/template-test-reports.md). These reports do
not impose new testing obligations.
