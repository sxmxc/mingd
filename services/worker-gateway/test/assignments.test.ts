import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AssignmentStore } from "../src/assignments.js";

const identity = { workerId: "00000000-0000-4000-8000-000000000001", credentialHash: "a".repeat(64) };
const hello = { protocolVersion: 1 as const, release: "0.2.0", recipeVersion: "9", target: "desktop" as const, toolchainSha256: null };

test("gateway rejects mismatched recipes and protocols before asking for work", async () => {
  const database = { rpc() { throw new Error("Must not reach database"); } } as unknown as SupabaseClient;
  const store = new AssignmentStore(database, "9");
  await assert.rejects(store.claim(identity, identity.workerId, "a".repeat(64), { ...hello, protocolVersion: 2 }));
  assert.equal(await store.claim(identity, identity.workerId, "a".repeat(64), { ...hello, recipeVersion: "8" }), null);
});

test("application release differences do not block compatible assignment claims", async () => {
  let args: Record<string, unknown> | undefined;
  const lease = { id: identity.workerId, build_id: identity.workerId, worker_id: identity.workerId, lease_until: "2026-10-08T01:00:00Z" };
  const database = { async rpc(_name: string, value: Record<string, unknown>) {
    args = value; return { data: [lease], error: null };
  } } as unknown as SupabaseClient;
  assert.deepEqual(await new AssignmentStore(database, "9").claim(identity, identity.workerId, "a".repeat(64), { ...hello, release: "0.2.1" }), lease);
  assert.equal(args?.p_release, "0.2.1");
  assert.equal(args?.p_credential_hash, identity.credentialHash);
});

test("renewal delegates ownership and time checks to one RPC and does not expose backend errors", async () => {
  const calls: unknown[] = [];
  const database = { async rpc(name: string, args: unknown) {
    calls.push({ name, args }); return { data: null, error: null };
  } } as unknown as SupabaseClient;
  assert.equal(await new AssignmentStore(database, "9").renew(identity, identity.workerId), null);
  assert.deepEqual(calls, [{ name: "renew_worker_assignment", args: {
    p_worker_id: identity.workerId, p_credential_hash: identity.credentialHash,
    p_assignment_id: identity.workerId, p_lease_seconds: 90,
  } }]);
  const failed = { async rpc() { return { data: null, error: { message: "secret database configuration" } }; } } as unknown as SupabaseClient;
  await assert.rejects(new AssignmentStore(failed, "9").renew(identity, identity.workerId), /^Error: Worker assignment renewal unavailable\.$/);
});
