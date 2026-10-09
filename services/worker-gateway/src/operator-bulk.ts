import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BUILD_RECIPE_VERSION } from "@mingd/build-config";
import { WorkerHelloSchema, WorkerIdSchema, WORKER_PROTOCOL_VERSION } from "@mingd/worker-protocol";
import { credentialFilePath, writeCredentialFile } from "./credential-file.js";
import { createWorkerCredential } from "./credentials.js";
import type { WorkerOperator } from "./operator.js";

export class BulkWorkerError extends Error {}

export async function bulkWorkers(operator: WorkerOperator, command: "drain" | "resume" | "rotate" | "upgrade", options: {
  directory?: string; wait?: boolean; timeoutSeconds?: number; release: string; toolchainSha256?: string;
}) {
  const workers = await operator.enabledWorkers();
  const ids = workers.map(worker => WorkerIdSchema.parse(worker.id));
  if (!ids.length) return { action: command, workers: [], message: "No enabled workers." };
  if (command === "drain" || command === "resume") {
    const completed: string[] = [];
    for (const id of ids) {
      try { await operator.setState(id, command); completed.push(id); }
      catch { throw new BulkWorkerError(`Bulk ${command} stopped. Updated worker IDs: ${completed.join(", ") || "none"}; inspect list before retrying.`); }
    }
    if (options.wait) {
      const deadline = Date.now() + (options.timeoutSeconds ?? 3600) * 1000;
      while (await operator.activeAssignments(ids)) {
        if (Date.now() >= deadline) throw new BulkWorkerError("Drain wait timed out. Workers remain draining; inspect active assignments before stopping them.");
        await delay(1000);
      }
    }
    return { action: command, workers: ids, ...(options.wait ? { activeAssignments: 0 } : {}) };
  }
  if (workers.some(worker => !worker.draining) || await operator.activeAssignments(ids)) {
    throw new BulkWorkerError("Bulk credentials require all enabled workers to be draining with no active assignments. Drain and wait first.");
  }
  if (!options.directory) throw new BulkWorkerError("A new --credential-dir is required.");
  const planned = workers.map(worker => ({ worker, ...createWorkerCredential(worker.id), hello: command === "upgrade" ? WorkerHelloSchema.parse({
    protocolVersion: WORKER_PROTOCOL_VERSION, release: options.release, recipeVersion: BUILD_RECIPE_VERSION,
    target: worker.target, toolchainSha256: worker.target === "macos" ? options.toolchainSha256 ?? worker.toolchain_sha256 : null,
  }) : undefined }));
  const directory = credentialFilePath(options.directory);
  // Reserve a NEW private directory and create every file before any DB mutation.
  // This prevents a late filesystem failure from partially rotating the fleet.
  try { mkdirSync(directory, { mode: 0o700 }); }
  catch { throw new BulkWorkerError("Could not create new credential directory. Its parent must exist and the directory must not already exist."); }
  const manifest = planned.map(item => ({ workerId: item.worker.id, name: item.worker.name, target: item.worker.target,
    credentialFile: join(directory, `${item.worker.id}.token`), outcome: "pending" }));
  const save = () => writeFileSync(join(directory, "manifest.json"), JSON.stringify({ action: command, workers: manifest }, null, 2) + "\n", { mode: 0o600 });
  for (let index = 0; index < planned.length; index++) writeCredentialFile(manifest[index].credentialFile, planned[index].credential);
  save();
  for (let index = 0; index < planned.length; index++) {
    // Mark before sending: transport failure may have committed the mutation.
    manifest[index].outcome = "uncertain"; save();
    try {
      await operator.replaceDrainedCredential(planned[index].workerId, planned[index].credentialHash, planned[index].hello);
    } catch {
      throw new BulkWorkerError(`Bulk ${command} stopped at worker ${planned[index].workerId}. Credential files and manifest were preserved; verify the uncertain worker with its saved token before retrying. Workers remain draining.`);
    }
    manifest[index].outcome = "updated"; save();
  }
  return { action: command, credentialDirectory: directory, workers: manifest };
}
