import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import { WORKER_JSON_BODY_LIMIT_BYTES } from "@mingd/worker-protocol";
import { gatewayConfigFromEnvironment } from "../src/config.js";
import { buildServer } from "../src/server.js";
import { ArtifactOperationError } from "../src/execution-errors.js";

test("listener defaults to loopback:3001 and rejects invalid settings", () => {
  assert.deepEqual(gatewayConfigFromEnvironment({}), { host: "127.0.0.1", port: 3001, logLevel: "info" });
  assert.equal(gatewayConfigFromEnvironment({ WORKER_GATEWAY_PORT: "3101" }).port, 3101);
  for (const port of ["", "0", "65536", "abc", "1.5", "3001 "]) {
    assert.throws(() => gatewayConfigFromEnvironment({ WORKER_GATEWAY_PORT: port }), /WORKER_GATEWAY_PORT/);
  }
  assert.throws(() => gatewayConfigFromEnvironment({ WORKER_GATEWAY_LOG_LEVEL: "credentials" }), /LOG_LEVEL/);
});

test("health check reports listener liveness without claiming build readiness", async t => {
  const server = buildServer({ logger: false });
  t.after(() => server.close());
  const response = await server.inject({ method: "GET", url: "/healthz" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok", protocolVersion: 1, acceptingAssignments: false });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal((await server.inject({ method: "POST", url: "/v1/assignments" })).statusCode, 404);
});

test("JSON parsing enforces body limits and returns safe errors", async t => {
  const server = buildServer({ logger: false });
  t.after(() => server.close());
  server.post("/test-body", async () => ({ ok: true }));
  const oversized = await server.inject({ method: "POST", url: "/test-body", payload: { text: "x".repeat(WORKER_JSON_BODY_LIMIT_BYTES) } });
  assert.equal(oversized.statusCode, 413);
  assert.deepEqual(oversized.json(), { error: "request_too_large" });
  const malformed = await server.inject({ method: "POST", url: "/test-body", headers: { "content-type": "application/json" }, payload: '{"secret":' });
  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(malformed.json(), { error: "invalid_request" });
});

test("credentials, URL query values and backend exceptions stay out of responses and logs", async t => {
  let logs = "";
  const stream = new Writable({ write(chunk, _encoding, callback) { logs += chunk.toString(); callback(); } });
  const server = buildServer({ logStream: stream });
  t.after(() => server.close());
  server.get("/test-failure", async () => { throw new Error("backend-secret-value"); });
  const headers = { authorization: "Bearer worker-secret-value", cookie: "session=cookie-secret-value", "request-id": "injected-secret-value" };
  const response = await server.inject({ method: "GET", url: "/test-failure?token=query-secret-value", headers });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  const missing = await server.inject({ method: "GET", url: "/missing-secret-value", headers });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { error: "not_found" });
  for (const secret of ["worker-secret-value", "cookie-secret-value", "injected-secret-value", "query-secret-value", "backend-secret-value", "missing-secret-value"]) {
    assert.equal(logs.includes(secret), false);
  }
  assert.match(logs, /gateway_request_failed/);
});

test("publication failures log their operation without exposing backend messages", async t => {
  let logs = "";
  const stream = new Writable({ write(chunk, _encoding, callback) { logs += chunk.toString(); callback(); } });
  const server = buildServer({ logStream: stream });
  t.after(() => server.close());
  server.get("/publication-failure", async () => { throw new ArtifactOperationError("storage_upload"); });
  const response = await server.inject("/publication-failure");
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), { error: "internal_error" });
  assert.match(logs, /"operation":"storage_upload"/);
  assert.ok(!response.body.includes("storage_upload"));
});
