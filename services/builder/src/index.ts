import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { Queue, Worker, type Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { BUILD_RECIPE_VERSION, canonicalBuildCacheInput, normalizeBuildConfig, resolveGodotVersion } from "@mingd/build-config";
import { env } from "./env.js";
import { compileBuild } from "./compiler.js";
import { BuildActivity, sanitizeLog } from "./activity.js";
import { BuildPerformance } from "./performance.js";
import { canProcessBuild, failureState } from "./recovery.js";

const supabase = createClient(env.supabaseUrl, env.supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type BuildJob = {
  buildId: string;
  userId: string;
  configHash: string;
  config: unknown;
};

function connectionFromUrl(urlString: string) {
  const url = new URL(urlString);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
}

async function updateBuild(buildId: string, patch: Record<string, unknown>) {
  let query = supabase.from("builds").update(patch).eq("id", buildId);
  // A late retry must not regress a successfully recorded result.
  if (patch.status !== "complete") query = query.neq("status", "complete");
  const { error } = await query;
  if (error) throw new Error(`Could not update build ${buildId}: ${error.message}`);
}

async function sha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
  });
}

async function processBuild(job: Job<BuildJob>) {
  const { buildId } = job.data;
  const record = await supabase.from("builds").select("user_id,config_hash,status").eq("id", buildId).maybeSingle();
  if (record.error) throw new Error("Build record could not be read.");
  if (!canProcessBuild(record.data, job.data.userId, job.data.configHash)) return;
  let config;
  let source;
  let configHash;
  try {
    config = normalizeBuildConfig(job.data.config);
    source = await resolveGodotVersion(config.godotVersion);
    configHash = createHash("sha256").update(canonicalBuildCacheInput(config, source)).digest("hex");
    if (configHash !== job.data.configHash) throw new Error("Build configuration hash does not match the queued payload.");
  } catch (error) {
    await updateBuild(buildId, { ...failureState(job.attemptsMade, job.opts.attempts ?? 1), error: sanitizeLog(String(error), [env.supabaseSecretKey, env.redisUrl]) });
    throw error;
  }
  const deliveryId = `${buildId}-${randomUUID()}`;
  const logFile = `${env.workDir}/${deliveryId}.log`;
  const activity = new BuildActivity([env.supabaseSecretKey, env.redisUrl]);
  const measurements = new BuildPerformance();
  await updateBuild(buildId, { status: "preparing_source", stage: job.attemptsStarted > 1 ? "Recovering interrupted build" : "Preparing source", progress: 0, error: null, completed_at: null, heartbeat_at: new Date().toISOString(), log_tail: null, performance_metrics: null });
  // A diagnostic archive must never occupy the real-template cache key or path.
  const artifactHash = env.dryRun ? createHash("sha256").update(`dry-run\n${configHash}`).digest("hex") : configHash;

  const { data: existing } = await supabase.from("artifacts").select("id").eq("config_hash", artifactHash).eq("is_dry_run", env.dryRun).maybeSingle();
  if (existing) {
    measurements.markArtifactCacheHit();
    await updateBuild(buildId, { performance_metrics: measurements.finish(), artifact_id: existing.id, status: "complete", stage: "Cached artifact", progress: 100, completed_at: new Date().toISOString() });
    return;
  }

  let pendingHeartbeat: Promise<void> | null = null;
  const heartbeat = setInterval(() => {
    if (pendingHeartbeat) return;
    pendingHeartbeat = Promise.resolve(supabase.from("builds").update({ ...activity.snapshot(), performance_metrics: measurements.snapshot() }).eq("id", buildId)
      .not("status", "in", "(complete,failed)")).then(({ error }) => {
        if (error) console.warn(`Build ${buildId}: activity update unavailable.`);
      }).catch(() => { console.warn(`Build ${buildId}: activity connection unavailable.`); }).finally(() => { pendingHeartbeat = null; });
  }, 10000);
  try {
    const updateStage = async (stage: import("./compiler.js").BuildStage) => {
      measurements.transition(stage);
      const details: Record<typeof stage, { progress: number; status: string; label: string }> = {
        preparing_source: { progress: 5, status: "preparing_source", label: "Preparing source cache" },
        verifying_source: { progress: 12, status: "verifying_source", label: "Verifying official source checksum" },
        preparing_workspace: { progress: 18, status: "preparing_workspace", label: "Preparing isolated workspace" },
        compiling: { progress: 25, status: "compiling", label: env.dryRun ? "Creating dry-run diagnostic" : "Compiling export template" },
        linking: { progress: 70, status: "compiling", label: "Linking export template" },
        validating: { progress: 78, status: "validating", label: "Validating compiled template" },
        packaging: { progress: 84, status: "packaging", label: "Packaging Godot template" },
      };
      const current = details[stage];
      await updateBuild(buildId, { ...activity.snapshot(), performance_metrics: measurements.snapshot(), status: current.status, stage: current.label, progress: current.progress, stage_started_at: new Date().toISOString(), ...(stage === "preparing_source" ? { started_at: new Date().toISOString() } : {}) });
      await job.updateProgress(current.progress);
    };
    const { artifactPath, binarySizeBytes } = await compileBuild(deliveryId, config, logFile, updateStage, (chunk) => activity.record(chunk), measurements);

    await updateBuild(buildId, { ...activity.snapshot(), performance_metrics: measurements.snapshot(), status: "packaging", stage: "Hashing packaged template", progress: 87 });
    const digest = await sha256(artifactPath);
    const size = (await stat(artifactPath)).size;

    // Immutable upload identity prevents retry/racing workers from overwriting
    // bytes whose metadata another worker has already committed.
    const storagePath = `${config.godotVersion}/${config.platform}/${artifactHash}/${digest}/${basename(artifactPath)}`;
    measurements.transition("uploading");
    await updateBuild(buildId, { ...activity.snapshot(), performance_metrics: measurements.snapshot(), status: "uploading", stage: "Uploading artifact", stage_started_at: new Date().toISOString(), progress: 92 });
    const bytes = await readFile(artifactPath);
    const { error: uploadError } = await supabase.storage.from(env.artifactBucket).upload(storagePath, bytes, {
      contentType: "application/zip",
      upsert: false,
    });

    if (uploadError && !uploadError.message.toLowerCase().includes("already exists")) {
      throw new Error(`Artifact upload failed: ${uploadError.message}`);
    }
    measurements.transition("recording_artifact");
    await updateBuild(buildId, { ...activity.snapshot(), performance_metrics: measurements.snapshot(), status: "uploading", stage: "Recording artifact metadata", stage_started_at: new Date().toISOString(), progress: 97 });

    const { data: artifact, error: artifactError } = await supabase.from("artifacts").upsert({
      config_hash: artifactHash,
      storage_path: storagePath,
      sha256: digest,
      size_bytes: size,
      godot_version: config.godotVersion,
      platform: config.platform,
      architecture: config.architecture,
      template_kinds: config.templateKinds,
      normalized_config: config,
      source_sha256: source.sourceSha256,
      build_recipe_version: BUILD_RECIPE_VERSION,
      binary_size_bytes: binarySizeBytes,
      is_dry_run: env.dryRun,
    }, { onConflict: "config_hash", ignoreDuplicates: true }).select("id").maybeSingle();
    if (artifactError) throw new Error(`Artifact metadata write failed: ${artifactError.message}`);
    const winner = artifact ?? (await supabase.from("artifacts").select("id").eq("config_hash", artifactHash).single()).data;
    if (!winner) throw new Error("Artifact metadata could not be confirmed.");

    await updateBuild(buildId, { ...activity.snapshot(), performance_metrics: measurements.finish(), artifact_id: winner.id, status: "complete", stage: env.dryRun ? "Dry-run artifact ready" : "Template ready", progress: 100, completed_at: new Date().toISOString() });
    await job.updateProgress(100);
  } catch (error) {
    const message = sanitizeLog(error instanceof Error ? error.message : String(error), [env.supabaseSecretKey, env.redisUrl]).slice(-2000);
    await updateBuild(buildId, { ...activity.snapshot(), performance_metrics: measurements.finish(), ...failureState(job.attemptsMade, job.opts.attempts ?? 1), error: message }).catch(() => undefined);
    throw error;
  } finally {
    clearInterval(heartbeat);
    await pendingHeartbeat;
  }
}

