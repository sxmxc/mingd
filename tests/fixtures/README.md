# min.gd template smoke test

This fixture intentionally contains an ordinary 2D scene with `Node2D`, `Sprite2D`, `Label`, `CharacterBody2D`, `CollisionShape2D`, `AudioStreamPlayer`, and GDScript.

Follow the maintained [Linux and Windows smoke-test procedure](../../docs/smoke-tests.md). Export in release mode and launch on the target operating system. A 640×360 window must display `min.gd smoke test passed` without export or startup errors.

The fixture has no audio stream or texture asset by design: the nodes exercise scene/type registration without adding unrelated media.
