# min.gd template smoke fixture

The project in `smoke-project/` contains an ordinary 2D scene with `Node2D`,
`Sprite2D`, `Label`, `CharacterBody2D`, `CollisionShape2D`, `AudioStreamPlayer`,
and GDScript. It requires 2D physics.

Follow the maintained [template smoke-test procedure](../../docs/developers/smoke-tests.md)
with a matching Godot editor. Exercise requested release/debug kinds and launch
on the target OS/browser/device. A 640×360 view must display
`min.gd smoke test passed` without export or startup errors.

There is no audio stream or texture asset: empty nodes test scene/type registration,
not media decoding, networking, complex text shaping, or 3D behavior. Add compatible
feature-specific projects for those acceptance checks; do not infer them from this
fixture. Synthetic builder fixtures likewise do not establish runtime acceptance.
