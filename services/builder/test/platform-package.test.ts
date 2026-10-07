import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_BUILD_CONFIG, compiledTemplateFilename, normalizeBuildConfig } from "@mingd/build-config";
import { packageArtifact } from "../src/package-artifact.js";
import { androidAbi, validateAndroidLibrary, validateMacosBinary, validateMacosUniversalBinary } from "../src/platform-package.js";
import { writeZip } from "../src/zip.js";

function elf(arch: "arm64" | "arm32" | "x86_64" | "x86_32") {
  const binary = Buffer.alloc(512); binary.set([127, 69, 76, 70, arch === "arm32" || arch === "x86_32" ? 1 : 2, 1]);
  binary.writeUInt16LE(3, 16); binary.writeUInt16LE({ arm64: 183, arm32: 40, x86_64: 62, x86_32: 3 }[arch], 18); return binary;
}
function macho(arch: "arm64" | "x86_64") {
  const binary = Buffer.alloc(512); binary.writeUInt32LE(0xfeedfacf); binary.writeUInt32LE(arch === "arm64" ? 0x0100000c : 0x01000007, 4); binary.writeUInt32LE(2, 12); return binary;
}
test("new binary validation rejects wrong architecture, truncation and non-library ELF", () => {
  for (const arch of ["arm64", "arm32", "x86_64", "x86_32"] as const) {
    assert.doesNotThrow(() => validateAndroidLibrary(elf(arch), arch));
    assert.throws(() => validateAndroidLibrary(elf(arch).subarray(0, 20), arch));
  }
  assert.throws(() => validateAndroidLibrary(elf("x86_64"), "arm64"));
  const executable = elf("arm64"); executable.writeUInt16LE(2, 16);
  assert.throws(() => validateAndroidLibrary(executable, "arm64"));
  assert.doesNotThrow(() => validateMacosBinary(macho("arm64"), "arm64"));
  assert.throws(() => validateMacosBinary(macho("arm64"), "x86_64"));
  assert.throws(() => validateMacosBinary(Buffer.alloc(8), "arm64"));
});
test("Android packages APKs and matching Gradle AARs and counts native engine bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mingd-android-package-"));
  try {
    const source = join(dir, "source"); const output = join(dir, "output"); const bin = join(source, "bin");
    await mkdir(bin, { recursive: true }); await mkdir(output);
    const config = normalizeBuildConfig({ ...DEFAULT_BUILD_CONFIG, platform: "android", architecture: "arm64", templateKinds: ["release", "debug"] });
    const library = elf("arm64");
    const entries = ["build.gradle", "gradlew", "gradle/wrapper/gradle-wrapper.jar"].map(name => ({ name, contents: Buffer.from("fixture") }));
    for (const kind of config.templateKinds) {
      await writeZip(join(bin, `android_${kind}.apk`), [
        { name: "AndroidManifest.xml", contents: Buffer.from("manifest") }, { name: "classes.dex", contents: Buffer.from("dex") },
        { name: `lib/${androidAbi(config.architecture)}/libgodot_android.so`, contents: library }, { name: "lib/arm64-v8a/libc++_shared.so", contents: library },
      ]);
      const aar = join(output, `${kind}.aar`);
      await writeZip(aar, [{ name: "jni/arm64-v8a/libgodot_android.so", contents: library }]);
      entries.push({ name: `libs/${kind}/godot-lib.template_${kind}.aar`, contents: await readFile(aar) });
    }
    await writeZip(join(bin, "android_source.zip"), entries);
    const result = await packageArtifact(source, output, config);
    assert.equal(result.binarySizeBytes, 1024);
    assert.ok(execFileSync("unzip", ["-Z1", result.artifactPath], { encoding: "utf8" }).includes("android_source.zip"));
    // Valid APK with a changed library must fail the APK/AAR consistency check.
    const changed = Buffer.from(library); changed[100] = 1;
    await writeZip(join(bin, "android_debug.apk"), [
      { name: "AndroidManifest.xml", contents: Buffer.from("manifest") }, { name: "classes.dex", contents: Buffer.from("dex") },
      { name: "lib/arm64-v8a/libgodot_android.so", contents: changed }, { name: "lib/arm64-v8a/libc++_shared.so", contents: library },
    ]);
    await assert.rejects(packageArtifact(source, output, config), /libraries differ/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("macOS nested bundle includes exact per-kind names, executable permissions and main binary sizes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mingd-macos-package-"));
  try {
    const source = join(dir, "source"); const output = join(dir, "output");
    await mkdir(join(source, "bin"), { recursive: true }); await mkdir(output);
    await mkdir(join(source, "misc/dist/macos_template.app/Contents"), { recursive: true });
    await writeFile(join(source, "misc/dist/macos_template.app/Contents/Info.plist"), "fixture");
    const config = normalizeBuildConfig({ ...DEFAULT_BUILD_CONFIG, platform: "macos", architecture: "arm64", templateKinds: ["release", "debug"] });
    for (const kind of config.templateKinds) await writeFile(join(source, "bin", compiledTemplateFilename(config, kind)), macho("arm64"));
    const result = await packageArtifact(source, output, config); assert.equal(result.binarySizeBytes, 1024);
    const nested = join(output, "checked.zip"); await writeFile(nested, execFileSync("unzip", ["-p", result.artifactPath, "macos.zip"]));
    const listing = execFileSync("unzip", ["-Z", "-v", nested], { encoding: "utf8" });
    assert.match(listing, /godot_macos_release.arm64/); assert.match(listing, /godot_macos_debug.arm64/); assert.match(listing, /100755/);
    await writeFile(join(source, "bin", compiledTemplateFilename(config, "debug")), macho("x86_64"));
    await assert.rejects(packageArtifact(source, output, config), /Mach-O/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("ZIP writer rejects traversal, absolute paths and duplicate names", async () => {
  for (const names of [["../escape"], ["/escape"], ["same", "same"]]) await assert.rejects(writeZip(join(tmpdir(), "mingd-invalid.zip"), names.map(name => ({ name, contents: Buffer.alloc(0) }))), /Unsafe/);
});

test("universal Mach-O validation requires both architectures and non-overlapping valid slices", () => {
  const fat = Buffer.alloc(1072); fat.writeUInt32BE(0xcafebabe); fat.writeUInt32BE(2, 4);
  for (const [i, arch] of (["arm64", "x86_64"] as const).entries()) {
    const entry = 8 + i * 20; const offset = 48 + i * 512;
    fat.writeUInt32BE(arch === "arm64" ? 0x0100000c : 0x01000007, entry);
    fat.writeUInt32BE(offset, entry + 8); fat.writeUInt32BE(512, entry + 12); macho(arch).copy(fat, offset);
  }
  assert.doesNotThrow(() => validateMacosUniversalBinary(fat));
  const overlapping = Buffer.from(fat); overlapping.writeUInt32BE(48, 36);
  assert.throws(() => validateMacosUniversalBinary(overlapping));
  const missing = Buffer.from(fat); missing.writeUInt32BE(1, 4);
  assert.throws(() => validateMacosUniversalBinary(missing));
  assert.throws(() => validateMacosUniversalBinary(fat.subarray(0, 100)));
});
