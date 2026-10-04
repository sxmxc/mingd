import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { Worker, type Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { BUILD_RECIPE_VERSION, canonicalBuildCacheInput, normalizeBuildConfig, SUPPORTED_GODOT_VERSIONS } from "@gdslimmer/build-config";
import { env } from "./env.js";
import { compileBuild } from "./compiler.js";

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
  const { error } = await supabase.from("builds").update(patch).eq("id", buildId);
  if (error) throw new Error(`Could not update build ${buildId}: ${error.message}`);
}

async function sha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
  });
}

async function tail(path: string, max = 12000) {
  try {
    const content = await readFile(path, "utf8");
    return content.slice(-max);
  } catch {
    return null;
  }
}

async function processBuild(job: Job<BuildJob>) {
  const { buildId } = job.data;
  const config = normalizeBuildConfig(job.data.config);
  const configHash = createHash("sha256").update(canonicalBuildCacheInput(config)).digest("hex");
  if (configHash !== job.data.configHash) {
    throw new Error("Build configuration hash does not match the queued payload.");
  }
  const logFile = `${env.workDir}/${buildId}.log`;
  // A diagnostic archive must never occupy the real-template cache key or path.
  const artifactHash = env.dryRun ? createHash("sha256").update(`dry-run\n${configHash}`).digest("hex") : configHash;

  const { data: existing } = await supabase.from("artifacts").select("id").eq("config_hash", artifactHash).eq("is_dry_run", env.dryRun).maybeSingle();
  if (existing) {
    await updateBuild(buildId, { artifact_id: existing.id, status: "complete", stage: "Cached artifact", progress: 100, completed_at: new Date().toISOString() });
    return;
  }

  try {
    const updateStage = async (stage: import("./compiler.js").BuildStage) => {
      const details: Record<typeof stage, { progress: number; status: string; label: string }> = {
        preparing_source: { progress: 5, status: "preparing_source", label: "Preparing source cache" },
        verifying_source: { progress: 12, status: "verifying_source", label: "Verifying official source checksum" },
        preparing_workspace: { progress: 18, status: "preparing_workspace", label: "Preparing isolated workspace" },
        compiling: { progress: 25, status: "compiling", label: env.dryRun ? "Creating dry-run diagnostic" : "Compiling export template" },
        validating: { progress: 78, status: "validating", label: "Validating compiled template" },
        packaging: { progress: 84, status: "packaging", label: "Packaging Godot template" },
      };
      const current = details[stage];
      await updateBuild(buildId, { status: current.status, stage: current.label, progress: current.progress, ...(stage === "preparing_source" ? { started_at: new Date().toISOString() } : {}) });
      await job.updateProgress(current.progress);
    };
    const { artifactPath, binarySizeBytes } = await compileBuild(buildId, config, logFile, updateStage);
    await job.updateProgress(78);

    await updateBuild(buildId, { status: "packaging", stage: "Hashing packaged template", progress: 87, log_tail: await tail(logFile) });
    const digest = await sha256(artifactPath);
    const size = (await stat(artifactPath)).size;

    const storagePath = `${config.godotVersion}/${config.platform}/${artifactHash}/${basename(artifactPath)}`;
    await updateBuild(buildId, { status: "uploading", stage: "Uploading artifact", progress: 92 });
    const bytes = await readFile(artifactPath);
    const { error: uploadError } = await supabase.storage.from(env.artifactBucket).upload(storagePath, bytes, {
      contentType: "application/zip",
      upsert: false,
    });

    if (uploadError && !uploadError.message.toLowerCase().includes("already exists")) {
      throw new Error(`Artifact upload failed: ${uploadError.message}`);
    }

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
      source_sha256: SUPPORTED_GODOT_VERSIONS[config.godotVersion].sourceSha256,
      build_recipe_version: BUILD_RECIPE_VERSION,
      binary_size_bytes: binarySizeBytes,
      is_dry_run: env.dryRun,
    }, { onConflict: "config_hash", ignoreDuplicates: false }).select("id").single();
    if (artifactError) throw new Error(`Artifact metadata write failed: ${artifactError.message}`);

    await updateBuild(buildId, { artifact_id: artifact.id, status: "complete", stage: env.dryRun ? "Dry-run artifact ready" : "Template ready", progress: 100, completed_at: new Date().toISOString(), log_tail: await tail(logFile) });
    await job.updateProgress(100);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateBuild(buildId, { status: "failed", stage: "Build failed", error: message, completed_at: new Date().toISOString(), log_tail: await tail(logFile) }).catch(() => undefined);
    throw error;
  }
}

const worker = new Worker<BuildJob>(env.queueName, processBuild, {
  connection: connectionFromUrl(env.redisUrl),
  concurrency: env.concurrency,
});

worker.on("ready", () => console.log(`gdslimmer builder ready. queue=${env.queueName} concurrency=${env.concurrency} dryRun=${env.dryRun}`));
worker.on("completed", (job) => console.log(`Build ${job.id} completed.`));
worker.on("failed", (job, error) => console.error(`Build ${job?.id ?? "unknown"} failed:`, error));

async function shutdown(signal: string) {
  console.log(`Received ${signal}; closing worker.`);
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
