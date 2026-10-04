import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
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

export async function packageArtifact(sourceDir: string, outputDir: string, config: BuildConfig): Promise<string> {
  const binDir = join(sourceDir, "bin");
  const files = await readdir(binDir);
  const packageDir = join(outputDir, "package");
  await mkdir(packageDir, { recursive: true });

  for (const kind of config.templateKinds) {
    const built = findCompiledBinary(files, config, kind);
    if (!built) throw new Error(`Could not locate compiled ${config.platform} ${kind} binary in ${binDir}. Found: ${files.join(", ")}`);

    if (config.platform === "linux") {
      await copyFile(join(binDir, built), join(packageDir, `linux_${kind}.${config.architecture}`));
    } else {
      await copyFile(join(binDir, built), join(packageDir, `windows_${kind}_${config.architecture}.exe`));
      const consoleBuilt = findCompiledBinary(files, config, kind, true);
      if (consoleBuilt) await copyFile(join(binDir, consoleBuilt), join(packageDir, `windows_${kind}_${config.architecture}_console.exe`));
    }
  }

  const version = SUPPORTED_GODOT_VERSIONS[config.godotVersion];
  await writeFile(join(packageDir, "version.txt"), `${version.versionIdentifier}\n`);

  const artifact = join(outputDir, `gdslimmer-${config.godotVersion}-${config.platform}-${config.architecture}.tpz`);
  await runProcess("zip", ["-9", "-r", artifact, "."], { cwd: packageDir });
  return artifact;
}

export function artifactName(path: string) {
  return basename(path);
}
