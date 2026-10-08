import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkerHello } from "@mingd/worker-protocol";
import { createWorkerCredential } from "../src/credentials.js";
import { buildServer } from "../src/server.js";
import { WorkerStore } from "../src/workers.js";
import { WorkerOperator } from "../src/operator.js";
import { backendConfigFromEnvironment } from "../src/backend.js";
import { probeWorkerGateway } from "../src/probe.js";

const hello: WorkerHello = { protocolVersion: 1, release: "0.1.1", recipeVersion: "9", target: "desktop", toolchainSha256: null };

test("heartbeat RPC owns authentication, compatibility and time, with safe errors", async () => {
  const credential = createWorkerCredential();
  let result: { data: unknown; error: unknown } = { data: [{ outcome: "ok", received_at: "2026-10-08T00:00:00+00:00", draining: true }], error: null };
  const calls: unknown[] = [];
  const database = { rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return result; } } as unknown as SupabaseClient;
  const store = new WorkerStore(database, "0.2.1", "9");
  const identity = { workerId: credential.workerId, credentialHash: credential.credentialHash };
  const accepted = await store.heartbeat(identity, hello);
  assert.equal(accepted.outcome, "ok");
  if (accepted.outcome === "ok") {
    assert.equal(accepted.receipt.draining, true);
    assert.equal(accepted.receipt.acceptingAssignments, false);
    assert.equal(accepted.receipt.receivedAt, "2026-10-08T00:00:00+00:00");
  }
  assert.deepEqual(calls[0], { name: "record_worker_heartbeat", args: {
    p_worker_id: identity.workerId, p_credential_hash: identity.credentialHash,
    p_release: "0.1.1", p_recipe_version: "9", p_target: "desktop", p_toolchain_sha256: null,
    p_expected_release: "0.2.1", p_expected_recipe_version: "9",
  } });
  result = { data: [], error: null };
  assert.deepEqual(await store.heartbeat(identity, hello), { outcome: "unauthorized" });
  result = { data: [{ outcome: "incompatible" }], error: null };
  assert.deepEqual(await store.heartbeat(identity, hello), { outcome: "incompatible" });
  result = { data: null, error: { message: "private-key-secret" } };
  await assert.rejects(store.heartbeat(identity, hello), /^Error: Worker heartbeat unavailable\.$/);
});

test("worker routes reject missing auth, unknown fields and incompatible declarations", async t => {
  const credential = createWorkerCredential();
  let calls = 0;
  const server = buildServer({ logger: false, workers: { heartbeat: async (identity, incoming) => {
    calls++;
    assert.equal(identity.workerId, credential.workerId);
    assert.equal(identity.credentialHash, credential.credentialHash);
    if (incoming.recipeVersion !== hello.recipeVersion) return { outcome: "incompatible" };
    return { outcome: "ok", receipt: { protocolVersion: 1, workerId: identity.workerId,
      receivedAt: new Date().toISOString(), heartbeatIntervalMs: 10000, draining: false, acceptingAssignments: false } };
  } } });
  t.after(() => server.close());
  const headers = { authorization: `Bearer ${credential.credential}` };
  const send = (payload: Record<string, unknown>, auth = true) => server.inject({ method: "POST", url: "/v1/workers/heartbeat", headers: auth ? headers : {}, payload });
  assert.equal((await send(hello, false)).statusCode, 401);
  for (const payload of [{ ...hello, sourceUrl: "https://evil.invalid" }, { ...hello, protocolVersion: 2 }, { ...hello, receivedAt: new Date().toISOString() }]) {
    assert.equal((await send(payload)).statusCode, 400);
  }
  assert.equal(calls, 0);
  assert.equal((await send({ ...hello, recipeVersion: "8" })).statusCode, 409);
  const accepted = await send(hello);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.json().workerId, credential.workerId);
  assert.equal(accepted.json().acceptingAssignments, false);
  assert.equal((await server.inject({ url: "/healthz" })).statusCode, 200);
  assert.equal((await server.inject({ method: "POST", url: "/v1/workers/enroll", headers })).statusCode, 404);
});

test("revoked credentials and backend failures produce safe HTTP errors", async t => {
  let failure = false;
  const server = buildServer({ logger: false, workers: { heartbeat: async () => {
    if (failure) throw new Error("privileged-backend-secret");
    return { outcome: "unauthorized" };
  } } });
  t.after(() => server.close());
  const request = { method: "POST" as const, url: "/v1/workers/heartbeat", payload: hello,
    headers: { authorization: `Bearer ${createWorkerCredential().credential}` } };
  assert.equal((await server.inject(request)).statusCode, 401);
  failure = true;
  const result = await server.inject(request);
  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.json(), { error: "internal_error" });
});

