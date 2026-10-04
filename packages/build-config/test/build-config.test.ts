import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BUILD_CONFIG,
  canonicalBuildCacheInput,
  canonicalBuildConfigJson,
  normalizeBuildConfig,
  toSconsArgs,
} from "../src/index.ts";

test("normalization removes 3D dependents when 3D is disabled", () => {
  const normalized = normalizeBuildConfig({
    ...DEFAULT_BUILD_CONFIG,
    features: {
      ...DEFAULT_BUILD_CONFIG.features,
      engine3d: false,
      physics3d: true,
      jolt: true,
      navigation3d: true,
      openxr: true,
      csg: true,
      gridmap: true,
    },
  });

  assert.equal(normalized.features.physics3d, false);
  assert.equal(normalized.features.jolt, false);
  assert.equal(normalized.features.navigation3d, false);
  assert.equal(normalized.features.openxr, false);
  assert.equal(normalized.features.csg, false);
  assert.equal(normalized.features.gridmap, false);
});

test("canonical JSON is deterministic", () => {
  const a = canonicalBuildConfigJson(DEFAULT_BUILD_CONFIG);
  const b = canonicalBuildConfigJson(JSON.parse(JSON.stringify(DEFAULT_BUILD_CONFIG)));
  assert.equal(a, b);
});

test("SCons arguments are generated from allowlisted values", () => {
  const args = toSconsArgs(DEFAULT_BUILD_CONFIG, "release");
  assert.ok(args.includes("platform=windows"));
  assert.ok(args.includes("target=template_release"));
  assert.ok(args.includes("arch=x86_64"));
  assert.ok(args.includes("production=yes"));
  assert.ok(args.includes("d3d12=no"));
  assert.ok(args.includes("accesskit=no"));
});

test("cache input includes the build recipe", () => {
  const value = canonicalBuildCacheInput(DEFAULT_BUILD_CONFIG);
  assert.match(value, /^2\n\{/);
});
