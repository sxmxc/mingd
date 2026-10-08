import type { SupabaseClient } from "@supabase/supabase-js";
import { WorkerHelloSchema, WorkerHeartbeatReceiptSchema, WORKER_HEARTBEAT_INTERVAL_MS, WORKER_PROTOCOL_VERSION } from "@mingd/worker-protocol";
import type { WorkerHello } from "@mingd/worker-protocol";
import type { WorkerIdentity } from "./assignments.js";

export type HeartbeatResult = { outcome: "unauthorized" } | { outcome: "incompatible" } | {
  outcome: "ok"; receipt: ReturnType<typeof WorkerHeartbeatReceiptSchema.parse>;
};
export interface WorkerControl {
  heartbeat(identity: WorkerIdentity, hello: WorkerHello): Promise<HeartbeatResult>;
}

export class WorkerStore implements WorkerControl {
  constructor(private readonly database: SupabaseClient, private readonly expectedRelease: string, private readonly recipeVersion: string, private readonly accepting: () => boolean = () => false) {}

  async heartbeat(identity: WorkerIdentity, rawHello: WorkerHello): Promise<HeartbeatResult> {
    const hello = WorkerHelloSchema.parse(rawHello);
    // The RPC checks credentials and capability declarations in one transaction.
    const { data, error } = await this.database.rpc("record_worker_heartbeat", {
      p_worker_id: identity.workerId, p_credential_hash: identity.credentialHash,
      p_release: hello.release, p_recipe_version: hello.recipeVersion,
      p_target: hello.target, p_toolchain_sha256: hello.toolchainSha256,
      p_expected_release: this.expectedRelease, p_expected_recipe_version: this.recipeVersion,
    });
    if (error) throw new Error("Worker heartbeat unavailable.");
    const row = data?.[0];
    if (!row) return { outcome: "unauthorized" };
    if (row.outcome === "incompatible" || hello.release !== this.expectedRelease || hello.recipeVersion !== this.recipeVersion) {
      return { outcome: "incompatible" };
    }
    if (row.outcome !== "ok") throw new Error("Invalid worker heartbeat result.");
    return { outcome: "ok", receipt: WorkerHeartbeatReceiptSchema.parse({
      protocolVersion: WORKER_PROTOCOL_VERSION, workerId: identity.workerId,
      receivedAt: row.received_at, draining: row.draining,
      heartbeatIntervalMs: WORKER_HEARTBEAT_INTERVAL_MS, acceptingAssignments: this.accepting(),
    }) };
  }
}
