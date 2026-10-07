import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compilerCacheEnvironment, compilerForPlatform, parseCacheLog } from "../src/cache-diagnostics.js";
import { BuildPerformance, LinkObserver } from "../src/performance.js";
import { runProcess } from "../src/process.js";

test("stage measurements accumulate, snapshot without double counting and track peaks", () => {
  const metrics = new BuildPerformance();
  metrics.transition("compiling", 100);
  metrics.transition("linking", 140);
  assert.equal(metrics.snapshot(150).stageDurationsMs.compiling, 40);
  assert.equal(metrics.snapshot(160).stageDurationsMs.linking, 20);
  metrics.recordPeak(100); metrics.recordPeak(70);
  assert.equal(metrics.snapshot(160).peakRssKiB, 100);
});
test("link detection handles split output and ignores static libraries", () => {
  let count = 0;
  const observer = new LinkObserver(() => count++);
  observer.record(Buffer.from("Linking Static Library libgodot.a ..."));
  observer.record(Buffer.from("\nLinking Program bin/godot.windows.template_release.x86_64.console.exe ...\n"));
  assert.equal(count, 0, "The small console wrapper must not start the main-binary linking interval");
  observer.record(Buffer.from("\nLinking Pro"));
  observer.record(Buffer.from("gram bin/godot.windows.template_release.x86_64.exe ..."));
  observer.record(Buffer.from("\nLinking Program bin/godot.windows.template_release.x86_64.console.exe ..."));
  assert.equal(count, 1);
  let largeChunkObserved = false;
  new LinkObserver(() => { largeChunkObserved = true; }).record(Buffer.from(`Linking Program bin/godot.linuxbsd.template_release.x86_64 ${" ".repeat(8192)}`));
  assert.equal(largeChunkObserved, true);
  for (const output of ["Linking Shared Library bin/libgodot.android.template_release.arm64.so ...", "Linking Program bin/godot.macos.template_release.arm64 ..."]) {
    let observed = false; new LinkObserver(() => { observed = true; }).record(Buffer.from(output)); assert.equal(observed, true);
  }
  for (const suffix of ["wasm32", "wasm32.nothreads"]) {
    let webObserved = false;
    new LinkObserver(() => { webObserved = true; }).record(Buffer.from(`Linking Program bin/godot.web.template_debug.${suffix}.js ...`));
    assert.equal(webObserved, true);
  }
});
test("cache counters distinguish verified compilation from link-only invocations", () => {
  assert.deepEqual(parseCacheLog("# comment\ndirect_cache_hit\npreprocessed_cache_hit\ncache_miss\nlocal_storage_hit\n"),
    { counters: { direct_cache_hit: 1, preprocessed_cache_hit: 1, cache_miss: 1, local_storage_hit: 1 }, hits: 2, misses: 1, usageVerified: true });
  assert.equal(parseCacheLog("called_for_link\n").usageVerified, false);
});

for (const platform of ["linux", "windows", "web"] as const) test(`${platform} compiler caches identical source across isolated workspaces`, async t => {
  const compiler = compilerForPlatform(platform);
  try { execFileSync("ccache", ["--version"]); execFileSync(compiler, ["--version"]); }
  catch { return t.skip("Requires the builder's ccache and GCC/MinGW toolchains"); }
  const dir = await mkdtemp(join(tmpdir(), "mingd-cache-test-"));
  try {
    const logs: string[] = [];
    const objects: Buffer[] = [];
    for (const name of ["job-a", "job-b"]) {
      const workspace = join(dir, name);
      await mkdir(workspace);
      const source = join(workspace, "sample.cpp");
      const output = join(workspace, "sample.o");
      const statsLog = join(workspace, "stats.log");
      await writeFile(source, "int value() { return 42; }\n");
      await runProcess("ccache", [compiler, "-c", source, "-o", output], {
        cwd: workspace, env: compilerCacheEnvironment(workspace, join(dir, "cache"), statsLog), timeoutMs: 30000,
      });
      logs.push(await readFile(statsLog, "utf8"));
      objects.push(await readFile(output));
    }
    assert.ok(parseCacheLog(logs[0]).misses > 0, logs[0]);
    assert.ok(parseCacheLog(logs[1]).hits > 0, logs[1]);
    assert.deepEqual(objects[0], objects[1]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("GNU time captures process memory and timeouts reject measured commands", async t => {
  try { await access("/usr/bin/time"); } catch { return t.skip("Requires GNU time"); }
  const dir = await mkdtemp(join(tmpdir(), "mingd-resources-"));
  try {
    let peak: number | null = null;
    await runProcess(process.execPath, ["-e", "Buffer.alloc(1024*1024)"], {
      resourceFile: join(dir, "usage"), onPeakRss: value => { peak = value; },
    });
    assert.ok(peak !== null && peak > 0);
    peak = null;
    await assert.rejects(runProcess(process.execPath, ["-e", "Buffer.alloc(1024*1024); process.exit(2)"], {
      resourceFile: join(dir, "failed"), onPeakRss: value => { peak = value; },
    }), /code 2/);
    assert.ok(peak !== null && peak > 0, "Failed measured commands retain available RSS");
    await assert.rejects(runProcess(process.execPath, ["-e", "setInterval(()=>{}, 100)"], {
      timeoutMs: 50, resourceFile: join(dir, "timeout"), onPeakRss: value => { peak = value; },
    }), /timeout/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
