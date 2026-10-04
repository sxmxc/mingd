import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { BuildConfig, TemplateKind } from "@gdslimmer/build-config";
import { SUPPORTED_GODOT_VERSIONS } from "@gdslimmer/build-config";
import { runProcess } from "./process.js";

function findCompiledBinary(files: string[], config: BuildConfig, kind: TemplateKind, console = false): string | undefined {
  const platform = config.platform === "linux" ? "linuxbsd" : "windows";
  const needle = `${platform}.template_${kind}.${config.architecture}`;
  const candidates = files.filter((name) => name.includes(needle));

  if (config.platform === "windows") {
    const consoleCandidate = candidates.find((name) => name.includes("console") && name.endsWith(".exe"));
    if (console) return consoleCandidate;
    return candidates.find((name) => !name.includes("console") && name.endsWith(".exe"));
  }

  return candidates.find((name) => !name.endsWith(".txt"));
}

function validateLinuxBinaryHeader(header: Buffer, path: string) {
  if (header.length < 20 || header.subarray(0, 4).compare(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) !== 0) {
    throw new Error(`Compiled template is not an ELF executable: ${path}`);
  }
  if (header[4] !== 2 || header.readUInt16LE(18) !== 62) {
    throw new Error(`Compiled template is not a 64-bit x86_64 ELF executable: ${path}`);
  }
}

export async function packageArtifact(sourceDir: string, outputDir: string, config: BuildConfig): Promise<{ artifactPath: string; binarySizeBytes: number }> {
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
      await copyFile(sourcePath, join(packageDir, `linux_${kind}.${config.architecture}`));
    } else {
      await copyFile(join(binDir, built), join(packageDir, `windows_${kind}_${config.architecture}.exe`));
      const consoleBuilt = findCompiledBinary(files, config, kind, true);
      if (consoleBuilt) await copyFile(join(binDir, consoleBuilt), join(packageDir, `windows_${kind}_${config.architecture}_console.exe`));
    }
  }

  const version = SUPPORTED_GODOT_VERSIONS[config.godotVersion];
  await writeFile(join(packageDir, "version.txt"), `${version.versionIdentifier}\n`);
  await writeFile(join(packageDir, "README-gdslimmer.txt"), [
    "GDSlimmer custom Godot export template", "",
    `Godot: ${version.versionIdentifier}`,
    `Target: ${config.platform} ${config.architecture} template_${config.templateKinds.join(", template_")}`,
    "Install this TPZ with Godot's Export template manager, then export normally.",
  ].join("\n"));

  const artifact = join(outputDir, `gdslimmer-${config.godotVersion}-${config.platform}-${config.architecture}.tpz`);
  await runProcess("zip", ["-9", "-r", artifact, "."], { cwd: packageDir });
  await runProcess("unzip", ["-tqq", artifact]);
  const required = ["version.txt", "README-gdslimmer.txt", ...config.templateKinds.map((kind) => expectedPackageFilename(config, kind))];
  const names = (await readdir(packageDir)).sort();
  for (const name of required) if (!names.includes(name)) throw new Error(`Template package is missing required entry: ${name}`);
  const binaryPath = join(packageDir, expectedPackageFilename(config, config.templateKinds[0]));
  return { artifactPath: artifact, binarySizeBytes: (await stat(binaryPath)).size };
}

function expectedPackageFilename(config: BuildConfig, kind: TemplateKind) {
  return config.platform === "linux" ? `linux_${kind}.${config.architecture}` : `windows_${kind}_${config.architecture}.exe`;
}

export function artifactName(path: string) {
  return basename(path);
}
