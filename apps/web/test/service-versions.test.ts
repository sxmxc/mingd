import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gatewayServiceVersion, WEB_IMAGE_TAG, WEB_SERVICE_VERSION } from "../lib/service-versions.ts";

test("web service version comes from its own package", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(WEB_SERVICE_VERSION, pkg.version);
  assert.equal(WEB_IMAGE_TAG, null);
});

test("gateway versions come from the live service without caching or forwarding credentials", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, options) => {
    calls++;
    assert.equal(String(input), "http://gateway.test:3001/healthz");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.headers, undefined);
    assert.ok(options?.signal);
    return Response.json({ status: "ok", serviceVersion: `0.2.${calls}`, imageTag: `v0.4.${calls}`, buildRecipeVersion: "11", protocolVersion: 1 });
  };
  const values = { WORKER_GATEWAY_INTERNAL_URL: "http://gateway.test:3001", SUPABASE_SECRET_KEY: "never-forward" };
  assert.equal((await gatewayServiceVersion(values, fetcher))?.serviceVersion, "0.2.1");
  assert.deepEqual(await gatewayServiceVersion(values, fetcher), { status: "ok", serviceVersion: "0.2.2", imageTag: "v0.4.2", buildRecipeVersion: "11" });
});

test("older version-reporting gateways remain compatible without an image tag", async () => {
  const body = { status: "ok", serviceVersion: "0.2.4", buildRecipeVersion: "11" };
  assert.deepEqual(await gatewayServiceVersion({}, async () => Response.json(body)), body);
  assert.equal(await gatewayServiceVersion({}, async () => Response.json({ ...body, imageTag: "bad/tag" })), null);
});

test("offline, older, malformed and misconfigured gateways report unavailable versions", async () => {
  assert.equal(await gatewayServiceVersion({}, async () => { throw new Error("connection failed"); }), null);
  for (const body of [{ status: "ok", protocolVersion: 1 }, { status: "ok", serviceVersion: "secret", buildRecipeVersion: "11" }]) {
    assert.equal(await gatewayServiceVersion({}, async () => Response.json(body)), null);
  }
  assert.equal(await gatewayServiceVersion({}, async () => new Response("", { status: 503 })), null);
  for (const url of ["file:///tmp/info", "http://user:secret@gateway.test", "http://gateway.test/path", "http://gateway.test?token=secret"]) {
    let calls = 0;
    assert.equal(await gatewayServiceVersion({ WORKER_GATEWAY_INTERNAL_URL: url }, async () => { calls++; return Response.json({}); }), null);
    assert.equal(calls, 0, "Invalid origins must not be fetched");
  }
});
