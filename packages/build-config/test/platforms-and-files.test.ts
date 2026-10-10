import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG, PRESETS, PLATFORM_ARCHITECTURES, assertRealBuildSupported, buildArchitectures, canonicalBuildCacheInput, compiledTemplateFilename, expectedTemplateFilename, gdBuildFilename, normalizeBuildConfig, parseGdBuildFile, serializeGdBuildFile, toSconsArgs, workerPlatforms, workerTargetForPlatform } from "../src/index.ts";

test("portable files round-trip normalized settings without account or build identity", () => {
  const text = serializeGdBuildFile(" My game ", { ...DEFAULT_BUILD_CONFIG, features: PRESETS.offline2d.features, templateKinds: ["release", "debug"] });
  const file = parseGdBuildFile("\uFEFF" + text);
  assert.equal(file.name, "My game");
  assert.equal(serializeGdBuildFile(file.name, file.config), text);
  assert.deepEqual(Object.keys(file).sort(), ["config", "format", "name", "version"]);
  assert.equal(gdBuildFilename("../my / game\\$(touch secret)"), "my-game-touch-secret.gdbuild");
  assert.equal(gdBuildFilename("💙"), "recipe.gdbuild");
});
test("portable imports reject commands, unknown settings, unsafe recipes and oversized files", () => {
  const file = JSON.parse(serializeGdBuildFile("Game", DEFAULT_BUILD_CONFIG));
  for (const changed of [{ ...file, version: 2 }, { ...file, command: "scons arbitrary" }, { ...file, config: { ...file.config, sourceUrl: "https://evil.example" } }, { ...file, config: { ...file.config, lto: "full" } }, { ...file, config: { ...file.config, features: { ...file.config.features, custom: true } } }, { ...file, config: { ...file.config, godotVersion: "4.7.2-stable;curl evil" } }]) assert.throws(() => parseGdBuildFile(JSON.stringify(changed)), /Invalid/);
  assert.throws(() => parseGdBuildFile("{"), /Invalid/);
  assert.throws(() => parseGdBuildFile(" ".repeat(65537)), /64 KiB/);
});
test("desktop portable recipes retain both LTO choices", () => {
  for (const platform of ["linux", "windows"] as const) for (const lto of [false, true]) {
    const file = parseGdBuildFile(serializeGdBuildFile("Game", { ...DEFAULT_BUILD_CONFIG, platform, lto }));
    assert.equal(file.config.lto, lto);
  }
});
test("new platform architectures normalize idempotently and use dedicated workers", () => {
  for (const platform of ["android", "macos"] as const) for (const architecture of PLATFORM_ARCHITECTURES[platform]) {
    const config = assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, platform, architecture });
    assert.deepEqual(normalizeBuildConfig(config), config);
    assert.equal(workerTargetForPlatform(platform), platform);
    assert.deepEqual(workerPlatforms(platform), [platform]);
  }
  for (const [platform, architecture] of [["web", "arm64"], ["windows", "universal"], ["android", "universal"], ["macos", "wasm32"]]) assert.throws(() => normalizeBuildConfig({ ...DEFAULT_BUILD_CONFIG, platform, architecture }));
  assert.throws(() => assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, platform: "android", architecture: "arm64", godotVersion: "4.5" }), /verified release/);
});
test("platform arguments match Godot and universal macOS expands into thin builds", () => {
  const android = assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, platform: "android", architecture: "arm64", templateKinds: ["release", "debug"] });
  for (const kind of android.templateKinds) {
    const args = toSconsArgs(android, kind);
    assert.ok(args.includes("platform=android")); assert.ok(args.includes("arch=arm64"));
    assert.ok(args.includes("generate_android_binaries=no")); assert.ok(!args.includes("use_static_cpp=yes"));
    assert.equal(compiledTemplateFilename(android, kind), `android_${kind}.apk`);
    assert.equal(expectedTemplateFilename(android, kind), `android_${kind}.apk`);
  }
  const mac = assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, platform: "macos", architecture: "universal" });
  assert.deepEqual(buildArchitectures(mac), ["arm64", "x86_64"]);
  assert.throws(() => toSconsArgs(mac, "release"), /separate/);
  for (const architecture of buildArchitectures(mac)) {
    const config = { ...mac, architecture };
    assert.ok(toSconsArgs(config, "release").includes("metal=no"));
    assert.ok(toSconsArgs(config, "release").includes("vulkan=no"));
    assert.ok(toSconsArgs(config, "release").includes("osxcross_sdk=darwin27"));
    assert.ok(toSconsArgs(config, "release").includes("import_env_vars=CCACHE_DIR,CCACHE_BASEDIR,CCACHE_STATSLOG,LD_LIBRARY_PATH"));
    assert.equal(compiledTemplateFilename(config, "release"), `godot.macos.template_release.${architecture}`);
  }
  assert.equal(expectedTemplateFilename(mac, "release"), "macos.zip");
});
test("platform toolchains separate cache keys without invalidating existing recipes", () => {
  const mac = { ...DEFAULT_BUILD_CONFIG, platform: "macos", architecture: "universal" };
  assert.match(canonicalBuildCacheInput({ ...DEFAULT_BUILD_CONFIG, platform: "android", architecture: "arm64" }), /android-1:ndk-29\.0\.14206865/);
  assert.throws(() => canonicalBuildCacheInput(mac), /toolchain SHA-256/);
  assert.notEqual(canonicalBuildCacheInput(mac, undefined, "a".repeat(64)), canonicalBuildCacheInput(mac, undefined, "b".repeat(64)));
  const macRecipe = canonicalBuildCacheInput(mac, undefined, "a".repeat(64));
  assert.match(macRecipe, /\nmacos-2:/);
  assert.notEqual(macRecipe, macRecipe.replace("\nmacos-2:", "\nmacos-1:"));
  assert.match(canonicalBuildCacheInput(DEFAULT_BUILD_CONFIG), /^11\nhttps:/);
});
