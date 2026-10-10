import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const publisher = fileURLToPath(new URL("../publish-images.mjs", import.meta.url));
const applicationServices = ["web", "maintenance", "builder", "web-builder", "android-builder", "macos-builder", "worker-gateway"];

function scenario({ missingImage = "", failPush = false, failLatest = false, macosArchive = false, repository = "", source = "" } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "mingd-publish-test-"));
  const callsPath = join(directory, "calls.jsonl");
  const sourcesPath = join(directory, "sources.jsonl");
  const envPath = join(directory, ".env");
  writeFileSync(envPath, "# Existing operator configuration\nIMAGE_TAG=v0.2.2\nWEB_IMAGE_TAG=v0.2.4\nUNRELATED=value\n");
  for (const path of ['compose.web.prod.yml', 'compose.workers.prod.yml']) {
    writeFileSync(join(directory, path), applicationServices.map(service => {
      const key = service.toUpperCase().replaceAll('-', '_') + '_IMAGE_TAG';
      return `${service}: \${${key}:-\${IMAGE_TAG:-v0.2.3}}`;
    }).join('\n'));
  }
  if (macosArchive) {
    mkdirSync(join(directory, "toolchains"));
    writeFileSync(join(directory, "toolchains", "macos-toolchain.tar.xz"), "fixture");
  }
  writeFileSync(join(directory, "docker"), `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PUBLISH_TEST_CALLS, JSON.stringify(args) + "\\n");
if (args[0] === "compose" && args[1] === "build") fs.appendFileSync(process.env.PUBLISH_TEST_SOURCES, JSON.stringify(process.env.MINGD_IMAGE_SOURCE ?? null) + "\\n");
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
      writeFileSync(sourcesPath, "");
      const env = { ...process.env, PATH: directory + delimiter + process.env.PATH,
        PUBLISH_TEST_CALLS: callsPath, PUBLISH_TEST_SOURCES: sourcesPath, PUBLISH_TEST_MISSING: missingImage,
        PUBLISH_TEST_FAIL_PUSH: String(failPush), PUBLISH_TEST_FAIL_LATEST: String(failLatest) };
      for (const key of Object.keys(env)) if (key.endsWith("_IMAGE_TAG")) delete env[key];
      delete env.GITHUB_REPOSITORY; delete env.MINGD_IMAGE_SOURCE;
      if (repository) env.GITHUB_REPOSITORY = repository;
      if (source) env.MINGD_IMAGE_SOURCE = source;
      const result = spawnSync(process.execPath, [publisher, ...args], { cwd: directory, encoding: "utf8", env, timeout: 10_000 });
      assert.ifError(result.error);
      const calls = readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
      const sources = readFileSync(sourcesPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
      return { ...result, calls, sources, saved: readFileSync(envPath, "utf8") };
    },
    close() { rmSync(directory, { recursive: true, force: true }); },
  };
}

function run(args, options) {
  const fixture = scenario(options);
  try { return fixture.run(args); } finally { fixture.close(); }
}

test("build source labels follow the configured registry or GitHub repository, with explicit overrides", () => {
  for (const [options, expected] of [[{}, "https://github.com/example/mingd"], [{ repository: "fork-owner/custom-repo" }, "https://github.com/fork-owner/custom-repo"], [{ repository: "fork-owner/custom-repo", source: "https://example.test/source" }, "https://example.test/source"]]) {
    const result = run(["build", "web", "--", "v0.2.5"], options);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.sources, [expected]);
  }
});

test("publishing existing images promotes their individual versions to latest and remembers tags", () => {
  const fixture = scenario();
  try {
    const single = fixture.run(["publish", "web", "--", "v0.2.5"]);
    assert.equal(single.status, 0, single.stderr);
    assert.ok(!single.calls.some(call => call.includes("build")));
    assert.deepEqual(single.calls.filter(call => call[0] === "push"), [["push", "ghcr.io/example/mingd/web:v0.2.5"], ["push", "ghcr.io/example/mingd/web:latest"]]);
    assert.deepEqual(single.calls.filter(call => call[1] === "tag"), [["image", "tag", "sha256:fixture", "ghcr.io/example/mingd/web:latest"]]);
    assert.match(single.saved, /WEB_IMAGE_TAG=v0.2.5/);
    assert.match(single.saved, /UNRELATED=value/);
    const all = fixture.run(["publish", "all"]);
    assert.equal(all.status, 0, all.stderr);
    const pushes = all.calls.filter(call => call[0] === "push").map(call => call[1]);
    assert.deepEqual(pushes, applicationServices.flatMap(service => [
      `ghcr.io/example/mingd/${service}:${service === 'web' ? 'v0.2.5' : 'v0.2.2'}`,
      `ghcr.io/example/mingd/${service}:latest`,
    ]));
    assert.equal(all.calls.filter(call => call[1] === "tag").length, applicationServices.length);
    assert.ok(!all.calls.some(call => call.includes("build")));
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

test("all preflights required images before pushing and skips an unbuilt optional macOS image", () => {
  for (const selection of ["all", "worker-gateway"]) {
    const failure = run(["publish", selection, ...(selection === "all" ? [] : ["v0.2.5"])], { missingImage: "worker-gateway" });
    assert.equal(failure.status, 1);
    assert.ok(!failure.calls.some(call => call[0] === "push" || call.includes("tag") || call.includes("build")));
  }
  const optional = run(["publish", "all"], { missingImage: "macos-builder" });
  assert.equal(optional.status, 0, optional.stderr);
  assert.equal(optional.calls.filter(call => call[0] === "push").length, 12);
  assert.ok(!optional.calls.some(call => (call[0] === 'push' || call[1] === 'tag') && call.some(arg => arg.includes('/macos-builder:'))));
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

test("targeted push sends only the requested version without building or promoting latest", () => {
  const result = run(["push", "web", "--", "v0.2.5"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.filter(call => call[0] === "push"), [["push", "ghcr.io/example/mingd/web:v0.2.5"]]);
  assert.ok(!result.calls.some(call => call.includes("build") || call.includes("tag")));
  assert.match(result.saved, /WEB_IMAGE_TAG=v0.2.5/);
});


test("a failed version publication neither pushes latest nor records the new tag", () => {
  const result = run(["publish", "web", "v0.2.5"], { failPush: true });
  assert.equal(result.status, 1);
  assert.ok(!result.calls.some(call => call[0] === "push" && call[1].endsWith(":latest")));
  assert.ok(!result.calls.some(call => call.includes("tag") || call.includes("build")));
  assert.match(result.saved, /WEB_IMAGE_TAG=v0.2.4/);
});

test("a failed latest push reports failure without recording publication as complete", () => {
  const result = run(["publish", "web", "v0.2.5"], { failLatest: true });
  assert.equal(result.status, 1);
  assert.match(result.saved, /WEB_IMAGE_TAG=v0.2.4/);
  assert.doesNotMatch(result.stdout, /Completed publish/);
});

test("release builds and pushes preserve independent service versions", () => {
  const result = run(['build','all','--release']);
  assert.equal(result.status,0,result.stderr);
  assert.ok(result.calls.some(call=>call[0]==='compose' && call.includes('build')));
  assert.match(result.saved,/WEB_IMAGE_TAG=v0.2.4/);
  assert.match(result.saved,/WORKER_GATEWAY_IMAGE_TAG=v0.2.3/);
  assert.ok(!result.calls.some(call=>call[0]==='push'));
  const pushed = run(['push','all','--release']);
  assert.equal(pushed.status,0,pushed.stderr);
  assert.ok(pushed.calls.some(call=>call[0]==='push' && call[1]==='ghcr.io/example/mingd/web:v0.2.4'));
  assert.ok(pushed.calls.some(call=>call[0]==='push' && call[1]==='ghcr.io/example/mingd/worker-gateway:v0.2.3'));
  assert.ok(!pushed.calls.some(call=>call.includes('build') || call.includes('tag')));
  const published = run(['publish', 'all', '--release']);
  assert.equal(published.status, 0, published.stderr);
  assert.deepEqual(published.calls.filter(call => call[0] === 'push'), applicationServices.flatMap(service => [
    ['push', `ghcr.io/example/mingd/${service}:${service === 'web' ? 'v0.2.4' : 'v0.2.3'}`],
    ['push', `ghcr.io/example/mingd/${service}:latest`],
  ]));
  assert.ok(!published.calls.some(call => call.includes('build')));
});

test("explicit macOS inclusion builds a new image and requires its toolchain archive", () => {
  const absent = run(['build', 'all', '--release', '--include-macos']);
  assert.equal(absent.status, 1);
  assert.ok(!absent.calls.some(call => call.includes('build')));
  const present = run(['build', 'all', '--release', '--include-macos'], {
    missingImage: 'macos-builder', macosArchive: true,
  });
  assert.equal(present.status, 0, present.stderr);
  assert.ok(present.calls.some(call => call.includes('build') && call.includes('macos-builder')));
  assert.ok(!present.calls.some(call => call[0] === 'push'));
});

test('targeted release builds and pushes use the service version without updating other services', () => {
  const built = run(['build', 'web', '--release']);
  assert.equal(built.status, 0, built.stderr);
  assert.deepEqual(built.calls.filter(call => call.includes('build')), [['compose', 'build', 'web']]);
  assert.match(built.saved, /WEB_IMAGE_TAG=v0.2.4/);
  assert.doesNotMatch(built.saved, /WORKER_GATEWAY_IMAGE_TAG/);
  const pushed = run(['push', 'worker-gateway', '--release']);
  assert.equal(pushed.status, 0, pushed.stderr);
  assert.match(pushed.saved, /WORKER_GATEWAY_IMAGE_TAG=v0.2.3/);
  assert.ok(pushed.calls.some(call => call[0] === 'push' && call[1] === 'ghcr.io/example/mingd/worker-gateway:v0.2.3'));
  assert.match(pushed.saved, /WEB_IMAGE_TAG=v0.2.4/);
  assert.ok(!pushed.calls.some(call => call.includes('build')));
});
