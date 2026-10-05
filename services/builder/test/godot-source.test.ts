import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG, PRESETS, SUPPORTED_PRESET_IDS, toSconsArgs, compiledTemplateFilename, normalizeBuildConfig } from "@mingd/build-config";
import { compilerCacheEnvironment } from "../src/cache-diagnostics.js";
import { runProcess } from "../src/process.js";

test("exact Godot source accepts platform/preset/debug recipes and uses ccache launchers", async t => {
  const source = process.env.MINGD_GODOT_SOURCE;
  if (!source) return t.skip("Opt-in: set MINGD_GODOT_SOURCE to verified allowlisted Godot source");
  const dir = await mkdtemp(join(tmpdir(), "mingd-source-audit-"));
  try {
    const workspace = join(dir, "source");
    await runProcess("cp", ["-a", "--reflink=auto", `${source}/.`, workspace]);
    const platforms = process.env.MINGD_AUDIT_WEB === "true" ? ["web" as const] : ["linux" as const, "windows" as const];
    const profiles = process.env.MINGD_AUDIT_STANDARD_ONLY === "true" ? ["standard" as const] : SUPPORTED_PRESET_IDS;
    for (const platform of platforms.filter(platform => !process.env.MINGD_AUDIT_PLATFORM || platform === process.env.MINGD_AUDIT_PLATFORM)) for (const id of profiles) for (const kind of ["release", "debug"] as const) for (const webThreads of platform === "web" ? [false, true] : [false]) {
      const config = normalizeBuildConfig({ ...DEFAULT_BUILD_CONFIG, godotVersion: process.env.MINGD_GODOT_VERSION ?? DEFAULT_BUILD_CONFIG.godotVersion, platform, architecture: platform === "web" ? "wasm32" : "x86_64", features: PRESETS[id].features, templateKinds: [kind], webThreads });
      let compilerObserved = false;
      let filenameObserved = false;
      let unknownVariable = false;
      let tail = "";
      await runProcess("scons", ["-n", "verbose=yes", ...toSconsArgs(config, kind)], {
        cwd: workspace, timeoutMs: 120000,
        env: compilerCacheEnvironment(workspace, join(dir, "cache"), join(dir, "stats.log")),
        onOutput(chunk) {
          // Link commands can exceed one pipe chunk; scan before truncating.
          tail += chunk.toString();
          compilerObserved ||= platform === "web" ? /ccache em\+\+/.test(tail) : platform === "linux" ? /ccache g\+\+/.test(tail) : /ccache x86_64-w64-mingw32-g\+\+/.test(tail);
          filenameObserved ||= tail.includes(compiledTemplateFilename(config, kind));
          unknownVariable ||= /Unknown (?:variables|options)/i.test(tail);
          tail = tail.slice(-8192);
        },
      });
      assert.equal(compilerObserved, true, `${platform}/${id}: explicit ccache compiler command not observed`);
      assert.equal(filenameObserved, true, `${platform}/${id}: release output name not observed`);
      assert.equal(unknownVariable, false, `${platform}/${id}: unsupported SCons variable`);
      t.diagnostic(`${config.godotVersion}/${platform}/${id}/${kind}${platform === "web" ? (webThreads ? "/threaded" : "/single-threaded") : ""}: SCons dry-run accepted recipe, ccache compiler command and output observed`);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
