import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG } from "@gdslimmer/build-config";
import { packageArtifact, validateWindowsBinary } from "../src/package-artifact.js";

function pe(console = false) {
  const binary = Buffer.alloc(512);
  binary.write("MZ");
  binary.writeUInt32LE(64, 0x3c);
  binary.write("PE\u0000\u0000", 64);
  binary.writeUInt16LE(0x8664, 68);
  binary.writeUInt16LE(0x20b, 88);
  binary.writeUInt16LE(console ? 3 : 2, 156);
  return binary;
}

test("Windows validation rejects wrong architecture, truncated files and wrong subsystem", () => {
  assert.doesNotThrow(() => validateWindowsBinary(pe(), "test.exe"));
  assert.throws(() => validateWindowsBinary(Buffer.alloc(0), "test.exe"));
  assert.throws(() => validateWindowsBinary(pe().subarray(0, 70), "test.exe"));
  const wrongArch = pe();
  wrongArch.writeUInt16LE(0x14c, 68);
  assert.throws(() => validateWindowsBinary(wrongArch, "test.exe"));
  assert.throws(() => validateWindowsBinary(pe(true), "test.exe"));
});

test("Windows package contains exact release filenames, version and original binaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gdslimmer-package-"));
  try {
    const source = join(dir, "source");
    const output = join(dir, "output");
    await mkdir(join(source, "bin"), { recursive: true });
    await mkdir(output);
    const mainPath = join(source, "bin", "godot.windows.template_release.x86_64.exe");
    await writeFile(mainPath, pe());
    await assert.rejects(packageArtifact(source, output, { ...DEFAULT_BUILD_CONFIG, platform: "windows" }), /console wrapper/);
    await writeFile(join(source, "bin", "godot.windows.template_release.x86_64.console.exe"), pe(true));
    const result = await packageArtifact(source, output, { ...DEFAULT_BUILD_CONFIG, platform: "windows" });
    assert.equal(result.binarySizeBytes, 512);
    const names = execFileSync("unzip", ["-Z1", result.artifactPath], { encoding: "utf8" }).trim().split("\n").sort();
    assert.deepEqual(names, ["README-gdslimmer.txt", "version.txt", "windows_release_x86_64.exe", "windows_release_x86_64_console.exe"]);
    assert.equal(execFileSync("unzip", ["-p", result.artifactPath, "version.txt"], { encoding: "utf8" }), "4.7.2.stable\n");
    assert.deepEqual(execFileSync("unzip", ["-p", result.artifactPath, "windows_release_x86_64.exe"]), await readFile(mainPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
