import assert from "node:assert/strict";
import test from "node:test";
import { canProcessBuild, failureState } from "../src/recovery.js";
test("automatic retries remain queued until attempts are exhausted", () => {
  assert.equal(failureState(0, 2).status, "queued");
  assert.equal(failureState(0, 2).completed_at, null);
  assert.equal(failureState(1, 2).status, "failed");
  assert.ok(failureState(1, 2).completed_at);
});
test("duplicate deliveries preserve terminal records and reject mismatched owners/hashes", () => {
  const record = { user_id: "owner", config_hash: "hash", status: "compiling" };
  assert.equal(canProcessBuild(record, "owner", "hash"), true);
  for (const status of ["failed", "complete"]) assert.equal(canProcessBuild({ ...record, status }, "owner", "hash"), false);
  assert.throws(() => canProcessBuild(record, "other", "hash"));
  assert.throws(() => canProcessBuild(record, "owner", "other"));
  assert.throws(() => canProcessBuild(null, "owner", "hash"));
});
