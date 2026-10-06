import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gravatarUrl } from "../lib/avatar.ts";
import { safeAuthNext } from "../lib/auth-path.ts";
test("Gravatar normalizes email and uses a SHA-256 URL without exposing the address", () => {
  const hash = createHash("sha256").update("user@example.com").digest("hex");
  assert.equal(gravatarUrl("  User@Example.com  "), `https://www.gravatar.com/avatar/${hash}?s=80&d=mp&r=g`);
});
test("auth redirects allow recovery but reject external and unexpected destinations", () => {
  assert.equal(safeAuthNext("/account/reset-password"), "/account/reset-password");
  for (const url of [null, "//evil.example", "https://evil.example", "/admin", "/\\evil.example", "%2F%2Fevil.example"]) assert.equal(safeAuthNext(url), "/dashboard");
});
