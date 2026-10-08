import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const publisher = fileURLToPath(new URL("../publish-images.mjs", import.meta.url));
const applicationServices = ["web", "maintenance", "builder", "web-builder", "android-builder", "macos-builder", "worker-gateway"];

function scenario({ missingImage = "", failPush = false, failLatest = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "mingd-publish-test-"));
  const callsPath = join(directory, "calls.jsonl");
  const envPath = join(directory, ".env");
  writeFileSync(envPath, "# Existing operator configuration\nIMAGE_TAG=v0.2.2\nWEB_IMAGE_TAG=v0.2.4\nUNRELATED=value\n");
  writeFileSync(join(directory, "docker"), `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PUBLISH_TEST_CALLS, JSON.stringify(args) + "\\n");
if (args[0] === "compose" && args.includes("config")) {
  const saved = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\\n").filter(line => line.includes("=")).map(line => line.split("=")));
  const services = Object.fromEntries(${JSON.stringify(applicationServices)}.map(name => {
    const key = name.toUpperCase().replaceAll("-", "_") + "_IMAGE_TAG";
    return [name, { build: { context: "." }, image: "ghcr.io/example/mingd/" + name + ":" + (process.env[key] || saved[key] || saved.IMAGE_TAG) }];
  }));
  services.redis = { image: "redis:8-alpine" };
  console.log(JSON.stringify({services}));
} else if (args[0] === "image" && args[1] === "inspect") {
  if (args[2].includes("/" + process.env.PUBLISH_TEST_MISSING + ":")) process.exit(1);
  console.log("sha256:fixture");
} else if (args[0] === "push" && (process.env.PUBLISH_TEST_FAIL_PUSH === "true" || (process.env.PUBLISH_TEST_FAIL_LATEST === "true" && args[1].endsWith(":latest")))) process.exit(1);
`, { mode: 0o755 });
  writeFileSync(join(directory, "npm"), `#!${process.execPath}
const fs = require("node:fs");
fs.appendFileSync(process.env.PUBLISH_TEST_CALLS, JSON.stringify(["npm", ...process.argv.slice(2)]) + "\\n");
`, { mode: 0o755 });
  return {
    run(args) {
      writeFileSync(callsPath, "");
      const env = { ...process.env, PATH: directory + delimiter + process.env.PATH,
        PUBLISH_TEST_CALLS: callsPath, PUBLISH_TEST_MISSING: missingImage,
        PUBLISH_TEST_FAIL_PUSH: String(failPush), PUBLISH_TEST_FAIL_LATEST: String(failLatest) };
      for (const key of Object.keys(env)) if (key.endsWith("_IMAGE_TAG")) delete env[key];
      const result = spawnSync(process.execPath, [publisher, ...args], { cwd: directory, encoding: "utf8", env, timeout: 10_000 });
      assert.ifError(result.error);
      const calls = readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
      return { ...result, calls, saved: readFileSync(envPath, "utf8") };
    },
    close() { rmSync(directory, { recursive: true, force: true }); },
  };
}

function run(args, options) {
  const fixture = scenario(options);
  try { return fixture.run(args); } finally { fixture.close(); }
}

test("publish all preserves the newer web version and never builds or retags", () => {
  const result = run(["publish", "all"]);
  assert.equal(result.status, 0, result.stderr);
  const pushes = result.calls.filter(call => call[0] === "push").map(call => call[1]);
  assert.equal(pushes.length, 7);
  assert.ok(pushes.includes("ghcr.io/example/mingd/web:v0.2.4"));
  assert.ok(pushes.includes("ghcr.io/example/mingd/builder:v0.2.2"));
  assert.ok(!result.calls.some(call => call.includes("tag") || call.includes("build")));
  assert.ok(!pushes.some(image => image.endsWith(":latest") || image.endsWith("web:v0.2.2")));
});

test("publishing one service builds only it and records its tag for the next publish all", () => {
  const fixture = scenario();
  try {
    const single = fixture.run(["publish", "web", "--", "v0.2.5"]);
    assert.equal(single.status, 0, single.stderr);
    assert.deepEqual(single.calls.filter(call => call.includes("build")), [["compose", "build", "web"]]);
    assert.deepEqual(single.calls.filter(call => call[0] === "push"), [["push", "ghcr.io/example/mingd/web:v0.2.5"], ["push", "ghcr.io/example/mingd/web:latest"]]);
    assert.deepEqual(single.calls.filter(call => call[1] === "tag"), [["image", "tag", "sha256:fixture", "ghcr.io/example/mingd/web:latest"]]);
    assert.match(single.saved, /WEB_IMAGE_TAG=v0.2.5/);
    assert.match(single.saved, /UNRELATED=value/);
    const all = fixture.run(["publish", "all"]);
    assert.equal(all.status, 0, all.stderr);
    assert.ok(all.calls.some(call => call[1] === "ghcr.io/example/mingd/web:v0.2.5"));
  } finally { fixture.close(); }
});

