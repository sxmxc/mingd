import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BUILD_CONFIG,
  canonicalBuildCacheInput,
  canonicalBuildConfigJson,
  normalizeBuildConfig,
  assertRealBuildSupported,
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
  assert.ok(args.includes("platform=linuxbsd"));
  assert.ok(args.includes("target=template_release"));
  assert.ok(args.includes("arch=x86_64"));
  assert.ok(args.includes("optimize=size"));
  assert.ok(args.includes("lto=none"));
  assert.ok(args.includes("production=yes"));
  assert.equal(args.some((arg) => arg.startsWith("d3d12=")), false);
});

test("cache input includes the build recipe", () => {
  const value = canonicalBuildCacheInput(DEFAULT_BUILD_CONFIG);
  assert.match(value, /^3\nhttps:\/\/github\.com\/godotengine\/godot\/releases\/download\/4\.7\.2-stable/);
  assert.match(value, /a18ce0ccec3ecc40b0dd6c4f5132ca934e9fb7c2979717940ff32aee1eb35481/);
});

test("real-build guard accepts only the first supported Linux Standard profile", () => {
  assert.deepEqual(assertRealBuildSupported(DEFAULT_BUILD_CONFIG), DEFAULT_BUILD_CONFIG);
  assert.throws(() => assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, lto: true }), /LTO disabled/);
  assert.throws(() => assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, platform: "windows" }), /Linux x86_64/);
});
