import { execFile } from "node:child_process";
import { readFile, readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildArchitectures, compiledTemplateFilename, type BuildConfig, type TemplateKind } from "@mingd/build-config";
import { runProcess } from "./process.js";
import { writeZip, type ZipEntry } from "./zip.js";

const exec = promisify(execFile);
export function androidAbi(architecture: BuildConfig["architecture"]) {
  const abi = { arm64: "arm64-v8a", arm32: "armeabi-v7a", x86_64: "x86_64", x86_32: "x86" }[architecture as "arm64" | "arm32" | "x86_64" | "x86_32"];
  if (!abi) throw new Error("Unsupported Android architecture.");
  return abi;
}
export function validateAndroidLibrary(binary: Buffer, architecture: BuildConfig["architecture"]) {
  const expected = { arm64: [2, 183], arm32: [1, 40], x86_64: [2, 62], x86_32: [1, 3] }[architecture as "arm64" | "arm32" | "x86_64" | "x86_32"];
  if (!expected || binary.length < 64 || !binary.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) || binary[5] !== 1 || binary[4] !== expected[0] || binary.readUInt16LE(16) !== 3 || binary.readUInt16LE(18) !== expected[1]) throw new Error("Android template contains an invalid or wrong-architecture ELF shared library.");
}
export function validateMacosBinary(binary: Buffer, architecture: BuildConfig["architecture"]) {
  const cpu = architecture === "arm64" ? 0x0100000c : architecture === "x86_64" ? 0x01000007 : null;
  if (binary.length < 32 || binary.readUInt32LE(0) !== 0xfeedfacf || binary.readUInt32LE(4) !== cpu || binary.readUInt32LE(12) !== 2) throw new Error("macOS template contains an invalid or wrong-architecture Mach-O executable.");
}
export function validateMacosUniversalBinary(binary: Buffer) {
  const invalid = () => new Error("macOS universal template must contain valid ARM64 and x86_64 Mach-O slices.");
  if (binary.length < 8) throw invalid();
  const magic = binary.readUInt32BE(0);
  if (![0xcafebabe, 0xcafebabf].includes(magic) || binary.readUInt32BE(4) !== 2) throw invalid();
  const stride = magic === 0xcafebabf ? 32 : 20;
  const end = 8 + 2 * stride;
  if (binary.length < end) throw invalid();
  const found = new Set<number>(); const ranges: [number, number][] = [];
  for (let i = 0; i < 2; i++) {
    const entry = 8 + i * stride; const cpu = binary.readUInt32BE(entry);
    const offset = stride === 32 ? Number(binary.readBigUInt64BE(entry + 8)) : binary.readUInt32BE(entry + 8);
    const size = stride === 32 ? Number(binary.readBigUInt64BE(entry + 16)) : binary.readUInt32BE(entry + 12);
    if (![0x0100000c, 0x01000007].includes(cpu) || found.has(cpu) || !Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < end || size < 32 || offset + size > binary.length) throw invalid();
    found.add(cpu); ranges.push([offset, offset + size]);
    validateMacosBinary(binary.subarray(offset, offset + size), cpu === 0x0100000c ? "arm64" : "x86_64");
  }
  ranges.sort((a, b) => a[0] - b[0]);
  if (ranges[0][1] > ranges[1][0]) throw invalid();
}
export async function archiveNames(path: string): Promise<string[]> {
  await runProcess("unzip", ["-tqq", path], { timeoutMs: 30000 });
  const result = await exec("unzip", ["-Z1", path], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  const names = result.stdout.trim().split("\n");
  if (names.some(name => !name || name.startsWith("/") || name.includes("\\") || name.split("/").some(part => part === ".." || part === ".")) || new Set(names).size !== names.length) throw new Error("Template archive contains unsafe or duplicate paths.");
  return names;
}
async function archiveFile(path: string, name: string) {
  return (await exec("unzip", ["-p", path, name], { encoding: "buffer", timeout: 30000, maxBuffer: 512 * 1024 * 1024 })).stdout;
}
export async function validateAndroidApk(path: string, config: BuildConfig): Promise<number> {
  const names = await archiveNames(path);
  for (const required of ["AndroidManifest.xml", "classes.dex", `lib/${androidAbi(config.architecture)}/libgodot_android.so`, `lib/${androidAbi(config.architecture)}/libc++_shared.so`]) if (!names.includes(required)) throw new Error(`Android APK is missing ${required}.`);
  const natives = names.filter(name => /^lib\/[^/]+\/libgodot_android\.so$/.test(name));
  if (natives.length !== 1) throw new Error("Android APK must contain only its selected architecture.");
  const binary = await archiveFile(path, natives[0]);
  validateAndroidLibrary(binary, config.architecture);
  validateAndroidLibrary(await archiveFile(path, `lib/${androidAbi(config.architecture)}/libc++_shared.so`), config.architecture);
  return binary.length;
}
export async function validateAndroidSource(path: string, config: BuildConfig, apks: Map<TemplateKind, Buffer>) {
  const names = await archiveNames(path);
  for (const required of ["build.gradle", "gradlew", "gradle/wrapper/gradle-wrapper.jar"]) if (!names.includes(required)) throw new Error(`Android Gradle source is missing ${required}.`);
  for (const kind of config.templateKinds) {
    const name = `libs/${kind}/godot-lib.template_${kind}.aar`;
    if (!names.includes(name)) throw new Error(`Android Gradle source is missing ${name}.`);
    // Inspect the compiler-owned AAR in a private temporary output directory.
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(join(tmpdir(), "mingd-aar-"));
    try {
      const aarPath = join(dir, "library.aar");
      await writeFile(aarPath, await archiveFile(path, name));
      const aarNames = await archiveNames(aarPath);
      const libraryName = `jni/${androidAbi(config.architecture)}/libgodot_android.so`;
      if (!aarNames.includes(libraryName)) throw new Error("Android Gradle source AAR is missing its native library.");
      const library = await archiveFile(aarPath, libraryName);
      validateAndroidLibrary(library, config.architecture);
      if (!library.equals(apks.get(kind)!)) throw new Error("Android APK and Gradle source native libraries differ.");
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
}
export async function androidNativeLibrary(path: string, config: BuildConfig) {
  return archiveFile(path, `lib/${androidAbi(config.architecture)}/libgodot_android.so`);
}
async function bundleEntries(path: string, prefix: string): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  for (const name of (await readdir(path)).sort()) {
    const full = join(path, name); const info = await lstat(full);
    if (info.isSymbolicLink()) throw new Error("Unexpected symlink in macOS template skeleton.");
    if (info.isDirectory()) entries.push(...await bundleEntries(full, `${prefix}/${name}`));
    else if (info.isFile()) entries.push({ name: `${prefix}/${name}`, contents: await readFile(full), mode: 0o100644 });
  }
  return entries;
}
export async function packageMacosTemplate(sourceDir: string, outputDir: string, config: BuildConfig): Promise<{ path: string; bytes: number }> {
  const entries = await bundleEntries(join(sourceDir, "misc/dist/macos_template.app"), "macos_template.app");
  if (!entries.some(entry => entry.name === "macos_template.app/Contents/Info.plist")) throw new Error("macOS template skeleton is missing Info.plist.");
  let bytes = 0;
  for (const kind of config.templateKinds) {
    const paths: string[] = [];
    for (const architecture of buildArchitectures(config)) {
      const path = join(sourceDir, "bin", compiledTemplateFilename({ ...config, architecture }, kind));
      const binary = await readFile(path); validateMacosBinary(binary, architecture); paths.push(path);
    }
    let binary: Buffer;
    if (config.architecture === "universal") {
      const fat = join(outputDir, `macos-${kind}.universal`);
      await runProcess("lipo", ["-create", ...paths, "-output", fat], { timeoutMs: 30000 });
      await runProcess("lipo", ["-verify_arch", "arm64", "x86_64", fat], { timeoutMs: 30000 });
      binary = await readFile(fat);
      validateMacosUniversalBinary(binary);
    } else binary = await readFile(paths[0]);
    bytes += binary.length;
    entries.push({ name: `macos_template.app/Contents/MacOS/godot_macos_${kind}.${config.architecture}`, contents: binary, mode: 0o100755 });
  }
  const path = join(outputDir, "macos.zip");
  await writeZip(path, entries);
  await archiveNames(path);
  return { path, bytes };
}
