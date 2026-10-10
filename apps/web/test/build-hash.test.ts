import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG, PRESETS, SUPPORTED_PRESET_IDS, SUPPORTED_GODOT_VERSIONS, assertRealBuildSupported, canonicalBuildCacheInput, parseGdBuildFile } from "@mingd/build-config";
import { hashBuildConfig } from "../lib/build-hash.ts";

// JSONB/queue delivery can reorder object keys. Preserve arrays and values.
function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorderKeys(item)]));
  return value;
}

test("reported Lean 2D Windows recipe preserves its web hash through queue and database serialization", async () => {
  const text = await readFile(new URL("../../../packages/build-config/test/fixtures/lean2d-windows.gdbuild", import.meta.url), "utf8");
  const { config } = parseGdBuildFile(text);
  assert.deepEqual(config, { ...DEFAULT_BUILD_CONFIG, lto: false, platform: "windows", templateKinds: ["debug", "release"], features: PRESETS.lean2d.features });
  const source = SUPPORTED_GODOT_VERSIONS[config.godotVersion];
  const submittedHash = hashBuildConfig(config, source);
  const delivered = assertRealBuildSupported(JSON.parse(JSON.stringify(reorderKeys(config))));
  const workerHash = createHash("sha256").update(canonicalBuildCacheInput(delivered, source)).digest("hex");
  assert.equal(workerHash, submittedHash);
});

test("all desktop presets and template kinds agree between web and worker hashing", () => {
  for (const lto of [false, true]) for (const platform of ["linux", "windows"] as const) for (const preset of SUPPORTED_PRESET_IDS) for (const templateKinds of [["debug"], ["release"], ["release", "debug"]]) {
    const config = assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, lto, platform, features: PRESETS[preset].features, templateKinds });
    const source = SUPPORTED_GODOT_VERSIONS[config.godotVersion];
    const submittedHash = hashBuildConfig(config, source);
    const delivered = JSON.parse(JSON.stringify(reorderKeys(config)));
    assert.equal(createHash("sha256").update(canonicalBuildCacheInput(delivered, source)).digest("hex"), submittedHash, `${platform}/${preset}/${templateKinds}`);
    assert.notEqual(createHash("sha256").update(canonicalBuildCacheInput(delivered, source).replace(/^11\n/, "10\n")).digest("hex"), submittedHash);
  }
});
