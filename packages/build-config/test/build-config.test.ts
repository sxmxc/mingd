import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BUILD_CONFIG,
  canonicalBuildCacheInput,
  canonicalBuildConfigJson,
  normalizeBuildConfig,
  assertRealBuildSupported,
  expectedTemplateFilename,
  toSconsArgs,
  PRESETS,
  buildPresetId,
  SUPPORTED_PRESET_IDS,
  compiledTemplateFilename,
  expectedConsoleTemplateFilename,
  FEATURE_GROUPS,
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
  assert.match(value, /^7\nhttps:\/\/github\.com\/godotengine\/godot\/releases\/download\/4\.7\.2-stable/);
  assert.match(value, /a18ce0ccec3ecc40b0dd6c4f5132ca934e9fb7c2979717940ff32aee1eb35481/);
});

test("real-build guard accepts custom features but rejects unsupported target contracts", () => {
  assert.deepEqual(assertRealBuildSupported(DEFAULT_BUILD_CONFIG), DEFAULT_BUILD_CONFIG);
  assert.throws(() => assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, lto: true }), /LTO disabled/);
  assert.equal(assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, platform: "windows" }).platform, "windows");
  assert.equal(assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, features: { ...DEFAULT_BUILD_CONFIG.features, engine3d: false } }).features.gltf, false);
  assert.throws(() => assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, features: { ...DEFAULT_BUILD_CONFIG.features, tilemap: false } }), /TileMap/);
  assert.throws(() => assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, architecture: "arm64" }));
  assert.throws(() => assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, templateKinds: ["debug"] }), /template_release/);
});

test("Windows Standard generates the conservative MinGW recipe and a distinct cache identity", () => {
  const config = assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, platform: "windows" });
  const args = toSconsArgs(config, "release");
  for (const arg of ["platform=windows", "lto=none", "optimize=size", "target=template_release", "d3d12=no", "angle=no", "accesskit=no", "winrt=no", "windows_subsystem=gui"]) assert.ok(args.includes(arg));
  assert.equal(expectedTemplateFilename(config, "release"), "windows_release_x86_64.exe");
  assert.notEqual(canonicalBuildCacheInput(config), canonicalBuildCacheInput(DEFAULT_BUILD_CONFIG));
});

test("Lean 2D is supported and deterministic on both desktop targets", () => {
  for (const platform of ["linux", "windows"] as const) {
    const config = assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, platform, features: PRESETS.lean2d.features });
    assert.equal(buildPresetId(config), "lean2d");
    assert.deepEqual(normalizeBuildConfig(config), config);
    const args = toSconsArgs(config, "release");
    for (const flag of ["disable_3d=yes", "disable_physics_3d=yes", "disable_navigation_3d=yes", "disable_navigation_2d=no", "disable_xr=yes", "module_jolt_physics_enabled=no", "module_gltf_enabled=no"]) assert.ok(args.includes(flag), flag);
    assert.equal(args.some(flag => flag.startsWith("module_jolt_enabled=")), false);
    assert.notEqual(canonicalBuildCacheInput(config), canonicalBuildCacheInput({ ...DEFAULT_BUILD_CONFIG, platform }));
  }
  assert.equal(buildPresetId(assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, features: PRESETS.offline2d.features })), "offline2d");
});

test("every preset is normalized, accepted for both targets and has a unique recipe", () => {
  const hashes = new Set<string>();
  for (const platform of ["linux", "windows"] as const) for (const id of SUPPORTED_PRESET_IDS) {
    const config = assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, platform, features: PRESETS[id].features });
    assert.equal(buildPresetId(config), id);
    assert.deepEqual(normalizeBuildConfig(config), config);
    hashes.add(canonicalBuildCacheInput(config));
  }
  assert.equal(hashes.size, 8);
});

test("each editable feature normalizes idempotently and produces a different cache recipe", () => {
  const keys = FEATURE_GROUPS.flatMap(group => group.options).filter(option => !option.locked).map(option => option.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) {
    const config = assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, features: { ...DEFAULT_BUILD_CONFIG.features, [key]: false } });
    assert.deepEqual(normalizeBuildConfig(config), config, key);
    assert.notEqual(canonicalBuildCacheInput(config), canonicalBuildCacheInput(DEFAULT_BUILD_CONFIG), key);
    assert.equal(buildPresetId(config), key === "engine3d" ? "lean2d" : null, key);
  }
  const noAudio = normalizeBuildConfig({ ...DEFAULT_BUILD_CONFIG, features: { ...DEFAULT_BUILD_CONFIG.features, oggVorbis: false } });
  assert.equal(noAudio.features.theora, false);
  const fallback = assertRealBuildSupported({ ...DEFAULT_BUILD_CONFIG, features: { ...DEFAULT_BUILD_CONFIG.features, textServer: "fallback" } });
  assert.ok(toSconsArgs(fallback, "release").includes("module_text_server_fb_enabled=yes"));
});

test("compiler launchers are explicit and bogus TileMap module flag is absent", () => {
  const args = toSconsArgs(DEFAULT_BUILD_CONFIG, "release");
  assert.ok(args.includes("c_compiler_launcher=ccache"));
  assert.ok(args.includes("cpp_compiler_launcher=ccache"));
  assert.ok(args.includes("import_env_vars=CCACHE_DIR,CCACHE_BASEDIR,CCACHE_STATSLOG"));
  assert.equal(args.some(arg => arg.startsWith("module_tilemap_enabled=")), false);
});

test("template filenames distinguish platforms, architectures, release/debug and wrappers", () => {
  for (const kind of ["release", "debug"] as const) {
    const linux = DEFAULT_BUILD_CONFIG;
    const windows = { ...DEFAULT_BUILD_CONFIG, platform: "windows" as const };
    assert.equal(expectedTemplateFilename(linux, kind), `linux_${kind}.x86_64`);
    assert.equal(expectedTemplateFilename(windows, kind), `windows_${kind}_x86_64.exe`);
    assert.equal(expectedConsoleTemplateFilename(windows, kind), `windows_${kind}_x86_64_console.exe`);
    assert.equal(compiledTemplateFilename(linux, kind), `godot.linuxbsd.template_${kind}.x86_64`);
    assert.equal(compiledTemplateFilename(windows, kind, true), `godot.windows.template_${kind}.x86_64.console.exe`);
    assert.throws(() => expectedConsoleTemplateFilename(linux, kind));
  }
});
