import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("technical package names and workspace links use mingd without the brand period", () => {
  const manifest = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(manifest.name, "mingd");
  assert.equal(lock.name, "mingd");
  for (const [path, name] of [["apps/web", "web"], ["services/builder", "builder"], ["packages/build-config", "build-config"]]) {
    const workspace = JSON.parse(read(`${path}/package.json`));
    assert.equal(workspace.name, `@mingd/${name}`);
    assert.equal(lock.packages[`node_modules/@mingd/${name}`].resolved, path);
    if (name !== "build-config") assert.equal(workspace.dependencies["@mingd/build-config"], "*");
  }
  for (const value of Object.values(manifest.scripts)) assert.doesNotMatch(String(value), /@gdslimmer|@min\.gd/);
  assert.match(read("compose.yml"), /image: \$\{IMAGE_PREFIX:-mingd\}\/builder:\$\{IMAGE_TAG:-latest\}\s/);
  assert.match(read("services/builder/Dockerfile"), /@mingd\/builder/);
});

test("visible branding retains min.gd and Godot fixture success copy agrees with docs", () => {
  assert.match(read("apps/web/app/layout.tsx"), /title: "min\.gd"/);
  assert.match(read("apps/web/components/site-header.tsx"), /aria-label="min\.gd"/);
  assert.match(read("tests/fixtures/smoke-project/main.gd"), /min\.gd smoke test passed/);
  assert.match(read("docs/smoke-tests.md"), /min\.gd smoke test passed/);
});
