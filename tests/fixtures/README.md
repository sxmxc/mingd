# GDSlimmer template smoke test

This fixture intentionally contains an ordinary 2D scene with `Node2D`, `Sprite2D`, `Label`, `CharacterBody2D`, `CollisionShape2D`, `AudioStreamPlayer`, and GDScript.

1. In Godot 4.7.2, open **Editor > Manage Export Templates**, install the downloaded GDSlimmer `.tpz`, and select it as the custom template package.
2. Import `tests/fixtures/smoke-project` and add a Linux/X11 export preset.
3. Export the project with the GDSlimmer template, then run the exported executable.
4. The test passes when a 640×360 window opens and displays `GDSlimmer smoke test passed` without an export or startup error.

The fixture has no audio stream or texture asset by design: the nodes exercise scene/type registration without adding unrelated media.
