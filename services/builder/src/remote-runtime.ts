import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";
import { BUILD_RECIPE_VERSION, canonicalBuildCacheInput, normalizeBuildConfig, resolveGodotVersion, workerTargetForPlatform } from "@mingd/build-config";
import { WorkerHelloSchema, WORKER_HEARTBEAT_INTERVAL_MS, WORKER_LEASE_SECONDS, type Assignment, type BuildHeartbeat } from "@mingd/worker-protocol";
import { BuildActivity } from "./activity.js";
import { compileBuild } from "./compiler.js";
import { compilerRuntimeFromEnvironment } from "./compiler-runtime.js";
import { BuildPerformance } from "./performance.js";
import { GatewayError, RemoteClient } from "./remote-client.js";

function integer(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error("Invalid worker resource configuration.");
  return parsed;
}
export async function runRemoteWorker(values: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch, shutdown = new AbortController()) {
  const runtime = compilerRuntimeFromEnvironment(values);
  runtime.sconsJobs = integer(values.SCONS_JOBS, 4, 1, 256);
  runtime.compileTimeoutMs = integer(values.BUILDER_COMPILE_TIMEOUT_MS, 7_200_000, 60_000, 172_800_000);
  const concurrency = integer(values.BUILDER_CONCURRENCY, 1, 1, 16);
  const credential = (await readFile(values.WORKER_TOKEN_FILE ?? "/run/secrets/worker_token", "utf8")).trim();
  const client = new RemoteClient(values.WORKER_GATEWAY_URL ?? "https://worker.mingd.voidmoose.net", credential, transport);
  const release = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
  const toolchain = runtime.target === "macos" ? (await readFile(join(values.OSXCROSS_ROOT ?? "/opt/osxcross", "toolchain.sha256"), "utf8")).trim() : null;
  if (toolchain !== null && toolchain !== values.MACOS_TOOLCHAIN_SHA256) throw new Error("Worker toolchain identity mismatch.");
  const hello = WorkerHelloSchema.parse({ protocolVersion: 1, release, recipeVersion: BUILD_RECIPE_VERSION, target: runtime.target, toolchainSha256: toolchain });
  const running = new Set<Promise<void>>();
  const activeIds = new Set<string>();
  await mkdir(runtime.workDir, { recursive: true });
  // Each container has its own work volume. Remove abandoned per-delivery work.
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(runtime.workDir)) if (/^[0-9a-f-]{36}(?:\.log)?$/.test(entry)) await rm(join(runtime.workDir, entry), { recursive: true, force: true });

  async function execute(assignment: Assignment) {
    const controller = new AbortController();
    const stop = () => controller.abort(new Error("Worker stopping."));
    shutdown.signal.addEventListener("abort", stop, { once: true });
    if (shutdown.signal.aborted) stop();
    const activity = new BuildActivity([credential]);
    const measurements = new BuildPerformance();
    let stage: BuildHeartbeat["stage"] = "preparing_source";
    let deadline = performance.now() + (WORKER_LEASE_SECONDS - 15) * 1000;
    let finished = false;
    let completed = false;
    let uploading = false;
    let fatal = false;
    let heartbeatChain = Promise.resolve();
    const heartbeat = () => {
      heartbeatChain = heartbeatChain.then(async () => {
        if (finished || controller.signal.aborted) return;
        const snapshot = activity.snapshot();
        const sentAt = performance.now();
        try {
          await client.heartbeat({ protocolVersion: 1, assignmentId: assignment.assignmentId, stage, logTail: snapshot.log_tail,
            lastOutputAt: snapshot.last_output_at, outputBytes: snapshot.output_bytes, metrics: measurements.snapshot() }, controller.signal);
          deadline = sentAt + (WORKER_LEASE_SECONDS - 5) * 1000;
        } catch (error) {
          if (error instanceof GatewayError && error.fatal) { fatal = true; shutdown.abort(); controller.abort(); return; }
          if (error instanceof GatewayError && error.status === 410) {
            if (uploading) {
              try { completed = !!(await client.status(assignment.assignmentId)).artifactId; } catch { /* Keep the conservative deadline. */ }
              if (completed) { finished = true; return; }
            }
            controller.abort(new Error("Assignment lost."));
          } else if (performance.now() >= deadline) controller.abort(new Error("Lease could not be renewed."));
        }
      });
      return heartbeatChain;
    };
    const timer = setInterval(() => { void heartbeat(); }, WORKER_HEARTBEAT_INTERVAL_MS);
    const watchdog = setInterval(() => { if (!finished && performance.now() >= deadline) controller.abort(new Error("Worker lease expired.")); }, 1000);
    const logFile = join(runtime.workDir, `${assignment.assignmentId}.log`);
    try {
      if (assignment.release !== hello.release || assignment.recipeVersion !== hello.recipeVersion) throw new Error("Assignment version mismatch.");
      const config = normalizeBuildConfig(assignment.config);
      if (workerTargetForPlatform(config.platform) !== runtime.target) throw new Error("Assignment target mismatch.");
      const source = await resolveGodotVersion(config.godotVersion);
      const hash = createHash("sha256").update(canonicalBuildCacheInput(config, source, toolchain ?? undefined)).digest("hex");
      if (hash !== assignment.configHash) throw new Error("Assignment recipe integrity mismatch.");
      await heartbeat(); controller.signal.throwIfAborted();
      const compiled = await compileBuild(assignment.assignmentId, config, logFile, { ...runtime, dryRun: assignment.dryRun }, async nextStage => {
        stage = nextStage; measurements.transition(stage); await heartbeat(); controller.signal.throwIfAborted();
      }, chunk => activity.record(chunk), measurements, controller.signal);
      stage = "uploading"; measurements.transition(stage); uploading = true;
      await heartbeat(); controller.signal.throwIfAborted();
      const size = (await stat(compiled.artifactPath)).size;
      const digest = createHash("sha256");
      for await (const chunk of createReadStream(compiled.artifactPath)) { controller.signal.throwIfAborted(); digest.update(chunk); }
      const sha256 = digest.digest("hex");
      while (!completed) {
        controller.signal.throwIfAborted();
        try { await client.upload(assignment.assignmentId, compiled.artifactPath, sha256, size, controller.signal); completed = true; }
        catch (error) {
          // The response can be lost after a successful transactional commit.
          try { completed = !!(await client.status(assignment.assignmentId)).artifactId; } catch { /* Retry only while the lease remains live. */ }
          if (completed) break;
          if (error instanceof GatewayError && error.fatal) { fatal = true; shutdown.abort(); throw error; }
          if (error instanceof GatewayError && [400, 410, 413, 415, 422].includes(error.status)) throw error;
          await pause(5000, undefined, { signal: controller.signal });
        }
      }
      console.log(JSON.stringify({ event: "worker_build_complete", assignmentId: assignment.assignmentId }));
    } catch {
      if (!completed && !fatal && !controller.signal.aborted) await client.fail(assignment.assignmentId).catch(() => undefined);
      console.error(JSON.stringify({ event: "worker_build_interrupted", assignmentId: assignment.assignmentId }));
    } finally {
      finished = true; clearInterval(timer); clearInterval(watchdog);
      controller.abort(); await heartbeatChain;
      shutdown.signal.removeEventListener("abort", stop);
      await rm(join(runtime.workDir, assignment.assignmentId), { recursive: true, force: true });
      await rm(logFile, { force: true });
    }
  }
  while (!shutdown.signal.aborted) {
    try {
      if (running.size < concurrency) {
        const assignment = await client.next(hello, shutdown.signal);
        if (assignment && !activeIds.has(assignment.assignmentId)) {
          activeIds.add(assignment.assignmentId);
          const task = execute(assignment).finally(() => { running.delete(task); activeIds.delete(assignment.assignmentId); });
          running.add(task); continue;
        }
      }
      await pause(5000, undefined, { signal: shutdown.signal });
    } catch (error) {
      if (shutdown.signal.aborted) break;
      if (error instanceof GatewayError && error.fatal) { shutdown.abort(); await Promise.allSettled(running); throw new Error("Worker enrollment or version rejected."); }
      console.error(JSON.stringify({ event: "worker_gateway_unavailable" }));
      await pause(5000, undefined, { signal: shutdown.signal }).catch(() => undefined);
    }
  }
  await Promise.allSettled(running);
}
