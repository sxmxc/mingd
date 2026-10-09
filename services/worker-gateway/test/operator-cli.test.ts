import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hashWorkerCredential } from "../src/credentials.js";

test("root npm enrollment resolves caller paths, protects existing tokens and reports safe failures", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "mingd-enroll-"));
  const tokens = join(directory, "worker-tokens");
  mkdirSync(tokens, { mode: 0o700 });
  const rows: Record<string, unknown>[] = [];
  let reject = false;
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      assert.equal(request.url, "/rest/v1/build_workers");
      rows.push(JSON.parse(body));
      response.writeHead(reject ? 403 : 201, { "Content-Type": "application/json" });
      response.end(reject ? JSON.stringify({ message: "sensitive-backend-message", code: "42501" }) : "");
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const run = (file: string) => new Promise<{ code: number | null; output: string }>((resolve, rejectRun) => {
    const child = spawn("npm", ["run", "workers", "--", "enroll", "--name", "test-desktop", "--target", "desktop", "--credential-file", file], {
      cwd: root,
      env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${address.port}`, SUPABASE_SECRET_KEY: "test-secret-never-log" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", rejectRun);
    child.on("close", code => resolve({ code, output }));
  });
  try {
    const file = join(tokens, "desktop.token");
    const result = await run(relative(root, file));
    assert.equal(result.code, 0, result.output);
    const credential = readFileSync(file, "utf8").trim();
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].credential_hash, hashWorkerCredential(credential));
    assert.ok(!result.output.includes(credential));
    assert.ok(!result.output.includes("test-secret-never-log"));

    const existing = await run(relative(root, file));
    assert.equal(existing.code, 1);
    assert.match(existing.output, /already exists; it was not overwritten/);
    assert.equal(readFileSync(file, "utf8").trim(), credential);
    assert.equal(rows.length, 1);

    const missing = await run(relative(root, join(directory, "missing", "desktop.token")));
    assert.equal(missing.code, 1);
    assert.match(missing.output, /parent directory does not exist/);
    assert.equal(rows.length, 1);

    reject = true;
    const rejectedFile = join(tokens, "rejected.token");
    const rejected = await run(relative(root, rejectedFile));
    assert.equal(rejected.code, 1);
    assert.match(rejected.output, /Backend enroll request failed. Credential file was preserved; worker ID:/);
    assert.ok(!rejected.output.includes("sensitive-backend-message"));
    assert.ok(!rejected.output.includes(readFileSync(rejectedFile, "utf8").trim()));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("bulk CLI drains and upgrades enabled workers without leaking tokens or changing revoked workers", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "mingd-bulk-cli-"));
  const ids = ["12345678-1234-4234-8234-123456789abc", "22345678-1234-4234-8234-123456789abc", "32345678-1234-4234-8234-123456789abc"];
  const rows = ids.map((id, index) => ({ id, name: `worker-${index}`, target: "desktop", software_release: "0.2.2",
    recipe_version: "9", toolchain_sha256: null, max_assignments: 1, disabled: index === 2, draining: false }));
  const updates: Record<string, unknown>[] = [];
  let active = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url!, "http://localhost");
    if (url.pathname.endsWith("worker_assignments")) {
      assert.equal(request.method, "HEAD");
      assert.equal(url.searchParams.get("state"), "eq.active");
      response.writeHead(200, { "Content-Range": `0-0/${active}` }); response.end(); return;
    }
    assert.ok(url.pathname.endsWith("build_workers"));
    if (request.method === "GET") {
      assert.equal(url.searchParams.get("disabled"), "eq.false");
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(rows.filter(row => !row.disabled))); return;
    }
    let body = ""; request.on("data", chunk => { body += chunk; });
    request.on("end", () => {
      const id = url.searchParams.get("id")!.slice(3);
      const row = rows.find(row => row.id === id)!;
      assert.ok(!row.disabled);
      const fields = JSON.parse(body); updates.push(fields);
      if (fields.credential_hash) {
        assert.equal(url.searchParams.get("draining"), "eq.true");
        assert.equal(url.searchParams.get("disabled"), "eq.false");
        assert.ok(row.draining);
      }
      Object.assign(row, fields);
      response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify({ id }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const run = (args: string[]) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn("npm", ["run", "workers", "--", ...args], { cwd: root,
      env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${address.port}`, SUPABASE_SECRET_KEY: "test-secret-never-log" },
      stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", reject); child.on("close", code => resolve({ code, output }));
  });
  try {
    const invalid = await run(["drain", "--all", "--id", ids[0]]);
    assert.equal(invalid.code, 1); assert.equal(updates.length, 0);
    const drained = await run(["drain", "--all", "--wait"]);
    assert.equal(drained.code, 0, drained.output); assert.equal(updates.length, 2);
    active = 1;
    const blocked = await run(["rotate", "--all", "--credential-dir", join(directory, "blocked")]);
    assert.equal(blocked.code, 1); assert.equal(updates.length, 2);
    active = 0;
    const target = join(directory, "upgraded");
    const upgraded = await run(["upgrade", "--all", "--credential-dir", target]);
    assert.equal(upgraded.code, 0, upgraded.output);
    assert.equal(updates.length, 4);
    for (const id of ids.slice(0, 2)) {
      const token = readFileSync(join(target, `${id}.token`), "utf8").trim();
      assert.ok(!upgraded.output.includes(token));
      assert.ok(updates.some(fields => fields.credential_hash === hashWorkerCredential(token)));
    }
    assert.equal(rows[2].recipe_version, "9"); assert.equal(rows[2].draining, false);
    assert.ok(!upgraded.output.includes("test-secret-never-log"));
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
