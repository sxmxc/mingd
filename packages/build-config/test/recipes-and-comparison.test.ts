import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG, PRESETS, SavedRecipeInputSchema, compareTemplateSize, compatibilityGuidance, officialTemplateReferenceTargets, validateTemplateReferenceMeasurements, type TemplateReference } from "../src/index.ts";

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
test("reference coverage and validation follow supported platforms rather than a fixed row count", () => {
  assert.equal(officialTemplateReferenceTargets("4.5").length, 8);
  for (const version of ["4.6.3", "4.7.2"]) {
    const targets = officialTemplateReferenceTargets(version);
    assert.equal(targets.length, 22);
    const rows = targets.map(target => ({ ...target, binary_size_bytes: 1000 }));
    assert.deepEqual(validateTemplateReferenceMeasurements(version, rows.slice().reverse()), rows);
    assert.throws(() => validateTemplateReferenceMeasurements(version, rows.slice(0, 8)), /incomplete/);
    assert.throws(() => validateTemplateReferenceMeasurements(version, [rows[0], ...rows.slice(0, -1)]), /Duplicate/);
    assert.throws(() => validateTemplateReferenceMeasurements(version, [{ ...rows[0], binary_size_bytes: Number.MAX_SAFE_INTEGER + 1 }, ...rows.slice(1)]), /Invalid/);
    assert.throws(() => validateTemplateReferenceMeasurements(version, [{ ...rows[0], architecture: "arbitrary" }, ...rows.slice(1)]), /incomplete/);
    assert.deepEqual(validateTemplateReferenceMeasurements(version, rows.map(row => ({ ...row, storage_path: "ignored" }))), rows);
  }
});
test("Android and macOS comparisons require exact architecture and sum selected engine binaries", () => {
  for (const platform of ["android", "macos"] as const) {
    const targets = officialTemplateReferenceTargets(DEFAULT_BUILD_CONFIG.godotVersion).filter(target => target.platform === platform);
    const references = targets.map(target => reference(target.template_kind, { ...target }));
    for (const architecture of new Set(targets.map(target => target.architecture))) {
      const config = { ...DEFAULT_BUILD_CONFIG, platform, architecture, templateKinds: ["release", "debug"] };
      const comparison = compareTemplateSize(config, 500, false, references)!;
      assert.equal(comparison.officialBytes, 2000);
      assert.equal(comparison.percentSaved, 75);
      assert.equal(comparison.measurement, platform === "android" ? "libraries" : "executables");
      assert.equal(compareTemplateSize(config, 500, false, references.filter(row => row.architecture !== architecture)), null);
    }
  }
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