test("forged forwarded addresses cannot evade the pre-authentication rate budget", async t => {
  const server = buildServer({ logger: false, workers: { heartbeat: async () => { throw new Error("Must not reach backend"); } } });
  t.after(() => server.close());
  for (let i = 0; i < 600; i++) {
    const response = await server.inject({ method: "POST", url: "/v1/workers/heartbeat", headers: { "x-forwarded-for": `192.0.2.${i}` } });
    assert.equal(response.statusCode, 401);
  }
  assert.equal((await server.inject({ method: "POST", url: "/v1/workers/heartbeat" })).statusCode, 429);
  assert.equal((await server.inject({ url: "/healthz" })).statusCode, 200);
});

test("operator stores only hashed credentials and lists no credential fields", async () => {
  let inserted: Record<string, unknown> | undefined;
  let selected = "";
  const database = { from: () => ({
    insert: async (row: Record<string, unknown>) => { inserted = row; return { error: null }; },
    select: (fields: string) => { selected = fields; return { order: async () => ({ data: [], error: null }) }; },
  }) } as unknown as SupabaseClient;
  const operator = new WorkerOperator(database);
  const enrollment = await operator.enroll("Desktop A", hello, 2);
  await operator.saveEnrollment(enrollment);
  assert.equal(inserted?.credential_hash, enrollment.credentialHash);
  assert.equal(inserted?.max_assignments, 2);
  assert.ok(!JSON.stringify(inserted).includes(enrollment.credential));
  await operator.list();
  assert.ok(!selected.includes("credential"));
  await assert.rejects(operator.enroll("Bad\nName", hello));
  await assert.rejects(operator.enroll("Desktop", hello, 17));
  const rotated = createWorkerCredential(enrollment.workerId);
  assert.equal(rotated.workerId, enrollment.workerId);
  assert.notEqual(rotated.credentialHash, enrollment.credentialHash);
});

test("backend configuration requires privileged server settings only when called", () => {
  assert.throws(() => backendConfigFromEnvironment({}));
  assert.throws(() => backendConfigFromEnvironment({ SUPABASE_URL: "https://secret@example.com", SUPABASE_SECRET_KEY: "secret" }));
  assert.deepEqual(backendConfigFromEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "https://example.com", SUPABASE_SECRET_KEY: "secret" }), { url: "https://example.com", key: "secret" });
});

test("heartbeat probe uses HTTPS, blocks redirects and validates the enrolled identity", async () => {
  const token = createWorkerCredential();
  let calls = 0;
  const transport: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), "https://worker.example.com/v1/workers/heartbeat");
    assert.equal(init?.redirect, "error");
    assert.deepEqual(JSON.parse(String(init?.body)), hello);
    return new Response(JSON.stringify({ protocolVersion: 1, workerId: token.workerId,
      receivedAt: new Date().toISOString(), heartbeatIntervalMs: 10000, draining: false, acceptingAssignments: false }));
  };
  for (const origin of ["http://worker.example.com", "https://secret@worker.example.com", "https://worker.example.com/path"]) {
    await assert.rejects(probeWorkerGateway(origin, token.credential, hello, transport));
  }
  assert.equal(calls, 0);
  assert.equal((await probeWorkerGateway("https://worker.example.com", token.credential, hello, transport)).workerId, token.workerId);
  await assert.rejects(probeWorkerGateway("https://worker.example.com", token.credential, hello, async () => new Response("x".repeat(4097))));
});

test("telemetry routes authenticate and validate snapshots before persisting", async t => {
  const credential = createWorkerCredential();
  let calls = 0;
  const server = buildServer({ logger: false, workers: {
    heartbeat: async () => ({ outcome: "unauthorized" }),
    telemetry: async (identity, incoming, snapshot) => {
      calls++;
      assert.equal(identity.credentialHash, credential.credentialHash);
      assert.equal(snapshot.ccache, null);
      if (incoming.recipeVersion !== "9") return { outcome: "incompatible" };
      return { outcome: "ok", receipt: { protocolVersion: 1, workerId: identity.workerId, receivedAt: new Date().toISOString(), heartbeatIntervalMs: 10000, draining: false, acceptingAssignments: true } };
    },
  } });
  t.after(() => server.close());
  const payload = { hello, telemetry: { schemaVersion: 1, uptimeSeconds: 10, ccache: null, container: null } };
  const headers = { authorization: `Bearer ${credential.credential}` };
  const send = (body: unknown, auth = true) => server.inject({ method: "POST", url: "/v1/workers/telemetry", headers: auth ? headers : {}, payload: body as object });
  assert.equal((await send(payload, false)).statusCode, 401);
  assert.equal((await send({ ...payload, telemetry: { ...payload.telemetry, uptimeSeconds: -1 } })).statusCode, 400);
  assert.equal((await send({ ...payload, telemetry: { ...payload.telemetry, credential: "secret" } })).statusCode, 400);
  assert.equal(calls, 0);
  assert.equal((await send({ ...payload, hello: { ...hello, recipeVersion: "8" } })).statusCode, 409);
  const response = await send(payload);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().workerId, credential.workerId);
  assert.equal(response.body.includes(credential.credentialHash), false);
});
