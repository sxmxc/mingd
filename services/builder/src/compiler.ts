import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertRealBuildSupported, normalizeBuildConfig, toSconsArgs, type BuildConfig } from "@mingd/build-config";
import { env } from "./env.js";
import { ensureGodotSource } from "./source-cache.js";
import { packageArtifact } from "./package-artifact.js";
import { runProcess } from "./process.js";
import { BuildPerformance, LinkObserver } from "./performance.js";
import { collectCacheDiagnostics, compilerCacheEnvironment } from "./cache-diagnostics.js";

export type BuildStage = "preparing_source" | "verifying_source" | "preparing_workspace" | "compiling" | "linking" | "validating" | "packaging";

export async function compileBuild(
  buildId: string,
  rawConfig: unknown,
  logFile: string,
  onStage: (stage: BuildStage) => Promise<void> = async () => undefined,
  onOutput?: (chunk: Buffer) => void,
  measurements = new BuildPerformance(),
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
    await onStage("compiling");
    const packageDir = join(outputDir, "dry-run");
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "README.txt"), `min.gd dry-run artifact\n\n${JSON.stringify(config, null, 2)}\n`);
    await writeFile(join(packageDir, "version.txt"), `${config.godotVersion}.stable\n`);
    const artifact = join(outputDir, `mingd-${buildId}-DRY-RUN.tpz`);
    await onStage("packaging");
    await runProcess("zip", ["-9", "-r", artifact, "."], { cwd: packageDir });
    return { artifactPath: artifact, binarySizeBytes: 0, config };
  }

  const statsLog = join(outputDir, "ccache-stats.log");
  const processEnv = compilerCacheEnvironment(sourceDir, env.ccacheDir, statsLog);

  await onStage("compiling");
  let linkingStage: Promise<void> | null = null;
  let linkingError: unknown;
  const links = new LinkObserver(() => {
    measurements.markLinking();
    linkingStage = onStage("linking").catch(error => { linkingError = error; });
  });
  try {
    for (const kind of config.templateKinds) {
      const args = ["-j", String(env.sconsJobs), ...toSconsArgs(config, kind)];
      await runProcess("scons", args, {
        cwd: sourceDir, env: processEnv, logFile, timeoutMs: env.compileTimeoutMs,
        onOutput: chunk => { onOutput?.(chunk); links.record(chunk); },
        resourceFile: join(outputDir, `resources-${kind}.txt`),
        onPeakRss: value => measurements.recordPeak(value),
      });
    }
  } finally {
    await linkingStage;
    const diagnostics = await collectCacheDiagnostics(config.platform, statsLog, processEnv).catch(() => null);
    measurements.setCache(diagnostics);
  }
  if (linkingError) throw linkingError;

  await onStage("validating");
  // Report packaging only after the ELF/PE and wrapper checks succeed.
  const packaged = await packageArtifact(sourceDir, outputDir, config, () => onStage("packaging"));
  return { artifactPath: packaged.artifactPath, binarySizeBytes: packaged.binarySizeBytes, config };
}
