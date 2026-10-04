import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertRealBuildSupported, normalizeBuildConfig, toSconsArgs, type BuildConfig } from "@gdslimmer/build-config";
import { env } from "./env.js";
import { ensureGodotSource } from "./source-cache.js";
import { packageArtifact } from "./package-artifact.js";
import { runProcess } from "./process.js";

export type BuildStage = "preparing_source" | "verifying_source" | "preparing_workspace" | "compiling" | "validating" | "packaging";

export async function compileBuild(
  buildId: string,
  rawConfig: unknown,
  logFile: string,
  onStage: (stage: BuildStage) => Promise<void> = async () => undefined,
): Promise<{ artifactPath: string; binarySizeBytes: number; config: BuildConfig }> {
  const config = normalizeBuildConfig(rawConfig);
  if (!env.dryRun) assertRealBuildSupported(config);
  await onStage("preparing_source");
  const sourceCache = await ensureGodotSource(config.godotVersion, async () => onStage("verifying_source"));
  const jobDir = join(env.workDir, buildId);
  const sourceDir = join(jobDir, "source");
  const outputDir = join(jobDir, "output");
  await onStage("preparing_workspace");
  await rm(jobDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  // --reflink=auto is fast on CoW filesystems and safely falls back to a copy.
  await runProcess("cp", ["-a", "--reflink=auto", `${sourceCache}/.`, sourceDir]);

  if (env.dryRun) {
    const packageDir = join(outputDir, "dry-run");
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "README.txt"), `gdslimmer dry-run artifact\n\n${JSON.stringify(config, null, 2)}\n`);
    await writeFile(join(packageDir, "version.txt"), `${config.godotVersion}.stable\n`);
    const artifact = join(outputDir, `gdslimmer-${buildId}-DRY-RUN.tpz`);
    await runProcess("zip", ["-9", "-r", artifact, "."], { cwd: packageDir });
    return { artifactPath: artifact, binarySizeBytes: 0, config };
  }

  const processEnv = {
    ...process.env,
    CCACHE_DIR: env.ccacheDir,
    PATH: `/usr/lib/ccache:${process.env.PATH ?? ""}`,
  };

  await onStage("compiling");
  for (const kind of config.templateKinds) {
    const args = ["-j", String(env.sconsJobs), ...toSconsArgs(config, kind)];
    await runProcess("scons", args, { cwd: sourceDir, env: processEnv, logFile, timeoutMs: env.compileTimeoutMs });
  }

  await onStage("validating");
  // packageArtifact verifies the ELF header before it creates the archive.
  await onStage("packaging");
  const packaged = await packageArtifact(sourceDir, outputDir, config);
  return { artifactPath: packaged.artifactPath, binarySizeBytes: packaged.binarySizeBytes, config };
}
