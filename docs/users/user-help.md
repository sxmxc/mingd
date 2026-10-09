---
title: "Help with builds and exports"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/users/user-help.md
---

# Help with builds and exports

Start with the message on the affected page and your build's recipe. You do not
need access to server configuration to use these steps. If a problem needs the
instance operator, send the build ID and relevant error text. Review copied
diagnostics before sharing them; never share passwords or email-token links.

## A build is queued or quiet

Queued means waiting for a worker. A busy or unavailable worker can leave a
request waiting. You can leave the page and return through All builds.

During a build, linking can produce little output. A recent heartbeat shows
worker contact, not a completion estimate. If the monitor reports a connection
problem, check your connection and sign in again if requested. For a persistent
queue or overdue heartbeat, ask your instance operator to inspect the worker.
Submitting more copies is unlikely to resolve worker availability.

## A build failed

Read the result's reason and retained output. Use **Review recipe** to change
settings or **Retry this recipe** to submit a new build. If the same error
repeats, use **Copy diagnostics** and contact the operator. A source checksum,
recipe-hash or toolchain error needs operator investigation rather than changing
your game to work around it.

## Download or template installation fails

Return to the signed-in build page and request the download again. Download
links expire; starting another download obtains a fresh authorized link.

Check that the package is a real `.tpz` template, not a dry-run diagnostic.
Use the exact Godot editor release recorded in the recipe. For custom-template
fields, select the extracted platform file, not the outer TPZ. See
[installation](install-templates.md) for filenames and target settings.

## Godot reports a missing template

Check **Export With Debug** against the kinds you built. A release-only package
cannot supply a debug export. Check the selected platform and architecture,
and the custom-template path if you are using one.

## The exported game is missing features or does not run

Review your recipe's removed features against what the game uses. Keep the
needed systems enabled and build again. Presets and Compatibility guidance do
not scan the project. Check the [platform restrictions](build-profiles.md#fixed-platform-restrictions),
particularly Linux's runtime baseline, Web threading/hosting, Android ABI and
macOS renderer/architecture.

Use a more complete preset such as Standard to help isolate whether a removed
feature is involved. Keep in mind that fixed platform restrictions still apply.

## A recipe file or share link does not work

A `.gdbuild` import must use a supported file format and build configuration.
The form reports invalid fields or an unavailable exact release. See
[portable recipes](recipe-files-and-mobile-templates.md).

A share link can stop working when its owner revokes it, deletes the recipe,
or has their account disabled. Ask the owner for a current recipe. Changes to
a saved shared recipe also change what its link displays.

## Account emails do not work

Check your spam folder and the address entered. Request a fresh confirmation
or reset email if the previous link has expired or was used. If mail never
arrives or the link opens the wrong site, contact the instance administrator.

Operators can use the separate [service troubleshooting guide](../operators/troubleshooting.md).
