import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG, PRESETS, SavedRecipeInputSchema, compareTemplateSize, compatibilityGuidance, type TemplateReference } from "../src/index.ts";

function reference(kind: "release" | "debug", overrides: Partial<TemplateReference> = {}): TemplateReference {
  return { godot_version: DEFAULT_BUILD_CONFIG.godotVersion, platform: "linux", architecture: "x86_64", template_kind: kind, web_threads: false, binary_size_bytes: 1000, archive_sha256: "a".repeat(64), source_url: `https://github.com/godotengine/godot-builds/releases/download/${DEFAULT_BUILD_CONFIG.godotVersion}-stable/Godot_v${DEFAULT_BUILD_CONFIG.godotVersion}-stable_export_templates.tpz`, measured_at: "2026-10-06T00:00:00Z", ...overrides };
}
test("saved recipes normalize validated build configurations and reject compiler inputs", () => {
  const input = SavedRecipeInputSchema.parse({ name: "  My game  ", config: { ...DEFAULT_BUILD_CONFIG, features: { ...PRESETS.standard.features, engine3d: false } } });
  assert.equal(input.name, "My game"); assert.equal(input.config.features.physics3d, false);
  assert.equal(SavedRecipeInputSchema.safeParse({ name: " ", config: DEFAULT_BUILD_CONFIG }).success, false);
  assert.equal(SavedRecipeInputSchema.safeParse({ name: "Bad", config: { ...DEFAULT_BUILD_CONFIG, optimization: "arbitrary shell" } }).success, false);
  assert.equal(SavedRecipeInputSchema.safeParse({ name: "Bad", config: DEFAULT_BUILD_CONFIG, user_id: "other" }).success, false);
});
test("size comparisons require all kinds, exact identity and real measured binary bytes", () => {
  const config = { ...DEFAULT_BUILD_CONFIG, templateKinds: ["debug", "release"] };
  assert.equal(compareTemplateSize(config, 500, false, [reference("release")]), null);
  const comparison = compareTemplateSize(config, 500, false, [reference("release"), reference("debug")])!;
  assert.equal(comparison.officialBytes, 2000); assert.equal(comparison.percentSaved, 75);
  assert.equal(compareTemplateSize(config, 500, true, comparison.references), null);
  assert.equal(compareTemplateSize(config, null, false, comparison.references), null);
  for (const override of [{ godot_version: "4.5" }, { architecture: "x86_32" }, { web_threads: true }, { source_url: "https://example.com/fake.tpz" }, { binary_size_bytes: 0 }, { archive_sha256: "bad" }]) {
    assert.equal(compareTemplateSize(config, 500, false, [reference("release"), reference("debug", override)]), null);
  }
  assert.equal(compareTemplateSize(config, 500, false, [reference("release"), reference("debug"), reference("debug")]), null);
  assert.equal(compareTemplateSize(DEFAULT_BUILD_CONFIG, 1200, false, [reference("release")])!.savedBytes, -200);
});
test("Web comparisons distinguish thread modes and measure WASM for both kinds", () => {
  const config = { ...DEFAULT_BUILD_CONFIG, platform: "web", architecture: "wasm32", webThreads: true };
  const ref = reference("release", { platform: "web", architecture: "wasm32", web_threads: true });
  assert.equal(compareTemplateSize(config, 200, false, [ref])!.measurement, "wasm");
  assert.equal(compareTemplateSize({ ...config, webThreads: false }, 200, false, [ref]), null);
});
test("compatibility guidance follows normalized removals and explains concrete project dependencies", () => {
  const items = compatibilityGuidance({ ...DEFAULT_BUILD_CONFIG, features: { ...PRESETS.standard.features, physics2d: false, multiplayer: false, advancedGui: false, textServer: "fallback" } });
  assert.ok(items.find(item => item.key === "physics2d")?.examples.includes("CharacterBody2D"));
  assert.ok(items.find(item => item.key === "advancedGui")?.examples.includes("RichTextLabel"));
  assert.ok(items.find(item => item.key === "multiplayer")?.consequence.includes("HTTP/TCP"));
  assert.ok(items.find(item => item.key === "textServer"));
  assert.ok(!items.some(item => item.key === "enet"));
  assert.deepEqual(compatibilityGuidance(DEFAULT_BUILD_CONFIG), []);
});
