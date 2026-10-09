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

No additional feature is required merely to call this v1.0.0. The owner reports
having tested everything available to them, including exports using the smoke
project and generated templates, with good results.

Further platforms, automation and scaling can be considered in later releases.
The release decision belongs to the project owner, based on how the product
works and any known issues. This page is a scope note, not an exhaustive
certification checklist.
