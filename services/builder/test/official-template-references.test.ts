import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { godotVersionIdentifier, officialTemplateReferenceTargets, validateTemplateReferenceMeasurements } from "@mingd/build-config";
import { missingTemplateReferenceVersions } from "../src/maintenance.js";
import { writeZip, type ZipEntry } from "../src/zip.js";

const script = fileURLToPath(new URL("../../../scripts/measure-official-templates.py", import.meta.url));
const execute = promisify(execFile);
const cpus = { arm64: 0x0100000c, x86_64: 0x01000007 };
function thin(cpu: number, size: number) {
  const bytes = Buffer.alloc(size); bytes.writeUInt32LE(0xfeedfacf); bytes.writeUInt32LE(cpu, 4); bytes.writeUInt32LE(2, 12); return bytes;
}
function fat(wide: boolean) {
  const bytes = Buffer.alloc(320);
  bytes.writeUInt32BE(wide ? 0xcafebabf : 0xcafebabe); bytes.writeUInt32BE(2, 4);
  for (const [i, cpu, offset, size] of [[0, cpus.arm64, 80, 64], [1, cpus.x86_64, 192, 96]]) {
    const position = 8 + i * (wide ? 32 : 20); bytes.writeUInt32BE(cpu, position);
    if (wide) { bytes.writeBigUInt64BE(BigInt(offset), position + 8); bytes.writeBigUInt64BE(BigInt(size), position + 16); }
    else { bytes.writeUInt32BE(offset, position + 8); bytes.writeUInt32BE(size, position + 12); }
    thin(cpu, size).copy(bytes, offset);
  }
  return bytes;
}
async function fixture(dir: string, mutate?: (entries: ZipEntry[]) => void) {
  const entries: ZipEntry[] = [{ name: "templates/version.txt", contents: Buffer.from("4.7.2.stable\n") }];
  for (const kind of ["debug", "release"]) {
    const pe = Buffer.alloc(256); pe.write("MZ"); pe.writeUInt32LE(64, 60); pe.write("PE\0\0", 64); pe.writeUInt16LE(0x8664, 68); pe.writeUInt16LE(0x20b, 88); pe.writeUInt16LE(2, 156);
    entries.push({ name: `templates/windows_${kind}_x86_64.exe`, contents: pe });
    const elf = Buffer.alloc(80); elf.set([127, 69, 76, 70, 2, 1]); elf.writeUInt16LE(62, 18);
    entries.push({ name: `templates/linux_${kind}.x86_64`, contents: elf });
    const wasm = join(dir, `wasm-${kind}.zip`);
    await writeZip(wasm, [{ name: "godot.wasm", contents: Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 1]) }]);
    entries.push({ name: `templates/web_${kind}.zip`, contents: await readFile(wasm) }, { name: `templates/web_nothreads_${kind}.zip`, contents: await readFile(wasm) });
    const libraries: ZipEntry[] = [];
    for (const [abi, elfClass, machine, size] of [["arm64-v8a", 2, 183, 100], ["armeabi-v7a", 1, 40, 110], ["x86_64", 2, 62, 120], ["x86", 1, 3, 130]] as const) {
      const library = Buffer.alloc(size); library.set([127, 69, 76, 70, elfClass, 1]); library.writeUInt16LE(3, 16); library.writeUInt16LE(machine, 18);
      libraries.push({ name: `lib/${abi}/libgodot_android.so`, contents: library }, { name: `lib/${abi}/libc++_shared.so`, contents: Buffer.alloc(300) });
    }
    const apk = join(dir, `android-${kind}.apk`); await writeZip(apk, libraries);
    entries.push({ name: `templates/android_${kind}.apk`, contents: await readFile(apk) });
  }
  const macos = join(dir, "macos.zip");
  await writeZip(macos, ["debug", "release"].map(kind => ({ name: `macos_template.app/Contents/MacOS/godot_macos_${kind}.universal`, contents: fat(kind === "debug") })));
  entries.push({ name: "templates/macos.zip", contents: await readFile(macos) });
  mutate?.(entries);
  const archive = join(dir, "official.tpz"); await writeZip(archive, entries); return archive;
}
async function measure(archive: string, version = "4.7.2") {
  const { stdout } = await execute("python3", [script, archive, godotVersionIdentifier(version), JSON.stringify(officialTemplateReferenceTargets(version))], { timeout: 10000 });
  return validateTemplateReferenceMeasurements(version, JSON.parse(stdout));
}

