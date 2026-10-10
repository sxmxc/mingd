import Fastify, { LogController } from "fastify";
import { readFileSync } from "node:fs";
import { BUILD_RECIPE_VERSION } from "@mingd/build-config";
import type { Writable } from "node:stream";
import { ImageTagSchema, WORKER_JSON_BODY_LIMIT_BYTES, WORKER_PROTOCOL_VERSION } from "@mingd/worker-protocol";
import type { GatewayLogLevel } from "./config.js";
import type { WorkerControl } from "./workers.js";
import { workerRoutes } from "./worker-routes.js";
import { executionRoutes } from "./execution-routes.js";
import type { ExecutionControl } from "./execution.js";
import { ArtifactValidationError } from "./validate-upload.js";
import { ArtifactOperationError, UploadCapacityError } from "./execution-errors.js";

export function buildServer(options: { logger?: boolean; logLevel?: GatewayLogLevel; logStream?: Writable; workers?: WorkerControl; execution?: ExecutionControl; workDir?: string; maxUploads?: number } = {}) {
  const serviceVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version as string;
  const imageTag = ImageTagSchema.nullable().parse(JSON.parse(readFileSync(new URL("../image-release.json", import.meta.url), "utf8")).imageTag);
  const server = Fastify({
    logger: options.logger === false ? false : {
      level: options.logLevel ?? "info",
      stream: options.logStream,
      redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
      // Log only method and generated correlation ID; URLs/query strings can contain secrets.
      serializers: { req: request => ({ method: request.method, id: request.id }) },
    },
    requestIdHeader: false,
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: false,
    bodyLimit: WORKER_JSON_BODY_LIMIT_BYTES,
    requestTimeout: options.execution ? 300_000 : 30_000,
    connectionTimeout: options.execution ? 300_000 : 30_000,
    keepAliveTimeout: 5_000,
    maxRequestsPerSocket: 100,
    onProtoPoisoning: "error",
    onConstructorPoisoning: "error",
    return503OnClosing: true,
    forceCloseConnections: "idle",
  });

  server.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
    reply.header("x-content-type-options", "nosniff");
  });
  server.addHook("onResponse", async (request, reply) => {
    request.log.info({ method: request.method, statusCode: reply.statusCode }, "Gateway request completed");
  });
  server.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ error: "not_found" }));
  server.setErrorHandler(async (error, request, reply) => {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    let status = 500;
    let message = "internal_error";
    if (error instanceof UploadCapacityError) { status = 429; message = "upload_capacity"; reply.header("retry-after", "10"); }
    else if (error instanceof ArtifactValidationError) { status = 422; message = "invalid_template_package"; }
    else if (code === "FST_ERR_CTP_BODY_TOO_LARGE") { status = 413; message = "request_too_large"; }
    else if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") { status = 415; message = "unsupported_media_type"; }
    else if (["FST_ERR_CTP_INVALID_JSON_BODY", "FST_ERR_CTP_EMPTY_JSON_BODY", "FST_ERR_CTP_INVALID_CONTENT_LENGTH", "FST_ERR_VALIDATION"].includes(String(code))) {
      status = 400; message = "invalid_request";
    }
    // Backend messages and parser excerpts can contain credentials or request bodies.
    if (status === 500) request.log.error({ failure: "gateway_request_failed",
      ...(error instanceof ArtifactOperationError ? { operation: error.operation } : {}) }, "Gateway request failed");
    return reply.code(status).send({ error: message });
  });

  server.get("/healthz", {
    schema: { response: { 200: {
      type: "object", additionalProperties: false,
      properties: { status: { type: "string", const: "ok" }, protocolVersion: { type: "integer", const: WORKER_PROTOCOL_VERSION }, acceptingAssignments: { type: "boolean" },
        serviceVersion: { type: "string", maxLength: 64 }, imageTag: { type: ["string", "null"], maxLength: 128 }, buildRecipeVersion: { type: "string", maxLength: 32 } },
      required: ["status", "protocolVersion", "acceptingAssignments", "serviceVersion", "imageTag", "buildRecipeVersion"],
    } } },
  }, async () => ({ status: "ok", protocolVersion: WORKER_PROTOCOL_VERSION, acceptingAssignments: options.execution?.accepting() ?? false,
    serviceVersion, imageTag, buildRecipeVersion: BUILD_RECIPE_VERSION }));
  if (options.workers) server.register(workerRoutes, { prefix: "/v1/workers", workers: options.workers });
  if (options.execution && options.workers) {
    server.register(executionRoutes, { prefix: "/v1/assignments", execution: options.execution, workers: options.workers, workDir: options.workDir ?? "/tmp/mingd-gateway", maxUploads: options.maxUploads ?? 2 });
    server.addHook("onClose", () => options.execution!.close());
  }
  return server;
}
