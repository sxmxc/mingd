import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertRealBuildSupported, buildArchitectures, workerTargetForPlatform, godotVersionIdentifier, normalizeBuildConfig, toSconsArgs, type BuildConfig } from "@mingd/build-config";
import type { CompilerRuntime } from "./compiler-runtime.js";
import { ensureGodotSource } from "./source-cache.js";
import { packageArtifact } from "./package-artifact.js";
import { runProcess } from "./process.js";
import { BuildPerformance, LinkObserver } from "./performance.js";
import { collectCacheDiagnostics, compilerCacheEnvironment } from "./cache-diagnostics.js";
import { verifyPlatformToolchain } from "./toolchain.js";
import { writeZip } from "./zip.js";

export type BuildStage = "preparing_source" | "verifying_source" | "preparing_workspace" | "compiling" | "linking" | "validating" | "packaging";

export async function compileBuild(
  buildId: string,
  rawConfig: unknown,
  logFile: string,
  runtime: CompilerRuntime,
  onStage: (stage: BuildStage) => Promise<void> = async () => undefined,
  onOutput?: (chunk: Buffer) => void,
  measurements = new BuildPerformance(),
  signal?: AbortSignal,
): Promise<{ artifactPath: string; binarySizeBytes: number; config: BuildConfig }> {
  const config = normalizeBuildConfig(rawConfig);
  signal?.throwIfAborted();
  if (!runtime.dryRun) assertRealBuildSupported(config);
  if (workerTargetForPlatform(config.platform) !== runtime.target) {
    throw new Error(`The ${runtime.target} worker cannot compile ${config.platform} jobs.`);
  }
  await onStage("preparing_source");
  const sourceCache = await ensureGodotSource(config.godotVersion, runtime.godotCacheDir, async () => onStage("verifying_source"), signal, onOutput);
  const jobDir = join(runtime.workDir, buildId);
  const sourceDir = join(jobDir, "source");
  const outputDir = join(jobDir, "output");
  await onStage("preparing_workspace");
  await rm(jobDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  // --reflink=auto is fast on CoW filesystems and safely falls back to a copy.
  await runProcess("cp", ["-a", "--reflink=auto", `${sourceCache}/.`, sourceDir], { signal, timeoutMs: 300_000, onOutput });

  if (runtime.dryRun) {
    await onStage("compiling");
    const packageDir = join(outputDir, "dry-run");
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "README.txt"), `min.gd dry-run artifact\n\n${JSON.stringify(config, null, 2)}\n`);
    await writeFile(join(packageDir, "version.txt"), `${godotVersionIdentifier(config.godotVersion)}\n`);
    const artifact = join(outputDir, `mingd-${buildId}-DRY-RUN.tpz`);
    await onStage("packaging");
    const packageFiles = await readdir(packageDir);
    await writeZip(artifact, await Promise.all(packageFiles.map(async (name) => ({
      name,
      contents: await readFile(join(packageDir, name)),
    }))));
    return { artifactPath: artifact, binarySizeBytes: 0, config };
  }

  await verifyPlatformToolchain(config, sourceDir);
  const statsLog = join(outputDir, "ccache-stats.log");
  const processEnv = compilerCacheEnvironment(sourceDir, runtime.ccacheDir, statsLog);

  let linkingStage: Promise<void> | null = null;
  let linkingError: unknown;
  try {
    for (const kind of config.templateKinds) for (const architecture of buildArchitectures(config)) {
      // Each template invocation has its own compile/link interval.
      await linkingStage;
      if (linkingError) throw linkingError;
      await onStage("compiling");
      const links = new LinkObserver(() => {
        measurements.markLinking();
        linkingStage = onStage("linking").catch(error => { linkingError = error; });
      });
      const args = ["-j", String(runtime.sconsJobs), ...toSconsArgs({ ...config, architecture }, kind)];
      await runProcess("scons", args, {
        cwd: sourceDir, env: processEnv, logFile, timeoutMs: runtime.compileTimeoutMs, signal,
        onOutput: chunk => { onOutput?.(chunk); links.record(chunk); },
        resourceFile: join(outputDir, `resources-${kind}-${architecture}.txt`),
        onPeakRss: value => measurements.recordPeak(value),
      });
    }
    if (config.platform === "android") {
      await onStage("compiling");
      await runProcess("./gradlew", ["--no-daemon", "--max-workers", String(runtime.sconsJobs), "-Dorg.gradle.jvmargs=-Xmx1536m", "generateGodotTemplates"], {
        cwd: join(sourceDir, "platform/android/java"), env: processEnv, logFile,
        timeoutMs: runtime.compileTimeoutMs, onOutput, signal,
        resourceFile: join(outputDir, "resources-gradle.txt"), onPeakRss: value => measurements.recordPeak(value),
      });
    }
  } finally {
    await linkingStage;
    const diagnostics = await collectCacheDiagnostics(config.platform, statsLog, processEnv).catch(() => null);
    measurements.setCache(diagnostics);
  }
  if (linkingError) throw linkingError;
  signal?.throwIfAborted();

  await onStage("validating");
  // Report packaging only after the ELF/PE and wrapper checks succeed.
  const packaged = await packageArtifact(sourceDir, outputDir, config, () => onStage("packaging"));
  signal?.throwIfAborted();
  return { artifactPath: packaged.artifactPath, binarySizeBytes: packaged.binarySizeBytes, config };
}
