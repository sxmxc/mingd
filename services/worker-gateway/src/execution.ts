import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { Queue, Worker, type Job } from "bullmq";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUILD_RECIPE_VERSION, canonicalBuildCacheInput, cachedArtifactPerformance, normalizeBuildConfig, resolveGodotVersion, workerPlatforms, workerTargetForPlatform, type BuildConfig } from "@mingd/build-config";
import { AssignmentSchema, CompletionReceiptSchema, WORKER_PROTOCOL_VERSION, type Assignment, type WorkerHello, type BuildHeartbeat } from "@mingd/worker-protocol";
import { AssignmentStore, type AssignmentLease, type WorkerIdentity } from "./assignments.js";
import { validateUpload } from "./validate-upload.js";

export type QueuedBuild = { buildId: string; userId: string; configHash: string; config: unknown };
type Task = {
  job: Job<QueuedBuild>; config: BuildConfig; sourceSha256: string; artifactHash: string;
  target: WorkerHello["target"]; claimBusy: boolean; lease?: AssignmentLease; identity?: WorkerIdentity;
  resolve: () => void; reject: (error: Error) => void; uploadBusy: boolean; done: boolean;
};
export type ExecutionOptions = {
  release: string; redisUrl: string; queues: Record<WorkerHello["target"], string>;
  concurrency: number; dryRun: boolean; artifactBucket: string; maxUploads: number;
  workDir: string; toolchainSha256: string | null; maxJobMs: number;
};
export interface ExecutionControl {
  accepting(): boolean;
  next(identity: WorkerIdentity, hello: WorkerHello): Promise<Assignment | null>;
  heartbeat(identity: WorkerIdentity, heartbeat: BuildHeartbeat): Promise<string | null>;
  fail(identity: WorkerIdentity, assignmentId: string, error: string): Promise<boolean>;
  authorizeUpload(identity: WorkerIdentity, assignmentId: string): Promise<{ artifactId?: string } | null>;
  complete(identity: WorkerIdentity, assignmentId: string, path: string, digest: string, size: number): Promise<string | null>;
  close(): Promise<void>;
}

export function redisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  if (!["redis:", "rediss:"].includes(url.protocol) || !/^\/?\d*$/.test(url.pathname)) throw new Error("Invalid queue connection.");
  return { host: url.hostname, port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined };
}

export class ExecutionBroker implements ExecutionControl {
  private tasks = new Map<string, Task>();
  private workers: Worker<QueuedBuild>[] = [];
  private connections = new Set<{ readonly status: string }>();
  private queues = new Map<WorkerHello["target"], Queue<QueuedBuild>>();
  private assignments: AssignmentStore;
  private closing = false;
  private ready = false;
  private ticking = false;
  private timer?: ReturnType<typeof setInterval>;
  private uploadCount = 0;

  constructor(private readonly db: SupabaseClient, private readonly storage: SupabaseClient, private readonly options: ExecutionOptions) {
    this.assignments = new AssignmentStore(db, options.release, BUILD_RECIPE_VERSION);
  }
  accepting() { return this.ready && !this.closing && this.connections.size === this.workers.length
    && [...this.connections].every(connection => connection.status === "ready"); }

