import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { Job } from "bullmq";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_BUILD_CONFIG, godotVersionIdentifier } from "@mingd/build-config";
import { writeZip } from "../../builder/src/zip.js";
import { ExecutionBroker, type QueuedBuild } from "../src/execution.js";
import { UploadCapacityError } from "../src/execution-errors.js";

test("interrupted upload reservations remain retryable while ownership is valid", async t => {
  const directory = await mkdtemp("/tmp/mingd-upload-retry-");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "template.tpz");
  await writeZip(path, [
    { name: "README.txt", contents: Buffer.from("dry-run fixture") },
    { name: "version.txt", contents: Buffer.from(godotVersionIdentifier(DEFAULT_BUILD_CONFIG.godotVersion)) },
  ]);
  const assignmentId = randomUUID(), buildId = randomUUID(), artifactId = randomUUID();
  const identity = { workerId: randomUUID(), credentialHash: "a".repeat(64) };
  let owned = true, capacity = false, uploads = 0, resolved = false;
  const database = {
    async rpc(name: string) {
      if (name === "lock_worker_assignment") return { data: owned ? [{ state: "active", build_id: buildId }] : [], error: null };
      if (name === "reserve_worker_upload") return { data: capacity, error: null };
      assert.equal(name, "complete_worker_build");
      return { data: artifactId, error: null };
    },
    from() { return { select() { return { eq() { return { async single() { return { data: { performance_metrics: null }, error: null }; } }; } }; } }; },
  } as unknown as SupabaseClient;
  const storage = { storage: { from() { return { async upload() { uploads++; return { error: null }; } }; } } } as unknown as SupabaseClient;
  const broker = new ExecutionBroker(database, storage, { release: "0.2.2", redisUrl: "redis://localhost:6379",
    queues: { desktop: "desktop", web: "web", android: "android", macos: "macos" }, concurrency: 1,
    maxUploads: 1, dryRun: true, artifactBucket: "build-artifacts", workDir: directory, toolchainSha256: null, maxJobMs: 60_000 });
  // Seed a dispatched delivery without starting Redis or compiling Godot.
  broker["tasks"].set(buildId, { job: { data: { buildId } } as Job<QueuedBuild>, config: DEFAULT_BUILD_CONFIG,
    sourceSha256: "b".repeat(64), artifactHash: "c".repeat(64), target: "desktop", claimBusy: false,
    lease: { id: assignmentId, build_id: buildId, worker_id: identity.workerId, lease_until: new Date(Date.now() + 90_000).toISOString() },
    identity, resolve() { resolved = true; }, reject() { assert.fail("Upload contention must not fail the delivery"); }, uploadBusy: false, done: false });
  const complete = () => broker.complete(identity, assignmentId, path, "d".repeat(64), 100);
  await assert.rejects(complete(), UploadCapacityError);
  assert.equal(uploads, 0);
  assert.equal(broker["tasks"].get(buildId)?.uploadBusy, false);
  assert.equal(broker["uploadCount"], 0);
  owned = false;
  assert.equal(await complete(), null);
  owned = true;
  broker["tasks"].get(buildId)!.uploadBusy = true;
  await assert.rejects(complete(), UploadCapacityError);
  broker["tasks"].get(buildId)!.uploadBusy = false;
  broker["uploadCount"] = 1;
  await assert.rejects(complete(), UploadCapacityError);
  broker["uploadCount"] = 0;
  capacity = true;
  assert.equal(await complete(), artifactId);
  assert.equal(uploads, 1);
  assert.equal(resolved, true);
});
