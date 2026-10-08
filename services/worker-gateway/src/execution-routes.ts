import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AssignmentPollSchema, BuildHeartbeatSchema, WorkerFailureSchema, WorkerIdSchema } from "@mingd/worker-protocol";
import { parseWorkerAuthorization } from "./credentials.js";
import type { ExecutionControl } from "./execution.js";
import type { WorkerControl } from "./workers.js";

export async function executionRoutes(server: FastifyInstance, options: { execution: ExecutionControl; workers: WorkerControl; workDir: string; maxUploads: number }) {
  const execution = options.execution;
  let uploads = 0;
  const budgets = new Map<string, { count: number; until: number }>();
  server.addHook("onRequest", async (request, reply) => {
    const now = Date.now();
    let entry = budgets.get(request.ip);
    if (!entry || entry.until <= now) {
      if (budgets.size >= 4096) {
        for (const [key, value] of budgets) if (value.until <= now) budgets.delete(key);
        if (budgets.size >= 4096 && !entry) return reply.code(429).send({ error: "rate_limited" });
      }
      entry = { count: 0, until: now + 60_000 }; budgets.set(request.ip, entry);
    }
    if (++entry.count > 600) return reply.header("retry-after", "60").code(429).send({ error: "rate_limited" });
    if (!parseWorkerAuthorization(request.headers.authorization)) return reply.header("www-authenticate", "Bearer").code(401).send({ error: "unauthorized" });
  });

  server.post("/next", async (request, reply) => {
    const input = AssignmentPollSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "invalid_request" });
    const identity = parseWorkerAuthorization(request.headers.authorization)!;
    const authenticated = await options.workers.heartbeat(identity, input.data.hello);
    if (authenticated.outcome === "unauthorized") return reply.code(401).send({ error: "unauthorized" });
    if (authenticated.outcome === "incompatible") return reply.code(409).send({ error: "incompatible_worker" });
    if (!execution.accepting()) return reply.code(503).send({ error: "gateway_unavailable" });
    const assignment = authenticated.receipt.draining ? null : await execution.next(identity, input.data.hello);
    return { protocolVersion: 1, assignment };
  });
  server.post("/heartbeat", async (request, reply) => {
    const input = BuildHeartbeatSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "invalid_request" });
    const lease = await execution.heartbeat(parseWorkerAuthorization(request.headers.authorization)!, input.data);
    if (!lease) return reply.code(410).send({ error: "assignment_lost" });
    return { protocolVersion: 1, assignmentId: input.data.assignmentId, leaseExpiresAt: lease };
  });
  server.post("/failure", async (request, reply) => {
    const input = WorkerFailureSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "invalid_request" });
    const accepted = await execution.fail(parseWorkerAuthorization(request.headers.authorization)!, input.data.assignmentId, input.data.error);
    return accepted ? { accepted: true } : reply.code(410).send({ error: "assignment_lost" });
  });
  server.get<{ Params: { assignmentId: string } }>("/:assignmentId/status", async (request, reply) => {
    if (!WorkerIdSchema.safeParse(request.params.assignmentId).success) return reply.code(400).send({ error: "invalid_request" });
    const result = await execution.authorizeUpload(parseWorkerAuthorization(request.headers.authorization)!, request.params.assignmentId);
    if (!result) return reply.code(410).send({ error: "assignment_lost" });
    return { protocolVersion: 1, assignmentId: request.params.assignmentId, artifactId: result.artifactId ?? null };
  });
  server.addContentTypeParser("application/octet-stream", (_request, payload, done) => done(null, payload));
  server.put<{ Params: { assignmentId: string } }>("/:assignmentId/artifact", {
    bodyLimit: 512 * 1024 * 1024,
    onRequest: async (request, reply) => {
      if (request.headers["content-type"] !== "application/octet-stream") return reply.code(415).send({ error: "unsupported_media_type" });
      if (!WorkerIdSchema.safeParse(request.params.assignmentId).success) return reply.code(400).send({ error: "invalid_request" });
      const digest = request.headers["x-artifact-sha256"];
      const length = request.headers["content-length"];
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest) || typeof length !== "string" || !/^\d+$/.test(length)) return reply.code(400).send({ error: "invalid_upload_headers" });
      if (Number(length) <= 0 || Number(length) > 512 * 1024 * 1024) return reply.code(413).send({ error: "request_too_large" });
      const identity = parseWorkerAuthorization(request.headers.authorization);
      if (!identity) return reply.code(401).send({ error: "unauthorized" });
      const ownership = await execution.authorizeUpload(identity, request.params.assignmentId);
      if (!ownership) return reply.code(410).send({ error: "assignment_lost" });
      if (ownership.artifactId) return reply.send({ protocolVersion: 1, assignmentId: request.params.assignmentId, artifactId: ownership.artifactId });
      if (uploads >= options.maxUploads) return reply.header("retry-after", "10").code(429).send({ error: "upload_capacity" });
    },
  }, async (request, reply) => {
    // Recheck after parsing: a second request may have occupied the final slot.
    if (uploads >= options.maxUploads) return reply.code(429).send({ error: "upload_capacity" });
    uploads++;
    let directory: string | undefined;
    try {
      await mkdir(options.workDir, { recursive: true });
      directory = await mkdtemp(join(options.workDir, "mingd-upload-"));
      const path = join(directory, "template.tpz");
      const digest = createHash("sha256"); let size = 0;
      const expectedSize = Number(request.headers["content-length"]);
      const guard = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > expectedSize || size > 512 * 1024 * 1024) { callback(new Error("Upload size limit exceeded.")); return; }
        digest.update(chunk); callback(null, chunk);
      } });
      request.raw.setTimeout?.(30_000, () => request.raw.destroy());
      await pipeline(request.body as Readable, guard, createWriteStream(path, { flags: "wx", mode: 0o600 }), { signal: AbortSignal.timeout(300_000) });
      if (size !== expectedSize || digest.digest("hex") !== request.headers["x-artifact-sha256"]) return reply.code(400).send({ error: "artifact_integrity_mismatch" });
      const artifactId = await execution.complete(parseWorkerAuthorization(request.headers.authorization)!, request.params.assignmentId, path, request.headers["x-artifact-sha256"] as string, size);
      if (!artifactId) return reply.code(410).send({ error: "assignment_lost" });
      return { protocolVersion: 1, assignmentId: request.params.assignmentId, artifactId };
    } finally {
      uploads--;
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  });
}
