import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { BUILD_RECIPE_VERSION } from "@mingd/build-config";
import { bulkWorkers } from "../src/operator-bulk.js";
import { hashWorkerCredential } from "../src/credentials.js";
import { WorkerOperator } from "../src/operator.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const ids = ["12345678-1234-4234-8234-123456789abc", "22345678-1234-4234-8234-123456789abc"];
function fixture({ draining = true, active = 0, failAt = -1 } = {}) {
  const workers = ids.map((id, index) => ({ id, name: `worker-${index}`, target: index ? "macos" : "desktop", draining,
    toolchain_sha256: index ? "a".repeat(64) : null }));
  const changes: Array<{ id: string; hash: string; hello: any }> = [];
  const states: unknown[] = [];
  const operator = {
    enabledWorkers: async () => workers,
    activeAssignments: async () => active,
    setState: async (id: string, state: string) => { states.push({ id, state }); },
    replaceDrainedCredential: async (id: string, hash: string, hello: unknown) => {
      if (changes.length === failAt) throw new Error("sensitive backend detail");
      changes.push({ id, hash, hello });
    },
  } as unknown as WorkerOperator;
  return { operator, changes, states };
}

test("bulk upgrade preserves worker IDs, uses current recipe, and writes private distinct tokens before updating", async () => {
  const root = mkdtempSync(join(tmpdir(), "mingd-bulk-"));
  const directory = join(root, "new");
  const { operator, changes } = fixture();
  try {
    const result = await bulkWorkers(operator, "upgrade", { directory, release: "0.2.3", toolchainSha256: "b".repeat(64) });
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(changes.length, 2);
    for (const [index, change] of changes.entries()) {
      const file = join(directory, `${ids[index]}.token`);
      const token = readFileSync(file, "utf8").trim();
      assert.equal(statSync(file).mode & 0o777, 0o600);
      assert.equal(hashWorkerCredential(token), change.hash);
      assert.equal(change.hello.recipeVersion, BUILD_RECIPE_VERSION);
      assert.equal(change.hello.toolchainSha256, index ? "b".repeat(64) : null);
      assert.ok(!JSON.stringify(result).includes(token));
    }
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    assert.ok(manifest.workers.every((worker: any) => worker.outcome === "updated"));
    await assert.rejects(bulkWorkers(operator, "rotate", { directory, release: "0.2.3" }), /must not already exist/);
    assert.equal(changes.length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("bulk credential operations reject undrained or active fleets before creating files or changing credentials", async () => {
  for (const options of [{ draining: false }, { active: 1 }]) {
    const { operator, changes } = fixture(options);
    await assert.rejects(bulkWorkers(operator, "rotate", { directory: "/does-not-exist", release: "0.2.3" }), /draining with no active assignments/);
    assert.equal(changes.length, 0);
  }
});

test("partial rotation preserves all files and distinguishes committed, uncertain, and pending outcomes", async () => {
  const root = mkdtempSync(join(tmpdir(), "mingd-bulk-"));
  const directory = join(root, "new");
  const { operator, changes } = fixture({ failAt: 1 });
  try {
    await assert.rejects(bulkWorkers(operator, "rotate", { directory, release: "0.2.3" }), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /were preserved/);
      assert.ok(!error.message.includes("sensitive backend detail"));
      return true;
    });
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.workers.map((worker: any) => worker.outcome), ["updated", "uncertain"]);
    assert.equal(changes[0].hello, undefined); // rotation alone preserves recipe enrollment
    for (const id of ids) assert.ok(readFileSync(join(directory, `${id}.token`), "utf8"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("bulk drain waits for idle assignments and resume acts on the same enabled fleet", async () => {
  const { operator, states } = fixture();
  const drained = await bulkWorkers(operator, "drain", { wait: true, release: "0.2.3" });
  assert.ok("activeAssignments" in drained);
  assert.equal(drained.activeAssignments, 0);
  await bulkWorkers(operator, "resume", { release: "0.2.3" });
  assert.deepEqual(states, [...ids.map(id => ({ id, state: "drain" })), ...ids.map(id => ({ id, state: "resume" }))]);
});

test("drain wait timeout leaves the fleet draining and reports unfinished assignments", async () => {
  const { operator, states } = fixture({ active: 1 });
  await assert.rejects(bulkWorkers(operator, "drain", { wait: true, timeoutSeconds: 1, release: "0.2.3" }), /Workers remain draining/);
  assert.deepEqual(states, ids.map(id => ({ id, state: "drain" })));
});

test("enabled worker enumeration paginates without selecting credential fields", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` }));
  const pages: number[] = [];
  const database = { from(table: string) {
    assert.equal(table, "build_workers");
    const query = {
      select(fields: string) { assert.ok(!fields.includes("credential")); return query; },
      eq(key: string, value: boolean) { assert.equal(key, "disabled"); assert.equal(value, false); return query; },
      order(key: string) { assert.equal(key, "id"); return query; },
      async range(start: number, end: number) { pages.push(start); return { data: rows.slice(start, end + 1), error: null }; },
    };
    return query;
  } } as unknown as SupabaseClient;
  assert.equal((await new WorkerOperator(database).enabledWorkers()).length, 101);
  assert.deepEqual(pages, [0, 100]);
});
