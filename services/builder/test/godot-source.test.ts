import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG, PRESETS, SUPPORTED_PRESET_IDS, toSconsArgs } from "@mingd/build-config";
import { compilerCacheEnvironment } from "../src/cache-diagnostics.js";
import { runProcess } from "../src/process.js";

test("exact Godot source accepts all desktop preset recipes and uses ccache launchers", async t => {
  const source = process.env.MINGD_GODOT_SOURCE;
  if (!source) return t.skip("Opt-in: set MINGD_GODOT_SOURCE to verified Godot 4.7.2 source");
  const dir = await mkdtemp(join(tmpdir(), "mingd-source-audit-"));
  try {
    const workspace = join(dir, "source");
    await runProcess("cp", ["-a", "--reflink=auto", `${source}/.`, workspace]);
    for (const platform of ["linux", "windows"] as const) for (const id of SUPPORTED_PRESET_IDS) {
      let compilerObserved = false;
      let filenameObserved = false;
      let unknownVariable = false;
      let tail = "";
      await runProcess("scons", ["-n", "verbose=yes", ...toSconsArgs({ ...DEFAULT_BUILD_CONFIG, platform, features: PRESETS[id].features }, "release")], {
        cwd: workspace, timeoutMs: 120000,
        env: compilerCacheEnvironment(workspace, join(dir, "cache"), join(dir, "stats.log")),
        onOutput(chunk) {
          // Link commands can exceed one pipe chunk; scan before truncating.
          tail += chunk.toString();
          compilerObserved ||= platform === "linux" ? /ccache g\+\+/.test(tail) : /ccache x86_64-w64-mingw32-g\+\+/.test(tail);
          filenameObserved ||= tail.includes(`godot.${platform === "linux" ? "linuxbsd" : "windows"}.template_release.x86_64`);
          unknownVariable ||= /Unknown (?:variables|options)/i.test(tail);
          tail = tail.slice(-8192);
        },
      });
      assert.equal(compilerObserved, true, `${platform}/${id}: explicit ccache compiler command not observed`);
      assert.equal(filenameObserved, true, `${platform}/${id}: release output name not observed`);
      assert.equal(unknownVariable, false, `${platform}/${id}: unsupported SCons variable`);
      t.diagnostic(`${platform}/${id}: SCons dry-run accepted recipe, ccache compiler command and release output observed`);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
