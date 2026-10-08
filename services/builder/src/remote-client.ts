import { createReadStream } from "node:fs";
import { AssignmentPollReceiptSchema, AssignmentStatusSchema, BuildHeartbeatSchema, CompletionReceiptSchema, LeaseReceiptSchema, WorkerHelloSchema, WorkerHeartbeatReceiptSchema, WorkerTelemetryReportSchema, type WorkerTelemetry, type Assignment, type BuildHeartbeat, type WorkerHello } from "@mingd/worker-protocol";

export class GatewayError extends Error {
  constructor(readonly status: number) { super(`Worker gateway returned HTTP ${status}.`); }
  get fatal() { return this.status === 401 || this.status === 409; }
}
/** Production always uses verified HTTPS. Transport injection is for isolated tests. */
export class RemoteClient {
  readonly origin: URL;
  constructor(gateway: string, private readonly credential: string, private readonly transport: typeof fetch = fetch) {
    this.origin = new URL(gateway);
    if (this.origin.protocol !== "https:" || this.origin.username || this.origin.password || this.origin.pathname !== "/" || this.origin.search || this.origin.hash) throw new Error("Use an HTTPS gateway origin.");
    if (!/^mingd_worker_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(credential)) throw new Error("Invalid worker credential.");
  }
  private async receipt(response: Response) {
    if (!response.ok) { await response.body?.cancel(); throw new GatewayError(response.status); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing gateway response.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength; if (size > 64 * 1024) throw new Error("Gateway response too large.");
        chunks.push(next.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } finally { await reader.cancel(); }
  }
  private async json(path: string, body?: unknown, signal?: AbortSignal) {
    return this.receipt(await this.transport(new URL(path, this.origin), { method: body === undefined ? "GET" : "POST", redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]),
      headers: { authorization: `Bearer ${this.credential}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));
  }
  async next(hello: WorkerHello, signal?: AbortSignal): Promise<Assignment | null> {
    return AssignmentPollReceiptSchema.parse(await this.json("/v1/assignments/next", { hello: WorkerHelloSchema.parse(hello) }, signal)).assignment;
  }
  async heartbeat(value: BuildHeartbeat, signal?: AbortSignal) {
    const receipt = LeaseReceiptSchema.parse(await this.json("/v1/assignments/heartbeat", BuildHeartbeatSchema.parse(value), signal));
    if (receipt.assignmentId !== value.assignmentId) throw new Error("Unexpected assignment receipt.");
    return receipt;
  }
  async status(id: string) {
    const value = AssignmentStatusSchema.parse(await this.json(`/v1/assignments/${id}/status`));
    if (value.assignmentId !== id) throw new Error("Unexpected assignment receipt.");
    return value;
  }
  async telemetry(hello: WorkerHello, telemetry: WorkerTelemetry, signal?: AbortSignal) {
    const receipt = WorkerHeartbeatReceiptSchema.parse(await this.json("/v1/workers/telemetry", WorkerTelemetryReportSchema.parse({ hello, telemetry }), signal));
    if (receipt.workerId !== this.credential.slice("mingd_worker_".length).split(".")[0]) throw new Error("Unexpected worker telemetry receipt.");
    return receipt;
  }
  async fail(id: string, signal?: AbortSignal) { await this.json("/v1/assignments/failure", { protocolVersion: 1, assignmentId: id, error: "Remote compilation failed. See bounded build diagnostics." }, signal); }
  async upload(id: string, path: string, digest: string, size: number, signal: AbortSignal) {
    const stream = createReadStream(path);
    try {
      const options = { method: "PUT", redirect: "error" as const, duplex: "half", signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]),
        headers: { authorization: `Bearer ${this.credential}`, "content-type": "application/octet-stream", "content-length": String(size), "x-artifact-sha256": digest }, body: stream };
      const value = CompletionReceiptSchema.parse(await this.receipt(await this.transport(new URL(`/v1/assignments/${id}/artifact`, this.origin), options as unknown as RequestInit)));
      if (value.assignmentId !== id) throw new Error("Unexpected completion receipt.");
      return value;
    } finally { stream.destroy(); }
  }
}
