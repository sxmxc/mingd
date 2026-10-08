import type { SupabaseClient } from "@supabase/supabase-js";
import { WORKER_LEASE_SECONDS, WorkerHelloSchema } from "@mingd/worker-protocol";

export type WorkerIdentity = { workerId: string; credentialHash: string };
export type AssignmentLease = { id: string; build_id: string; worker_id: string; lease_until: string };

/** The database owns authentication, clocks, capacity checks and mutation serialization. */
export class AssignmentStore {
  constructor(private readonly database: SupabaseClient, private readonly recipeVersion: string) {}

  async claim(identity: WorkerIdentity, buildId: string, configHash: string, rawHello: unknown): Promise<AssignmentLease | null> {
    const hello = WorkerHelloSchema.parse(rawHello);
    if (hello.recipeVersion !== this.recipeVersion) return null;
    const { data, error } = await this.database.rpc("claim_worker_assignment", {
      p_worker_id: identity.workerId, p_credential_hash: identity.credentialHash,
      p_build_id: buildId, p_config_hash: configHash, p_release: hello.release,
      p_recipe_version: hello.recipeVersion, p_target: hello.target,
      p_toolchain_sha256: hello.toolchainSha256, p_lease_seconds: WORKER_LEASE_SECONDS,
    });
    if (error) throw new Error("Worker assignment claim unavailable.");
    return data?.[0] ?? null;
  }

  async renew(identity: WorkerIdentity, assignmentId: string): Promise<string | null> {
    const { data, error } = await this.database.rpc("renew_worker_assignment", {
      p_worker_id: identity.workerId, p_credential_hash: identity.credentialHash,
      p_assignment_id: assignmentId, p_lease_seconds: WORKER_LEASE_SECONDS,
    });
    if (error) throw new Error("Worker assignment renewal unavailable.");
    return data ?? null;
  }

  async release(identity: WorkerIdentity, assignmentId: string): Promise<boolean> {
    const { data, error } = await this.database.rpc("release_worker_assignment", {
      p_worker_id: identity.workerId, p_credential_hash: identity.credentialHash,
      p_assignment_id: assignmentId,
    });
    if (error) throw new Error("Worker assignment release unavailable.");
    return data === true;
  }
}
