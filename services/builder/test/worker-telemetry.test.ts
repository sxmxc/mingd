import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WorkerTelemetrySchema } from "@mingd/worker-protocol";
import { parseCcacheCounters, WorkerTelemetrySampler } from "../src/worker-telemetry.js";

test("ccache machine counters require bounded, complete numeric output", () => {
  assert.deepEqual(parseCcacheCounters("cache_size_kibibyte\t1024\ncache_miss\t2\ndirect_cache_hit\t5"), { cache_size_kibibyte: 1024, cache_miss: 2, direct_cache_hit: 5 });
  for (const output of ["", "cache_miss 1", "cache_size_kibibyte 0\ncache_miss -1", "cache_size_kibibyte 0\ncache_miss 9007199254740992", "cache_size_kibibyte 0\ncache_miss 0\nsecret value"]) assert.throws(() => parseCcacheCounters(output));
});
test("container sampler reports its group, quota and CPU deltas; missing controllers are unavailable", async t => {
  const dir = await mkdtemp("/tmp/mingd-telemetry-");
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const [file, value] of Object.entries({ "cpu.stat": "usage_usec 100\n", "cpu.max": "200000 100000\n", "memory.current": "1048576\n", "memory.max": "2097152\n", "pids.current": "3\n" })) await writeFile(join(dir, file), value);
  const sampler = new WorkerTelemetrySampler(dir, dir);
  const first = await sampler.sample();
  assert.deepEqual(first.container, { cpuUsageUsec: 100, cpuCoresUsed: null, cpuLimitCores: 2, memoryBytes: 1048576, memoryLimitBytes: 2097152, pids: 3 });
  await writeFile(join(dir, "cpu.stat"), "usage_usec 200\n");
  const second = await sampler.sample();
  assert.ok(second.container!.cpuCoresUsed! > 0);
  await writeFile(join(dir, "cpu.max"), "max 100000\n");
  await writeFile(join(dir, "memory.max"), "max\n");
  const unlimited = await sampler.sample();
  assert.equal(unlimited.container!.cpuLimitCores, null);
  assert.equal(unlimited.container!.memoryLimitBytes, null);
  await rm(join(dir, "cpu.stat"));
  assert.equal((await sampler.sample()).container, null);
});
test("telemetry contract rejects nonfinite counters, unknown properties and oversized counter sets", () => {
  const value = { schemaVersion: 1, uptimeSeconds: 1, ccache: null, container: null };
  assert.ok(WorkerTelemetrySchema.safeParse(value).success);
  for (const invalid of [{ ...value, uptimeSeconds: -1 }, { ...value, token: "secret" }, { ...value, uptimeSeconds: Infinity }]) assert.equal(WorkerTelemetrySchema.safeParse(invalid).success, false);
  const ccache = { hits: 0, misses: 0, sizeBytes: 0, files: 0, maxSize: "5.0G", version: "ccache 4.7.5", counters: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`counter_${i}`, i])) };
  assert.equal(WorkerTelemetrySchema.safeParse({ ...value, ccache }).success, false);
});
