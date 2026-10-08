import type { FastifyInstance } from "fastify";
import { WorkerHelloSchema, WorkerTelemetryReportSchema, WORKER_PROTOCOL_VERSION, WORKER_HEARTBEAT_INTERVAL_MS } from "@mingd/worker-protocol";
import { parseWorkerAuthorization } from "./credentials.js";
import type { WorkerControl } from "./workers.js";

export async function workerRoutes(server: FastifyInstance, options: { workers: WorkerControl }) {
  // Bound both request rate and memory. With trustProxy=false, a proxy's workers
  // share one budget; forwarded headers cannot manufacture more rate-limit keys.
  const budgets = new Map<string, { until: number; count: number }>();
  server.addHook("onRequest", async (request, reply) => {
    const now = Date.now();
    let budget = budgets.get(request.ip);
    if (!budget || budget.until <= now) {
      if (budgets.size >= 4096) {
        for (const [ip, entry] of budgets) if (entry.until <= now) budgets.delete(ip);
        if (budgets.size >= 4096 && !budget) return reply.code(429).send({ error: "rate_limited" });
      }
      budget = { until: now + 60_000, count: 0 };
      budgets.set(request.ip, budget);
    }
    if (++budget.count > 600) return reply.header("retry-after", "60").code(429).send({ error: "rate_limited" });
    if (!parseWorkerAuthorization(request.headers.authorization)) {
      return reply.header("www-authenticate", "Bearer").code(401).send({ error: "unauthorized" });
    }
  });
  server.post("/heartbeat", { schema: { response: { 200: {
    type: "object", additionalProperties: false,
    properties: {
      protocolVersion: { type: "integer", const: WORKER_PROTOCOL_VERSION }, workerId: { type: "string", format: "uuid" },
      receivedAt: { type: "string", format: "date-time" }, heartbeatIntervalMs: { type: "integer", const: WORKER_HEARTBEAT_INTERVAL_MS },
      draining: { type: "boolean" }, acceptingAssignments: { type: "boolean" },
    }, required: ["protocolVersion", "workerId", "receivedAt", "heartbeatIntervalMs", "draining", "acceptingAssignments"],
  }, default: { type: "object", additionalProperties: false, properties: { error: { type: "string" } }, required: ["error"] } } } }, async (request, reply) => {
    const identity = parseWorkerAuthorization(request.headers.authorization)!;
    const hello = WorkerHelloSchema.safeParse(request.body);
    if (!hello.success) return reply.code(400).send({ error: "invalid_request" });
    const result = await options.workers.heartbeat(identity, hello.data);
    if (result.outcome === "unauthorized") return reply.header("www-authenticate", "Bearer").code(401).send({ error: "unauthorized" });
    if (result.outcome === "incompatible") return reply.code(409).send({ error: "incompatible_worker" });
    return result.receipt;
  });
  server.post("/telemetry", { schema: { response: { 200: {
    type: "object", additionalProperties: false, properties: {
      protocolVersion: { type: "integer", const: WORKER_PROTOCOL_VERSION }, workerId: { type: "string", format: "uuid" },
      receivedAt: { type: "string", format: "date-time" }, heartbeatIntervalMs: { type: "integer", const: WORKER_HEARTBEAT_INTERVAL_MS },
      draining: { type: "boolean" }, acceptingAssignments: { type: "boolean" },
    }, required: ["protocolVersion", "workerId", "receivedAt", "heartbeatIntervalMs", "draining", "acceptingAssignments"],
  }, default: { type: "object", additionalProperties: false, properties: { error: { type: "string" } }, required: ["error"] } } } }, async (request, reply) => {
    const input = WorkerTelemetryReportSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: "invalid_request" });
    if (!options.workers.telemetry) return reply.code(503).send({ error: "telemetry_unavailable" });
    const result = await options.workers.telemetry(parseWorkerAuthorization(request.headers.authorization)!, input.data.hello, input.data.telemetry);
    if (result.outcome === "unauthorized") return reply.code(401).send({ error: "unauthorized" });
    if (result.outcome === "incompatible") return reply.code(409).send({ error: "incompatible_worker" });
    return result.receipt;
  });

}