  async start() {
    const connection = redisConnection(this.options.redisUrl);
    if (new Set(Object.values(this.options.queues)).size !== 4) throw new Error("Build queues must have unique names.");
    for (const target of ["desktop", "web", "android", "macos"] as const) {
      const queue = new Queue<QueuedBuild>(this.options.queues[target], { connection,
        defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 1000 } });
      queue.on("error", () => undefined);
      this.queues.set(target, queue);
      const worker = new Worker<QueuedBuild>(this.options.queues[target], (job, _token, signal) => this.process(job, target, signal), {
        connection, concurrency: this.options.concurrency, lockDuration: 60_000, stalledInterval: 30_000, maxStalledCount: 1,
      });
      worker.on("error", () => undefined);
      worker.on("lockRenewalFailed", ids => { for (const id of ids) worker.cancelJob(id); });
      worker.on("failed", job => { if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) void this.terminal(job); });
      this.workers.push(worker);
      void worker.backend.client.then(client => { this.connections.add(client); }).catch(() => undefined);
    }
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([Promise.all(this.workers.map(worker => worker.waitUntilReady())),
        new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error("Queue startup timed out.")), 15_000); })]);
    } finally { if (deadline) clearTimeout(deadline); }
    this.ready = true;
    this.timer = setInterval(() => { void this.tick(); }, 5000);
    this.timer.unref();
    void this.tick();
  }

  private async terminal(job: Job<QueuedBuild>) {
    try {
      const active = await this.db.from("worker_assignments").select("id").eq("build_id", job.data.buildId).eq("state", "active");
      if (active.error) return;
      for (const assignment of active.data ?? []) await this.db.rpc("recover_worker_assignment", {
        p_assignment_id: assignment.id, p_error: "Build interrupted; retry limit exhausted.", p_terminal: true,
      });
      await this.db.from("builds").update({ status: "failed", stage: "Build failed", error: "Build interrupted; retry limit exhausted.", completed_at: new Date().toISOString() })
        .eq("id", job.data.buildId).not("status", "in", "(complete,failed)");
    } catch { /* Reconciliation retries this transition. */ }
  }

  private async process(job: Job<QueuedBuild>, target: WorkerHello["target"], signal?: AbortSignal) {
    let task: Task | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => task?.reject(new Error("Queue ownership lost or gateway stopping."));
    try {
      const record = await this.db.from("builds").select("id,user_id,config_hash,config,status").eq("id", job.data.buildId).maybeSingle();
      if (record.error) throw new Error("Build record unavailable.");
      if (!record.data || record.data.status === "complete" || record.data.status === "failed") return;
      if (record.data.user_id !== job.data.userId || record.data.config_hash !== job.data.configHash) throw new Error("Queue ownership mismatch.");
      const config = normalizeBuildConfig(job.data.config);
      if (JSON.stringify(normalizeBuildConfig(record.data.config)) !== JSON.stringify(config) || workerTargetForPlatform(config.platform) !== target) throw new Error("Queue recipe mismatch.");
      const source = await resolveGodotVersion(config.godotVersion);
      const configHash = createHash("sha256").update(canonicalBuildCacheInput(config, source, this.options.toolchainSha256 ?? undefined)).digest("hex");
      if (configHash !== job.data.configHash) throw new Error("Queued recipe integrity mismatch.");
      signal?.throwIfAborted();
      // The new queue owner invalidates an interrupted attempt before offering
      // work again. Durable IDs fence the former gateway/worker delivery.
      const previous = await this.db.from("worker_assignments").select("id").eq("build_id", job.data.buildId).eq("state", "active");
      if (previous.error) throw new Error("Assignment recovery unavailable.");
      for (const assignment of previous.data ?? []) {
        const result = await this.db.rpc("recover_worker_assignment", { p_assignment_id: assignment.id, p_error: "Recovering interrupted worker delivery.", p_terminal: false });
        if (result.error) throw new Error("Assignment recovery unavailable.");
      }
      const completed = new Promise<void>((resolve, reject) => {
        task = { job, config, sourceSha256: source.sourceSha256, artifactHash: this.options.dryRun
          ? createHash("sha256").update(`dry-run\n${configHash}`).digest("hex") : configHash,
          target, claimBusy: false, resolve, reject, uploadBusy: false, done: false };
      });
      this.tasks.set(job.data.buildId, task!);
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted || this.closing) cancel();
      timeout = setTimeout(() => task?.reject(new Error("Worker build exceeded gateway time budget.")), this.options.maxJobMs);
      await completed;
    } catch (error) {
      const terminal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (task?.lease) {
        await this.db.rpc("recover_worker_assignment", { p_assignment_id: task.lease.id, p_error: "Worker delivery failed or disconnected.", p_terminal: terminal });
      } else {
        await this.db.from("builds").update({ status: terminal ? "failed" : "queued", stage: terminal ? "Build failed" : "Waiting for worker", progress: 0,
          error: "Build could not be dispatched. Check queue, source catalog and worker compatibility.", completed_at: terminal ? new Date().toISOString() : null })
          .eq("id", job.data.buildId).not("status", "in", "(complete,failed)");
      }
      throw new Error("Distributed worker delivery failed.");
    } finally {
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      if (this.tasks.get(job.data.buildId) === task) this.tasks.delete(job.data.buildId);
      if (task) task.done = true;
    }
  }

  async next(identity: WorkerIdentity, hello: WorkerHello): Promise<Assignment | null> {
    if (!this.accepting()) return null;
    for (const task of this.tasks.values()) {
      if (task.target !== hello.target || task.claimBusy || task.lease || task.done) continue;
      task.claimBusy = true;
      try {
        const lease = await this.assignments.claim(identity, task.job.data.buildId, task.job.data.configHash, hello);
        if (!lease) continue;
        if (task.done || this.closing) {
          await this.db.rpc("recover_worker_assignment", { p_assignment_id: lease.id, p_error: "Gateway stopped during dispatch.", p_terminal: false });
          return null;
        }
        task.lease = lease; task.identity = identity;
        const cache = await this.db.rpc("complete_worker_cache", { p_worker_id: identity.workerId, p_hash: identity.credentialHash,
          p_assignment_id: lease.id, p_artifact_hash: task.artifactHash, p_metrics: cachedArtifactPerformance() });
        if (cache.error) { task.reject(new Error("Artifact cache unavailable.")); return null; }
        if (cache.data) { task.done = true; task.resolve(); continue; }
        return AssignmentSchema.parse({ protocolVersion: WORKER_PROTOCOL_VERSION, assignmentId: lease.id, buildId: lease.build_id,
          configHash: task.job.data.configHash, config: task.config, release: this.options.release, recipeVersion: BUILD_RECIPE_VERSION,
          dryRun: this.options.dryRun, leaseExpiresAt: lease.lease_until });
      } finally { task.claimBusy = false; }
    }
    return null;
  }

  private task(assignmentId: string) { return [...this.tasks.values()].find(task => task.lease?.id === assignmentId && !task.done); }
  async heartbeat(identity: WorkerIdentity, heartbeat: BuildHeartbeat) {
    const task = this.task(heartbeat.assignmentId);
    if (!task || task.identity?.workerId !== identity.workerId) return null;
    const sanitized = (heartbeat.logTail ?? "").split(this.options.redisUrl).join("[REDACTED]").replace(/mingd_worker_[0-9a-f-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
      .replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, "[REDACTED]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
      .replace(/(https?:\/\/|rediss?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[REDACTED]@");
    const { data, error } = await this.db.rpc("heartbeat_worker_build", {
      p_worker_id: identity.workerId, p_hash: identity.credentialHash, p_assignment_id: heartbeat.assignmentId,
      p_stage: heartbeat.stage, p_log_tail: sanitized || null, p_last_output_at: heartbeat.lastOutputAt,
      p_output_bytes: heartbeat.outputBytes, p_metrics: heartbeat.metrics ?? null,
    });
    if (error) throw new Error("Build heartbeat unavailable.");
    if (data) task.lease!.lease_until = data;
    return data as string | null;
  }
  async fail(identity: WorkerIdentity, assignmentId: string, _error: string) {
    const task = this.task(assignmentId);
    const auth = await this.authorizeUpload(identity, assignmentId);
    if (!task || !auth || auth.artifactId) return false;
    // Do not store a worker's unchecked exception; compiler details are in its
    // bounded sanitized diagnostics, and operator secrets stay server-only.
    task.reject(new Error("Remote compilation failed."));
    return true;
  }

  async authorizeUpload(identity: WorkerIdentity, assignmentId: string): Promise<{ artifactId?: string } | null> {
    const { data, error } = await this.db.rpc("lock_worker_assignment", { p_worker_id: identity.workerId, p_hash: identity.credentialHash, p_assignment_id: assignmentId, p_completed: true });
    if (error) throw new Error("Assignment ownership unavailable.");
    const row = data?.[0];
    if (!row) return null;
    if (row.state === "completed") {
      const result = await this.db.from("builds").select("artifact_id").eq("id", row.build_id).single();
      if (result.error || !result.data.artifact_id) throw new Error("Completed result unavailable.");
      return { artifactId: result.data.artifact_id };
    }
    const task = this.task(assignmentId);
    return task && task.identity?.workerId === identity.workerId ? {} : null;
  }

  async complete(identity: WorkerIdentity, assignmentId: string, path: string, digest: string, size: number) {
    const task = this.task(assignmentId);
    if (!task || task.uploadBusy || this.uploadCount >= this.options.maxUploads) return null;
    task.uploadBusy = true; this.uploadCount++;
    try {
      const binarySize = await validateUpload(path, task.config, this.options.dryRun);
      if (!await this.authorizeUpload(identity, assignmentId) || task.done) return null;
      const uploadId = randomUUID();
      const storagePath = `distributed/${assignmentId}/${uploadId}/${digest}.tpz`;
      const reserved = await this.db.rpc("reserve_worker_upload", { p_worker_id: identity.workerId, p_hash: identity.credentialHash,
        p_assignment_id: assignmentId, p_upload_id: uploadId, p_path: storagePath, p_sha256: digest, p_size: size });
      if (reserved.error) throw new Error("Artifact reservation unavailable.");
      if (!reserved.data) return null;
      const stream = createReadStream(path);
      try {
        const uploaded = await this.storage.storage.from(this.options.artifactBucket).upload(storagePath, stream, { contentType: "application/zip", upsert: false, duplex: "half" });
        if (uploaded.error) throw new Error("Artifact storage upload failed.");
      } finally { stream.destroy(); }
      // A restarted gateway/replaced assignment cannot commit an old upload.
      if (task.done) return null;
      const build = await this.db.from("builds").select("performance_metrics").eq("id", task.job.data.buildId).single();
      if (build.error) throw new Error("Build measurements unavailable.");
      const completed = await this.db.rpc("complete_worker_build", { p_worker_id: identity.workerId, p_hash: identity.credentialHash,
        p_assignment_id: assignmentId, p_upload_id: uploadId, p_artifact_hash: task.artifactHash,
        p_config: task.config, p_source_sha256: task.sourceSha256, p_binary_size: binarySize,
        p_dry_run: this.options.dryRun, p_metrics: build.data.performance_metrics });
      if (completed.error) throw new Error("Artifact commit unavailable.");
      if (!completed.data) return null;
      CompletionReceiptSchema.parse({ protocolVersion: 1, assignmentId, artifactId: completed.data });
      task.done = true; task.resolve();
      return completed.data as string;
    } finally { task.uploadBusy = false; this.uploadCount--; }
  }

  private async tick() {
    if (this.ticking || this.closing) return;
    this.ticking = true;
    try {
      for (const task of this.tasks.values()) {
        if (!task.lease || !task.identity || task.done) continue;
        const auth = await this.db.rpc("lock_worker_assignment", { p_worker_id: task.identity.workerId, p_hash: task.identity.credentialHash, p_assignment_id: task.lease.id });
        if (!auth.error && !auth.data?.length) task.reject(new Error("Worker lease expired or credential revoked."));
      }
      await this.db.rpc("cleanup_worker_uploads");
      // Repair a submission whose DB insert succeeded but enqueue failed, and
      // reconcile exhausted/stalled queue deliveries against durable build state.
      for (const [target, queue] of this.queues) {
        let cursor: string | undefined;
        do {
          let query = this.db.from("builds").select("id,user_id,config_hash,config,created_at")
            .not("status", "in", "(complete,failed)").in("config->>platform", workerPlatforms(target)).order("id").limit(100);
          if (cursor) query = query.gt("id", cursor);
          const result = await query;
          if (result.error) break;
          for (const build of result.data ?? []) {
            if (this.closing) return;
            if (Date.now() - Date.parse(build.created_at) < 30_000) continue;
            const job = await queue.getJob(build.id);
            if (!job) await queue.add("compile-template", { buildId: build.id, userId: build.user_id, configHash: build.config_hash, config: build.config }, { jobId: build.id });
            else if (["failed", "completed"].includes(await job.getState())) await this.terminal(job);
          }
          cursor = result.data?.length === 100 ? result.data.at(-1)?.id : undefined;
        } while (cursor && !this.closing);
      }
    } catch { /* Connectivity failures are retried; leases are never forged locally. */ }
    finally { this.ticking = false; }
  }

  async close() {
    const force = !this.ready;
    this.closing = true; this.ready = false;
    if (this.timer) clearInterval(this.timer);
    for (const task of this.tasks.values()) task.reject(new Error("Gateway stopping."));
    await Promise.allSettled(this.workers.map(worker => worker.close(force)));
    await Promise.allSettled([...this.queues.values()].map(queue => queue.close()));
  }
}
