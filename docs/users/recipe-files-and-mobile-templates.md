---
title: "Portable .gdbuild recipes"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/users/recipe-files-and-mobile-templates.md
---

# Portable .gdbuild recipes

Use a `.gdbuild` file to keep build settings with your project or send them to
someone else. It is a min.gd recipe file, not a Godot project file or an
executable build script.

## Portable recipes

In the build form, open **Save, import, or export a recipe** and choose
**Export .gdbuild**. Downloads are also available from saved and shared recipes
and a build's Recipe tab.

To load a file, choose **Import .gdbuild** in the build form. Importing loads an
editable configuration; it does not submit a build or overwrite a saved recipe.
Choose **Save recipe** to save it to your account, or **Build template →** when
ready to build it.

Files are limited to 64 KiB. Unknown fields, unsupported format versions and
unsupported build settings are rejected. The selected exact Godot release must
be in the verified catalog; importing never substitutes another patch release.

## What the file contains

The UTF-8 JSON file contains `format: "gdbuild"`, `version: 1`, a recipe `name`
and a validated `config`. It stores semantic settings, without account IDs,
share tokens, credentials, source URLs, compiler commands or filesystem paths.
You can commit it alongside `project.godot`.

Editing JSON manually still has to pass the same validation as the form. To
change features, the form provides explanations and dependency handling.

## Android

Android recipe choices and export instructions are in
[platforms](build-profiles.md) and [installation](install-templates.md#android).
The file carries the selected ABI and kinds just like any other recipe.

## macOS on Linux

Users can save or exchange macOS recipes even when their instance cannot build
them yet. Operators providing macOS compilation on Linux should use the
[worker toolchain guide](../operators/worker-toolchains.md#macos-on-linux).