test("official fixtures measure all architectures and both kinds without counting wrappers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mingd-reference-fixture-"));
  try {
    const rows = await measure(await fixture(dir));
    assert.equal(rows.length, 22);
    assert.deepEqual(rows.filter(row => row.platform === "android").map(row => row.binary_size_bytes), [100, 100, 110, 110, 120, 120, 130, 130]);
    assert.deepEqual(rows.filter(row => row.platform === "macos").map(row => row.binary_size_bytes), [320, 320, 64, 64, 96, 96]);
    // Both FAT32 and FAT64 entries produce slice lengths, not universal lengths.
    assert.deepEqual(missingTemplateReferenceVersions([{ id: "4.7.2" }], rows.map(row => ({ ...row, godot_version: "4.7.2" }))), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("base stable releases use the official identifier without a synthetic zero patch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mingd-reference-base-release-"));
  try {
    const archive = await fixture(dir, entries => {
      entries.find(entry => entry.name === "templates/version.txt")!.contents = Buffer.from("4.7.stable\n");
    });
    const rows = await measure(archive, "4.7");
    assert.equal(rows.length, 8);
    await assert.rejects(execute("python3", [script, archive, "4.7.0.stable", JSON.stringify(officialTemplateReferenceTargets("4.7"))]), /version.txt/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("desktop-only references trigger Android/macOS backfill while older supported releases remain complete", () => {
  const old = officialTemplateReferenceTargets("4.5").map(row => ({ ...row, godot_version: "4.5" }));
  const desktop = officialTemplateReferenceTargets("4.7.2").filter(row => !["android", "macos"].includes(row.platform)).map(row => ({ ...row, godot_version: "4.7.2" }));
  assert.equal(old.length, 8);
  assert.deepEqual(missingTemplateReferenceVersions([{ id: "4.5" }, { id: "4.7.2" }], [...old, ...desktop]), [{ id: "4.7.2" }]);
  const complete = officialTemplateReferenceTargets("4.6.3").map(row => ({ ...row, godot_version: "4.6.3" }));
  assert.deepEqual(missingTemplateReferenceVersions([{ id: "4.6.3" }], complete.slice(1)), [{ id: "4.6.3" }]);
});

test("measurement script rejects missing Android/macOS entries and mismatched archive versions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mingd-reference-invalid-"));
  try {
    for (const missing of ["templates/android_release.apk", "templates/macos.zip"]) {
      const archive = await fixture(dir, entries => entries.splice(entries.findIndex(entry => entry.name === missing), 1));
      await assert.rejects(measure(archive), /Missing, duplicate or oversized/);
    }
    const archive = await fixture(dir);
    await assert.rejects(measure(archive, "4.6.3"), /version.txt/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Android ELF and macOS fat validation reject corrupt architecture and slice bounds", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mingd-reference-headers-"));
  const cases = [
    "android_size(z, 'arm64')", "macos_sizes(z, 'release')",
  ];
  try {
    for (const [index, call] of cases.entries()) {
      const path = join(dir, `${index}.zip`);
      const contents = index ? fat(false) : Buffer.alloc(100);
      if (index) contents.writeUInt32BE(8192, 16); // First slice extends beyond the file.
      await writeZip(path, [{ name: index ? "macos_template.app/Contents/MacOS/godot_macos_release.universal" : "lib/arm64-v8a/libgodot_android.so", contents }]);
      const code = "import runpy,sys,zipfile; m=runpy.run_path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2]); " + `m[${JSON.stringify(index ? "macos_sizes" : "android_size")}]` + call.slice(call.indexOf("("));
      await assert.rejects(execute("python3", ["-c", code, script, path]), /Expected official Android|Invalid official Mach-O/);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
