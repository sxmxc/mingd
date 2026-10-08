import { WorkerHelloSchema, WorkerHeartbeatReceiptSchema } from "@mingd/worker-protocol";
import type { WorkerHello } from "@mingd/worker-protocol";
import { parseWorkerAuthorization } from "./credentials.js";

/** A one-shot connectivity/authentication check, not a worker execution loop. */
export async function probeWorkerGateway(gateway: string, credential: string, hello: WorkerHello, transport: typeof fetch = fetch) {
  const url = new URL(gateway);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use an HTTPS gateway origin.");
  }
  const identity = parseWorkerAuthorization(`Bearer ${credential}`);
  if (!identity) throw new Error("Invalid worker credential.");
  const response = await transport(new URL("/v1/workers/heartbeat", url), {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
    body: JSON.stringify(WorkerHelloSchema.parse(hello)),
  });
  if (!response.ok) throw new Error(`Gateway returned HTTP ${response.status}.`);
  // Bound response bodies as well as requests; a broken proxy cannot stream forever.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing heartbeat response.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > 4096) throw new Error("Heartbeat response too large.");
      chunks.push(result.value);
    }
  } finally { await reader.cancel(); }
  const receipt = WorkerHeartbeatReceiptSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (receipt.workerId !== identity.workerId) throw new Error("Unexpected worker identity.");
  return receipt;
}
