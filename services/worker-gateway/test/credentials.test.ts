import assert from "node:assert/strict";
import test from "node:test";
import { createWorkerCredential, hashWorkerCredential, parseWorkerAuthorization } from "../src/credentials.js";

test("enrollment produces independent revocable identities and stores only a digest", () => {
  const first = createWorkerCredential();
  const second = createWorkerCredential();
  assert.notEqual(first.workerId, second.workerId);
  assert.notEqual(first.credentialHash, second.credentialHash);
  assert.match(first.credentialHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(parseWorkerAuthorization(`Bearer ${first.credential}`), {
    workerId: first.workerId, credentialHash: first.credentialHash,
  });
  assert.equal(hashWorkerCredential(first.credential), first.credentialHash);
});

test("authorization parser rejects malformed, oversized and ambiguous credentials", () => {
  const { credential } = createWorkerCredential();
  for (const header of [undefined, "", credential, `Basic ${credential}`, `Bearer ${credential} `,
    `Bearer ${credential},${credential}`, `Bearer ${credential}\n`, "Bearer " + "x".repeat(200)]) {
    assert.equal(parseWorkerAuthorization(header), null);
  }
});
