import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BUILD_RECIPE_VERSION, DEFAULT_BUILD_CONFIG, SUPPORTED_GODOT_VERSIONS, canonicalBuildCacheInput, normalizeBuildConfig } from "@mingd/build-config";
import { runRemoteWorker } from "../src/remote-runtime.js";


test("a failure before compilation sends final diagnostics before reporting failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mingd-remote-failure-"));
  const token = `mingd_worker_${randomUUID()}.${"a".repeat(43)}`;
  const tokenFile = join(directory, "worker.token");
  await writeFile(tokenFile, token, { mode: 0o600 });
  const shutdown = new AbortController();
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const logs: string[] = [];
  const originalError = console.error;
  const assignmentId = randomUUID();
  console.error = (value: string) => { logs.push(value); };
  try {
    await runRemoteWorker({ WORKER_GATEWAY_URL: "https://gateway.test", WORKER_TOKEN_FILE: tokenFile,
      GODOT_WORK_DIR: join(directory, "jobs"), GODOT_CACHE_DIR: join(directory, "cache"), CCACHE_DIR: join(directory, "ccache") },
    async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = JSON.parse(String(init?.body));
      if (path === "/v1/workers/telemetry") return new Response(null, { status: 404 });
      calls.push({ path, body });
      if (path === "/v1/assignments/next") return Response.json({ protocolVersion: 1, assignment: {
        protocolVersion: 1, assignmentId, buildId: randomUUID(), configHash: "a".repeat(64),
        config: DEFAULT_BUILD_CONFIG, release: "0.1.0", recipeVersion: "8",
        dryRun: false, leaseExpiresAt: new Date(Date.now() + 90_000).toISOString(),
      } });
      if (path === "/v1/assignments/heartbeat") return Response.json({ protocolVersion: 1, assignmentId,
        leaseExpiresAt: new Date(Date.now() + 90_000).toISOString() });
      assert.equal(path, "/v1/assignments/failure");
      shutdown.abort();
      return Response.json({ protocolVersion: 1 });
    }, shutdown);
    assert.deepEqual(calls.map(call => call.path), ["/v1/assignments/next", "/v1/assignments/heartbeat", "/v1/assignments/failure"]);
    assert.match(String(calls[1].body.logTail), /Worker failure during preparing_source: Assignment recipe mismatch/);
    assert.deepEqual(JSON.parse(logs[0]), { event: "worker_build_interrupted", assignmentId,
      stage: "preparing_source", reason: "Assignment recipe mismatch." });
    assert.ok(!JSON.stringify({ calls, logs }).includes(token));
  } finally {
    console.error = originalError;
    shutdown.abort();
    await rm(directory, { recursive: true, force: true });
  }
});

test("source checksum failures retain the actual reason and stage in final diagnostics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mingd-remote-source-failure-"));
  const token = `mingd_worker_${randomUUID()}.${"a".repeat(43)}`;
  const tokenFile = join(directory, "worker.token");
  const version = SUPPORTED_GODOT_VERSIONS["4.6.3"];
  const cache = join(directory, "cache");
  const sourceDirectory = join(cache, version.id, version.sourceSha256);
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(join(sourceDirectory, `godot-${version.id}.tar.xz`), "corrupt archive fixture");
  await writeFile(tokenFile, token, { mode: 0o600 });
  const config = normalizeBuildConfig({ ...DEFAULT_BUILD_CONFIG, godotVersion: version.id });
  const configHash = createHash("sha256").update(canonicalBuildCacheInput(config, version)).digest("hex");
  const assignmentId = randomUUID();
  const shutdown = new AbortController();
  const heartbeats: Record<string, unknown>[] = [];
  const logs: string[] = [];
  const originalError = console.error;
  const originalFetch = globalThis.fetch;
  console.error = (value: string) => { logs.push(value); };
  globalThis.fetch = async () => { throw new Error("Offline official release catalog fixture"); };
  try {
    await runRemoteWorker({ WORKER_TOKEN_FILE: tokenFile, GODOT_WORK_DIR: join(directory, "jobs"),
      GODOT_CACHE_DIR: cache, CCACHE_DIR: join(directory, "ccache") }, async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = JSON.parse(String(init?.body));
      if (path === "/v1/workers/telemetry") return new Response(null, { status: 404 });
      if (path.endsWith("/next")) return Response.json({ protocolVersion: 1, assignment: {
        protocolVersion: 1, assignmentId, buildId: randomUUID(), configHash, config,
        release: "0.2.0", recipeVersion: BUILD_RECIPE_VERSION, dryRun: false,
        leaseExpiresAt: new Date(Date.now() + 90_000).toISOString(),
      } });
      if (path.endsWith("/heartbeat")) {
        heartbeats.push(body);
        return Response.json({ protocolVersion: 1, assignmentId, leaseExpiresAt: new Date(Date.now() + 90_000).toISOString() });
      }
      assert.equal(path, "/v1/assignments/failure");
      assert.match(String(heartbeats.at(-1)?.logTail), /Godot source checksum mismatch/);
      shutdown.abort();
      return Response.json({ protocolVersion: 1 });
    }, shutdown);
    assert.equal(heartbeats.at(-1)?.stage, "verifying_source");
    const interrupted = JSON.parse(logs[0]);
    assert.equal(interrupted.stage, "verifying_source");
    assert.match(interrupted.reason, /Godot source checksum mismatch/);
    assert.ok(!JSON.stringify({ heartbeats, logs }).includes(token));
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    shutdown.abort();
    await rm(directory, { recursive: true, force: true });
  }
});
