---
title: "Save and share recipes"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/users/recipes-and-comparisons.md
---

# Save and share recipes

A recipe saves your build settings so you can reuse them. It includes the Godot
release, target, architecture, template kinds, Web thread mode and engine
features. A recipe is configuration; loading one does not start a build.

## Saved recipes

1. Configure a template in **Builds → New build**.
2. Open **Save, import, or export a recipe**.
3. Enter a **Recipe name**, then choose **Save recipe**.

Open **Builds → Saved recipes** to find it. The library shows the 100 most
recently updated recipes.

| Action | Result |
| --- | --- |
| Edit / build | Opens the configuration form; submit a build when ready |
| Save changes | Updates the recipe you are editing, including its name |
| Save as new recipe | Saves an independent copy from the editor |
| Duplicate | Creates a private copy in the library |
| Delete | Removes the saved recipe and invalidates its share link |

Building from a recipe does not overwrite its saved settings. To reuse a
previous build's settings, open its **Recipe** tab and choose
**Edit / save this recipe**.

If the saved Godot release is unavailable in the verified catalog, min.gd does
not substitute a different patch release. The page explains the unavailable
version. For configurations that the form can load, choose another release
explicitly if you want to change it.

## Share links and privacy

Recipes are private by default. In Saved recipes, choose **Create share link**
and copy the resulting link. Anyone with that link can view the saved recipe's
name and configuration, without signing in. The link follows your saved edits.

A share link does not provide your identity, private build history or artifact
downloads. There is no public recipe directory. **Stop sharing** revokes the
link; deleting the recipe does too. Links from a disabled owner's account are
unavailable while the account is disabled.

On a shared page, choose **Use this recipe →**. Sign in to customize it, build it,
or save your own private copy. Your copy is independent of the owner's recipe.
You can also download its `.gdbuild` file.

## Compatibility guidance

Review the feature consequences and platform restrictions before building a
recipe shared by someone else. The recipe may remove systems your game needs.
Guidance is based on its settings and does not inspect your project.

## Measured comparisons

After a build, the result and **Artifact** tab show a comparison with matching
official templates when measurements are available. See
[template sizes](template-sizes.md) for what those numbers mean.

For offline files and version control, use [portable recipes](recipe-files-and-mobile-templates.md).
