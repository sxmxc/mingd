import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG, templateArchiveFilename } from "../src/index.ts";

test("archive names identify the version, platform, architecture and included kinds", () => {
  const config = { ...DEFAULT_BUILD_CONFIG, godotVersion: "4.7.2", platform: "windows", templateKinds: ["release", "debug"] };
  assert.equal(templateArchiveFilename(config), "mingd-4.7.2-windows-x86_64-debug-release.tpz");
  assert.equal(templateArchiveFilename({ ...config, templateKinds: ["debug", "release"] }), templateArchiveFilename(config));
  assert.equal(templateArchiveFilename({ ...config, templateKinds: ["release"] }), "mingd-4.7.2-windows-x86_64-release.tpz");
  assert.equal(templateArchiveFilename({ ...config, platform: "web", architecture: "wasm32" }), "mingd-4.7.2-web-wasm32-debug-release.tpz");
});

test("archive names reject unvalidated filename fragments", () => {
  for (const field of ["godotVersion", "platform", "architecture"]) {
    assert.throws(() => templateArchiveFilename({ ...DEFAULT_BUILD_CONFIG, [field]: "../../other\r\nfile" }));
  }
  assert.throws(() => templateArchiveFilename({ ...DEFAULT_BUILD_CONFIG, templateKinds: ["../other"] }));
});
