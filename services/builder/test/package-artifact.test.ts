import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG, PRESETS } from "@mingd/build-config";
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

test("Linux Lean 2D packages original ELF bytes and reports packaging after validation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mingd-linux-package-"));
  try {
    const source = join(dir, "source");
    const output = join(dir, "output");
    await mkdir(join(source, "bin"), { recursive: true });
    await mkdir(output);
    const binary = Buffer.alloc(512);
    binary.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
    binary.writeUInt16LE(62, 18);
    const path = join(source, "bin", "godot.linuxbsd.template_release.x86_64");
    await writeFile(path, binary);
    let packaging = false;
    const result = await packageArtifact(source, output, { ...DEFAULT_BUILD_CONFIG, features: PRESETS.lean2d.features }, async () => { packaging = true; });
    assert.equal(packaging, true);
    assert.equal(result.binarySizeBytes, 512);
    assert.equal(basename(result.artifactPath), "mingd-4.7.2-linux-x86_64-release.tpz");
    assert.deepEqual(execFileSync("unzip", ["-p", result.artifactPath, "linux_release.x86_64"]), binary);
    binary.writeUInt16LE(3, 18);
    await writeFile(path, binary);
    packaging = false;
    await assert.rejects(packageArtifact(source, output, DEFAULT_BUILD_CONFIG, async () => { packaging = true; }), /x86_64 ELF/);
    assert.equal(packaging, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Windows package contains exact release filenames, version and original binaries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mingd-package-"));
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
    assert.equal(basename(result.artifactPath), "mingd-4.7.2-windows-x86_64-release.tpz");
    const names = execFileSync("unzip", ["-Z1", result.artifactPath], { encoding: "utf8" }).trim().split("\n").sort();
    assert.deepEqual(names, ["README-mingd.txt", "version.txt", "windows_release_x86_64.exe", "windows_release_x86_64_console.exe"]);
    assert.equal(execFileSync("unzip", ["-p", result.artifactPath, "version.txt"], { encoding: "utf8" }), "4.7.2.stable\n");
    assert.match(execFileSync("unzip", ["-p", result.artifactPath, "README-mingd.txt"], { encoding: "utf8" }), /min\.gd custom Godot export template/);
    assert.deepEqual(execFileSync("unzip", ["-p", result.artifactPath, "windows_release_x86_64.exe"]), await readFile(mainPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
