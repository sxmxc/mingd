import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BuildConfig, TemplateKind } from "@mingd/build-config";
import { godotVersionIdentifier, expectedTemplateFilename, expectedConsoleTemplateFilename, compiledTemplateFilename } from "@mingd/build-config";
import { runProcess } from "./process.js";
import { writeZip } from "./zip.js";

const execFileAsync = promisify(execFile);

function findCompiledBinary(files: string[], config: BuildConfig, kind: TemplateKind, console = false): string | undefined {
  const expected = compiledTemplateFilename(config, kind, console);
  return files.includes(expected) ? expected : undefined;
}

export function validateWindowsBinary(binary: Buffer, path: string, console = false) {
  const invalid = () => new Error(`Compiled template is not a valid x86_64 PE32+ ${console ? "console" : "GUI"} executable: ${path}`);
  if (binary.length < 64 || binary.toString("ascii", 0, 2) !== "MZ") throw invalid();
  const offset = binary.readUInt32LE(0x3c);
  if (offset < 64 || offset + 94 > binary.length || binary.toString("ascii", offset, offset + 4) !== "PE\u0000\u0000") throw invalid();
  if (binary.readUInt16LE(offset + 4) !== 0x8664 || binary.readUInt16LE(offset + 24) !== 0x20b ||
      binary.readUInt16LE(offset + 92) !== (console ? 3 : 2)) throw invalid();
}

function validateLinuxBinaryHeader(header: Buffer, path: string) {
  if (header.length < 20 || header.subarray(0, 4).compare(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) !== 0) {
    throw new Error(`Compiled template is not an ELF executable: ${path}`);
  }
  if (header[4] !== 2 || header.readUInt16LE(18) !== 62) {
    throw new Error(`Compiled template is not a 64-bit x86_64 ELF executable: ${path}`);
  }
}

/** Validate the compiler-owned nested template without extracting its paths. */
async function validateWebTemplate(path: string): Promise<number> {
  await runProcess("unzip", ["-tqq", path], { timeoutMs: 30000 });
  const listing = await execFileAsync("unzip", ["-Z1", path], { timeout: 30000, maxBuffer: 16 * 1024 });
  const names = listing.stdout.trim().split("\n");
  if (names.some(name => name.includes("/") || name.includes("\\") || name === "..") || new Set(names).size !== names.length) {
    throw new Error("Web template must contain unique flat filenames.");
  }
  for (const name of ["godot.wasm", "godot.js", "godot.html", "godot.audio.worklet.js", "godot.audio.position.worklet.js", "godot.service.worker.js", "godot.offline.html"]) {
    if (!names.includes(name)) throw new Error(`Web template is missing ${name}.`);
  }
  const wasm = await execFileAsync("unzip", ["-p", path, "godot.wasm"], { encoding: "buffer", timeout: 30000, maxBuffer: 512 * 1024 * 1024 });
  if (wasm.stdout.length <= 8 || !wasm.stdout.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))) {
    throw new Error("Web template contains an invalid WebAssembly module.");
  }
  return wasm.stdout.length;
}

export async function packageArtifact(sourceDir: string, outputDir: string, config: BuildConfig, onPackaging: () => Promise<void> = async () => undefined): Promise<{ artifactPath: string; binarySizeBytes: number }> {
  const binDir = join(sourceDir, "bin");
  const files = await readdir(binDir);
  const packageDir = join(outputDir, "package");
  await mkdir(packageDir, { recursive: true });
  let binarySizeBytes = 0;

  for (const kind of config.templateKinds) {
    const built = findCompiledBinary(files, config, kind);
    if (!built) throw new Error(`Could not locate compiled ${config.platform} ${kind} binary in ${binDir}. Found: ${files.join(", ")}`);

    if (config.platform === "web") {
      binarySizeBytes += await validateWebTemplate(join(binDir, built));
      await copyFile(join(binDir, built), join(packageDir, expectedTemplateFilename(config, kind)));
    } else if (config.platform === "linux") {
      const sourcePath = join(binDir, built);
      const binary = await readFile(sourcePath);
      validateLinuxBinaryHeader(binary.subarray(0, 64), sourcePath);
      if (binary.length === 0) throw new Error(`Compiled template is empty: ${sourcePath}`);
      await copyFile(sourcePath, join(packageDir, expectedTemplateFilename(config, kind)));
    } else {
      validateWindowsBinary(await readFile(join(binDir, built)), built);
      await copyFile(join(binDir, built), join(packageDir, expectedTemplateFilename(config, kind)));
      const consoleBuilt = findCompiledBinary(files, config, kind, true);
      if (!consoleBuilt) throw new Error(`Could not locate compiled Windows ${kind} console wrapper.`);
      validateWindowsBinary(await readFile(join(binDir, consoleBuilt)), consoleBuilt, true);
      await copyFile(join(binDir, consoleBuilt), join(packageDir, expectedConsoleTemplateFilename(config, kind)));
    }
    if (config.platform !== "web") binarySizeBytes += (await stat(join(binDir, built))).size;
  }

  await onPackaging();
  const versionIdentifier = godotVersionIdentifier(config.godotVersion);
  await writeFile(join(packageDir, "version.txt"), `${versionIdentifier}\n`);
  await writeFile(join(packageDir, "README-mingd.txt"), [
    "min.gd custom Godot export template", "",
    `Godot: ${versionIdentifier}`,
    `Target: ${config.platform} ${config.architecture} template_${config.templateKinds.join(", template_")}`,
    "Install this TPZ with Godot's Export template manager, or extract and select the template in Custom Template > Release/Debug.",
    `Included template kinds: ${config.templateKinds.join(", ")}. Match Export With Debug to an included template.`,
    ...(config.platform === "web" ? [
      `Web: ${config.webThreads ? "threaded" : "single-threaded"}, WebGL 2 / Compatibility renderer, no GDExtension support.`,
      "Custom Template fields take the nested ZIP, not its extracted WebAssembly file. Match the export preset's Thread Support option.",
      ...(config.webThreads ? ["Hosting requires cross-origin isolation (COOP: same-origin, COEP: require-corp)."] : []),
    ] : ["Keep the Windows console wrapper beside its main executable."]),
  ].join("\n"));

  const artifact = join(outputDir, `mingd-${config.godotVersion}-${config.platform}-${config.architecture}-${config.templateKinds.join("-")}.tpz`);
  const packageFiles = await readdir(packageDir);
  await writeZip(artifact, await Promise.all(packageFiles.map(async (name) => ({
    name,
    contents: await readFile(join(packageDir, name)),
  }))));
  await runProcess("unzip", ["-tqq", artifact]);
  const required = ["version.txt", "README-mingd.txt", ...config.templateKinds.flatMap((kind) => [
    expectedTemplateFilename(config, kind),
    ...(config.platform === "windows" ? [expectedConsoleTemplateFilename(config, kind)] : []),
  ])];
  const listing = await execFileAsync("unzip", ["-Z1", artifact], { maxBuffer: 16 * 1024 });
  const names = listing.stdout.trim().split("\n").sort();
  for (const name of required) if (!names.includes(name)) throw new Error(`Template package is missing required entry: ${name}`);
  const archivedVersion = await execFileAsync("unzip", ["-p", artifact, "version.txt"], { maxBuffer: 1024 });
  if (archivedVersion.stdout.trim() !== versionIdentifier) throw new Error("Template package version.txt does not match the requested Godot version.");
  return { artifactPath: artifact, binarySizeBytes };
}

export function artifactName(path: string) {
  return basename(path);
}
