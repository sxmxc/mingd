import type { SupabaseClient } from "@supabase/supabase-js";
import { WorkerHelloSchema } from "@mingd/worker-protocol";
import type { WorkerHello } from "@mingd/worker-protocol";
import { createWorkerCredential } from "./credentials.js";

export class WorkerOperator {
  constructor(private readonly database: SupabaseClient) {}

  async enroll(name: string, rawHello: WorkerHello, capacity = 1) {
    const hello = WorkerHelloSchema.parse(rawHello);
    if (!name || name.trim() !== name || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) throw new Error("Invalid worker name.");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16) throw new Error("Worker capacity must be between 1 and 16.");
    return { ...createWorkerCredential(), row: {
      name, target: hello.target, software_release: hello.release, recipe_version: hello.recipeVersion,
      toolchain_sha256: hello.toolchainSha256, max_assignments: capacity,
    } };
  }

  async saveEnrollment(enrollment: Awaited<ReturnType<WorkerOperator["enroll"]>>) {
    const { error } = await this.database.from("build_workers").insert({
      ...enrollment.row, id: enrollment.workerId, credential_hash: enrollment.credentialHash,
    });
    if (error) throw new Error("Worker enrollment failed.");
  }

  async rotate(workerId: string, credentialHash: string) {
    const { error } = await this.database.from("build_workers").update({ credential_hash: credentialHash })
      .eq("id", workerId).select("id").single();
    if (error) throw new Error("Worker credential rotation failed.");
  }

  async setState(workerId: string, action: "revoke" | "enable" | "drain" | "resume") {
    const fields = action === "revoke" ? { disabled: true } : action === "enable" ? { disabled: false }
      : action === "drain" ? { draining: true } : { draining: false };
    const { error } = await this.database.from("build_workers").update(fields).eq("id", workerId).select("id").single();
    if (error) throw new Error("Worker state update failed.");
  }

  async list() {
    // Credential hashes never leave the operator's backend connection.
    const { data, error } = await this.database.from("build_workers")
      .select("id,name,target,software_release,recipe_version,toolchain_sha256,max_assignments,disabled,draining,last_seen_at,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Worker listing failed.");
    return data ?? [];
  }
}
