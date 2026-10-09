---
title: "Build your first template"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/users/first-template.md
---

# Build your first template

min.gd builds custom Godot export templates: the engine binaries Godot uses when
you export a game. You choose which engine features to retain, then download a
`.tpz` package for your export target. Your project stays on your machine;
min.gd does not inspect it or decide which features it needs.

You need an account on the min.gd instance you are using and a Godot project.
You do not need to install a compiler or run the min.gd server yourself.

## 1. Sign in

Choose **Sign in**, or **Create account** if you are new. If asked to confirm
your email, follow the email link before signing in. See [your account](account.md)
for confirmation and password recovery.

## 2. Configure a template

Open **Builds → New build**.

1. Select the **exact Godot version** of your editor. A template built for one
   patch release should not be used with a different editor release.
2. Choose your export platform, and an architecture where the form offers one.
3. Choose **Release** for shipping exports, **Debug** for debugging exports, or
   **Release + debug** if you need both.
4. Choose a starting preset. **Standard** keeps the default features;
   **Lean 2D**, **Offline 2D** and **Lean 3D** remove selected systems.
5. Review **Engine features** and **Compatibility**. Keep features your game uses.

[Platforms and features](build-profiles.md) explains these choices and the
platform restrictions. Presets are editable starting points, not project scanners.
If you are unsure whether you use a feature, keep it for your first build.

## 3. Build and download

Choose **Build template →**. The build page shows its status and compiler output.
Compilation can take time; there is no fixed completion estimate. You can return
through **Builds → All builds**.

When the result says **Your template is ready**, choose **Download template .tpz**.
An equivalent existing template may be reused instead of compiling again.
Your build history remains private to your account, with administrator access
for operating the service.

If a build fails, the result shows the reason and a retry action. See
[build history and results](workbench.md) and [help](user-help.md).

## 4. Export your game

Follow [install and use templates](install-templates.md) to install the package
in the matching Godot editor, choose an export preset, and export your project.
Run the exported game to check that its features work with your chosen template.

Once the configuration suits your game, [save a recipe](recipes-and-comparisons.md)
or [export a .gdbuild file](recipe-files-and-mobile-templates.md) to reuse it.
