import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const publisher = fileURLToPath(new URL("../publish-images.mjs", import.meta.url));
const applicationServices = ["web", "maintenance", "builder", "web-builder", "android-builder", "macos-builder", "worker-gateway"];

function runPublisher(args, { missingImage = "", extraService = "" } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "mingd-publish-test-"));
  try {
    const callsPath = join(directory, "calls.jsonl");
    const services = Object.fromEntries([...applicationServices, ...(extraService ? [extraService] : [])].map(name => [name, {
      build: { context: "." }, image: `ghcr.io/example/mingd/${name}:latest`,
    }]));
    services.redis = { image: "redis:8-alpine" };
    writeFileSync(join(directory, "docker"), `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PUBLISH_TEST_CALLS, JSON.stringify(args) + "\\n");
if (args[0] === "compose") console.log(process.env.PUBLISH_TEST_CONFIG);
else if (args[0] === "image" && args[1] === "inspect") {
  if (process.env.PUBLISH_TEST_MISSING && args[2].includes("/" + process.env.PUBLISH_TEST_MISSING + ":")) process.exit(1);
  console.log("sha256:" + args[2].split("/").pop().split(":")[0]);
}
`, { mode: 0o755 });
    const result = spawnSync(process.execPath, [publisher, ...args], {
      encoding: "utf8",
      env: { ...process.env, PATH: directory + delimiter + process.env.PATH,
        PUBLISH_TEST_CALLS: callsPath, PUBLISH_TEST_CONFIG: JSON.stringify({ services }), PUBLISH_TEST_MISSING: missingImage },
      timeout: 10_000,
    });
    assert.ifError(result.error);
    const calls = readFileSync(callsPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
    return { ...result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("all publication pushes every application image, including gateway, before promoting latest", () => {
  const result = runPublisher(["--all", "v0.1.2"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Published 7 images/);
  const pushes = result.calls.filter(call => call[0] === "push").map(call => call[1]);
  assert.deepEqual(new Set(pushes.slice(0, 7)), new Set(applicationServices.map(name => `ghcr.io/example/mingd/${name}:v0.1.2`)));
  assert.deepEqual(new Set(pushes.slice(7)), new Set(applicationServices.map(name => `ghcr.io/example/mingd/${name}:latest`)));
  assert.equal(pushes.length, 14);
  assert.ok(result.calls.some(call => call[0] === "compose" && call.includes("*")));
});

test("all preflight discovers future Compose build services and never tags or pushes", () => {
  const result = runPublisher(["--all", "v0.1.2", "--dry-run"], { extraService: "future-worker" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Preflight passed for 8 images/);
  assert.match(result.stdout, /worker-gateway/);
  assert.match(result.stdout, /future-worker/);
  assert.equal(result.calls.filter(call => call[0] === "image" && call[1] === "inspect").length, 8);
  assert.ok(!result.calls.some(call => call[0] === "push" || call[1] === "tag"));
});

test("missing gateway image fails the entire preflight before any tags or pushes", () => {
  const result = runPublisher(["--all", "v0.1.2"], { missingImage: "worker-gateway" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /failed/);
  assert.ok(!result.calls.some(call => call[0] === "push" || call[1] === "tag"));
});

test("default publication includes gateway and excludes the optional macOS image", () => {
  const result = runPublisher(["v0.1.2", "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  const inspected = result.calls.filter(call => call[0] === "image" && call[1] === "inspect");
  assert.equal(inspected.length, 6);
  assert.ok(inspected.some(call => /worker-gateway/.test(call[2])));
  assert.ok(!inspected.some(call => /macos-builder|redis/.test(call[2])));
});
