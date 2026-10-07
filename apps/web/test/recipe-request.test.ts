import assert from "node:assert/strict";
import test from "node:test";
import { recipeRequestAllowed } from "../lib/recipe-request.ts";

function request(origin: string, host = "mingd.example", headers: Record<string, string> = {}) {
  return new Request("http://0.0.0.0:3000/api/recipes", { method: "POST", headers: { origin, host, "content-type": "application/json", ...headers } });
}
test("recipe writes accept the public Host when standalone uses an internal request URL", () => {
  assert.ok(recipeRequestAllowed(request("https://mingd.example")));
  assert.ok(recipeRequestAllowed(request("http://192.168.1.20:3000", "192.168.1.20:3000"), "http://localhost:3000"));
  assert.ok(recipeRequestAllowed(request("https://mingd.example", "web:3000"), "https://mingd.example"));
  assert.ok(recipeRequestAllowed(request("https://mingd.example", "mingd.example", { "content-type": "Application/JSON; charset=utf-8" })));
});
test("recipe writes still reject cross-site origins, forged forwarding and non-JSON requests", () => {
  for (const origin of ["https://evil.example", "https://mingd.example.evil.example", "null", "https://mingd.example/path", "https://user@mingd.example", "https://mingd.example:8443"]) {
    assert.equal(recipeRequestAllowed(request(origin), "https://mingd.example"), false);
  }
  assert.equal(recipeRequestAllowed(request("https://evil.example", "mingd.example", { "x-forwarded-host": "evil.example" })), false);
  assert.equal(recipeRequestAllowed(request("https://mingd.example", "mingd.example", { "content-type": "text/plain" })), false);
  assert.equal(recipeRequestAllowed(request("https://evil.example", "mingd.example"), "invalid url"), false);
});
