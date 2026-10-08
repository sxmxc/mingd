import Fastify, { LogController } from "fastify";
import type { Writable } from "node:stream";
import { WORKER_JSON_BODY_LIMIT_BYTES, WORKER_PROTOCOL_VERSION } from "@mingd/worker-protocol";
import type { GatewayLogLevel } from "./config.js";

export function buildServer(options: { logger?: boolean; logLevel?: GatewayLogLevel; logStream?: Writable } = {}) {
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
    requestTimeout: 30_000,
    connectionTimeout: 30_000,
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
    if (code === "FST_ERR_CTP_BODY_TOO_LARGE") { status = 413; message = "request_too_large"; }
    else if (code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") { status = 415; message = "unsupported_media_type"; }
    else if (["FST_ERR_CTP_INVALID_JSON_BODY", "FST_ERR_CTP_EMPTY_JSON_BODY", "FST_ERR_CTP_INVALID_CONTENT_LENGTH", "FST_ERR_VALIDATION"].includes(String(code))) {
      status = 400; message = "invalid_request";
    }
    // Backend messages and parser excerpts can contain credentials or request bodies.
    if (status === 500) request.log.error({ failure: "gateway_request_failed" }, "Gateway request failed");
    return reply.code(status).send({ error: message });
  });

  server.get("/healthz", {
    schema: { response: { 200: {
      type: "object", additionalProperties: false,
      properties: { status: { type: "string", const: "ok" }, protocolVersion: { type: "integer", const: WORKER_PROTOCOL_VERSION }, acceptingAssignments: { type: "boolean", const: false } },
      required: ["status", "protocolVersion", "acceptingAssignments"],
    } } },
  }, async () => ({ status: "ok", protocolVersion: WORKER_PROTOCOL_VERSION, acceptingAssignments: false }));
  return server;
}
