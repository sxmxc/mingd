import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BuildConfig, TemplateKind } from "@mingd/build-config";
import { SUPPORTED_GODOT_VERSIONS, expectedTemplateFilename, expectedConsoleTemplateFilename, compiledTemplateFilename } from "@mingd/build-config";
import { runProcess } from "./process.js";

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

export async function packageArtifact(sourceDir: string, outputDir: string, config: BuildConfig, onPackaging: () => Promise<void> = async () => undefined): Promise<{ artifactPath: string; binarySizeBytes: number }> {
  const binDir = join(sourceDir, "bin");
  const files = await readdir(binDir);
  const packageDir = join(outputDir, "package");
  await mkdir(packageDir, { recursive: true });

  for (const kind of config.templateKinds) {
    const built = findCompiledBinary(files, config, kind);
    if (!built) throw new Error(`Could not locate compiled ${config.platform} ${kind} binary in ${binDir}. Found: ${files.join(", ")}`);

    if (config.platform === "linux") {
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
  }

  await onPackaging();
  const version = SUPPORTED_GODOT_VERSIONS[config.godotVersion];
  await writeFile(join(packageDir, "version.txt"), `${version.versionIdentifier}\n`);
  await writeFile(join(packageDir, "README-mingd.txt"), [
    "min.gd custom Godot export template", "",
    `Godot: ${version.versionIdentifier}`,
    `Target: ${config.platform} ${config.architecture} template_${config.templateKinds.join(", template_")}`,
    "Install this TPZ with Godot's Export template manager, or extract and select the release executable in the preset's Custom Template > Release field.",
    "This package contains release templates only. Disable Export With Debug. Keep the Windows console wrapper beside its main executable.",
  ].join("\n"));

  const artifact = join(outputDir, `mingd-${config.godotVersion}-${config.platform}-${config.architecture}-${config.templateKinds.join("-")}.tpz`);
  await runProcess("zip", ["-9", "-r", artifact, "."], { cwd: packageDir });
  await runProcess("unzip", ["-tqq", artifact]);
  const required = ["version.txt", "README-mingd.txt", ...config.templateKinds.flatMap((kind) => [
    expectedTemplateFilename(config, kind),
    ...(config.platform === "windows" ? [expectedConsoleTemplateFilename(config, kind)] : []),
  ])];
  const listing = await execFileAsync("unzip", ["-Z1", artifact], { maxBuffer: 16 * 1024 });
  const names = listing.stdout.trim().split("\n").sort();
  for (const name of required) if (!names.includes(name)) throw new Error(`Template package is missing required entry: ${name}`);
  const archivedVersion = await execFileAsync("unzip", ["-p", artifact, "version.txt"], { maxBuffer: 1024 });
  if (archivedVersion.stdout.trim() !== version.versionIdentifier) throw new Error("Template package version.txt does not match the requested Godot version.");
  const binaryPath = join(packageDir, expectedTemplateFilename(config, config.templateKinds[0]));
  return { artifactPath: artifact, binarySizeBytes: (await stat(binaryPath)).size };
}

export function artifactName(path: string) {
  return basename(path);
}