test("build and push use the same selection syntax and build records the tag", () => {
  const fixture = scenario();
  try {
    const build = fixture.run(["build", "builder", "--", "v0.2.3"]);
    assert.equal(build.status, 0, build.stderr);
    assert.ok(!build.calls.some(call => call[0] === "push"));
    assert.match(build.saved, /BUILDER_IMAGE_TAG=v0.2.3/);
    const push = fixture.run(["push", "all"]);
    assert.equal(push.status, 0, push.stderr);
    assert.ok(push.calls.some(call => call[1] === "ghcr.io/example/mingd/builder:v0.2.3"));
    assert.ok(!push.calls.some(call => call.includes("build")));
  } finally { fixture.close(); }
});

test("dry-run makes no build, push, tag, or configuration changes", () => {
  const result = run(["publish", "web", "v0.2.5", "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.calls.some(call => call.includes("build") || call[0] === "push" || call.includes("tag")));
  assert.match(result.saved, /WEB_IMAGE_TAG=v0.2.4/);
});

test("a failed push does not record the new tag", () => {
  const result = run(["publish", "web", "v0.2.5"], { failPush: true });
  assert.equal(result.status, 1);
  assert.match(result.saved, /WEB_IMAGE_TAG=v0.2.4/);
});

test("all preflights required images before pushing and skips an unbuilt optional macOS image", () => {
  const failure = run(["publish", "all"], { missingImage: "worker-gateway" });
  assert.equal(failure.status, 1);
  assert.ok(!failure.calls.some(call => call[0] === "push"));
  const optional = run(["publish", "all"], { missingImage: "macos-builder" });
  assert.equal(optional.status, 0, optional.stderr);
  assert.equal(optional.calls.filter(call => call[0] === "push").length, 6);
});

test("all rejects a shared version and unknown services never build or push", () => {
  for (const args of [["publish", "all", "v0.2.3"], ["push", "all", "--", "v0.2.3"], ["publish", "redis", "v0.2.3"], ["publish", "unknown", "v0.2.3"]]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.ok(!result.calls.some(call => call.includes("build") || call[0] === "push"));
  }
});


test("build without arguments preserves the application workspace build", () => {
  const result = run(["build"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [["npm", "run", "build", "--workspaces", "--if-present"]]);
});

test("build all builds configured services without pushing or changing their tags", () => {
  const result = run(["build", "all"], { missingImage: "macos-builder" });
  assert.equal(result.status, 0, result.stderr);
  const builds = result.calls.filter(call => call.includes("build"));
  assert.equal(builds.length, 1);
  assert.deepEqual(new Set(builds[0].slice(2)), new Set(applicationServices.filter(name => name !== "macos-builder")));
  assert.ok(!result.calls.some(call => call[0] === "push" || call.includes("tag")));
  assert.match(result.saved, /WEB_IMAGE_TAG=v0.2.4/);
});

test("targeted push never builds and pushes the requested tag before latest", () => {
  const result = run(["push", "web", "--", "v0.2.5"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.filter(call => call[0] === "push"), [["push", "ghcr.io/example/mingd/web:v0.2.5"], ["push", "ghcr.io/example/mingd/web:latest"]]);
  assert.ok(!result.calls.some(call => call.includes("build")));
  assert.match(result.saved, /WEB_IMAGE_TAG=v0.2.5/);
});


test("a failed version push never pushes latest", () => {
  const result = run(["push", "web", "v0.2.5"], { failPush: true });
  assert.equal(result.status, 1);
  assert.ok(!result.calls.some(call => call[0] === "push" && call[1].endsWith(":latest")));
});

test("a failed latest push reports failure without recording publication as complete", () => {
  const result = run(["publish", "web", "v0.2.5"], { failLatest: true });
  assert.equal(result.status, 1);
  assert.match(result.saved, /WEB_IMAGE_TAG=v0.2.4/);
  assert.doesNotMatch(result.stdout, /Completed publish/);
});
