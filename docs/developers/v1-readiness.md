---
title: "v1.0.0 product scope"
editUrl: https://github.com/sxmxc/mingd/edit/main/docs/developers/v1-readiness.md
---

# v1.0.0 product scope

v1.0.0 is the existing product's first stable release: configure a custom Godot
export template, build it, download it and use it in a game.

The implemented supporting features include accounts, private build history,
live compiler output, cached artifact reuse, saved/shared recipes, portable
`.gdbuild` files, measured size comparisons, administration, maintenance and
HTTPS workers. These are described in the [user guides](../README.md#using-mingd)
and [operator guides](../README.md#operating-an-instance).

The platform version identifies a release of the application as a whole;
service packages and container images retain independent versions. Prepare
component bumps first, then use the [platform release command](../operators/deployment.md#platform-releases)
to capture the package/image set. This snapshot does not certify deployment or
native template acceptance; validate the targets being shipped using
[smoke tests](smoke-tests.md).

Further platforms, automation and scaling can be considered in later releases.
The release decision belongs to the project owner, based on how the product
works and any known issues. This page is a scope note, not an exhaustive
certification checklist.
