import assert from "node:assert/strict";
import test from "node:test";
import { RemoteClient, GatewayError } from "../src/remote-client.js";
const token = `mingd_worker_00000000-0000-4000-8000-000000000001.${"a".repeat(43)}`;
const hello = { protocolVersion: 1 as const, release: "0.2.0", recipeVersion: "9", target: "desktop" as const, toolchainSha256: null };
test("remote transport refuses insecure origins, URL credentials and endpoint paths", () => {
  for (const origin of ["http://gateway.test", "https://user:secret@gateway.test", "https://gateway.test/path", "https://gateway.test?token=secret"]) assert.throws(() => new RemoteClient(origin, token));
});
test("remote poll authenticates only to the selected HTTPS origin and rejects redirects", async () => {
  const client = new RemoteClient("https://gateway.test", token, async (input, init) => {
    assert.equal(String(input), "https://gateway.test/v1/assignments/next");
    assert.equal(init?.redirect, "error");
    assert.equal((init?.headers as Record<string,string>).authorization, `Bearer ${token}`);
    return Response.json({ protocolVersion: 1, assignment: null });
  });
  assert.equal(await client.next(hello), null);
});
test("remote client rejects incompatible, oversized and unexpected responses", async () => {
  await assert.rejects(new RemoteClient("https://gateway.test",token, async () => new Response(null,{status:401})).next(hello), error => error instanceof GatewayError && error.fatal);
  await assert.rejects(new RemoteClient("https://gateway.test",token, async () => new Response("a".repeat(65537))).next(hello), /too large/);
  await assert.rejects(new RemoteClient("https://gateway.test",token, async () => Response.json({protocolVersion:2,assignment:null})).next(hello));
});