const worker = new Worker<BuildJob>(env.queueName, processBuild, {
  connection: connectionFromUrl(env.redisUrl),
  concurrency: env.concurrency,
});

const queue = new Queue<BuildJob>(env.queueName, { connection: connectionFromUrl(env.redisUrl), defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 } });
let reconciling = false;
let closing = false;
async function reconcileBuilds() {
  if (reconciling || closing) return;
  reconciling = true;
  try {
    let cursor: string | undefined;
    while (!closing) {
    let query = supabase.from("builds").select("id,user_id,config_hash,config,status,created_at")
      .not("status", "in", "(complete,failed)")
      .in("config->>platform", env.target === "web" ? ["web"] : ["linux", "windows"])
      .order("id").limit(100);
    if (cursor) query = query.gt("id", cursor);
    const result = await query;
    if (result.error) throw new Error("Could not reconcile build records.");
    for (const build of result.data ?? []) {
      if (closing) break;
      // Allow the submitting API to finish its normal enqueue transaction.
      if (Date.now() - Date.parse(build.created_at) < 30000) continue;
      const existing = await queue.getJob(build.id);
      if (!existing) {
        await queue.add("compile-template", { buildId: build.id, userId: build.user_id, configHash: build.config_hash, config: build.config }, { jobId: build.id });
      } else {
        const state = await existing.getState();
        if (state === "failed" || state === "completed") {
          await supabase.from("builds").update({ status: "failed", stage: "Build interrupted", error: "The queue job ended before its build result was recorded. Submit the recipe again to retry.", completed_at: new Date().toISOString() }).eq("id", build.id).not("status", "in", "(complete,failed)");
        }
      }
    }
    if (!result.data?.length || result.data.length < 100) break;
    cursor = result.data.at(-1)!.id;
    }
  } catch { console.warn("Build reconciliation unavailable; will retry."); }
  finally { reconciling = false; }
}
const reconcileTimer = setInterval(() => { void reconcileBuilds(); }, 30000);
void reconcileBuilds();

worker.on("ready", () => console.log(`mingd builder ready. queue=${env.queueName} concurrency=${env.concurrency} dryRun=${env.dryRun}`));
worker.on("completed", (job) => console.log(`Build ${job.id} completed.`));
worker.on("failed", (job, error) => {
  console.error(`Build ${job?.id ?? "unknown"} failed:`, sanitizeLog(error.message, [env.supabaseSecretKey, env.redisUrl]));
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) void Promise.resolve(supabase.from("builds").update({ status: "failed", stage: "Build failed", error: sanitizeLog(error.message, [env.supabaseSecretKey, env.redisUrl]), completed_at: new Date().toISOString() }).eq("id", job.data.buildId).neq("status", "complete")).then(({ error }) => { if (error) console.warn("Failed build state could not be recorded."); }).catch(() => { console.warn("Failed build state connection unavailable."); });
});
worker.on("error", () => console.warn("Worker queue connection unavailable; reconnecting."));
queue.on("error", () => console.warn("Recovery queue connection unavailable; reconnecting."));

async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`Received ${signal}; closing worker.`);
  clearInterval(reconcileTimer);
  await worker.close();
  await queue.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
