import { gatewayConfigFromEnvironment, executionConfigFromEnvironment } from "./config.js";
import { buildServer } from "./server.js";
import { createGatewayDatabase } from "./backend.js";
import { WorkerStore } from "./workers.js";
import { BUILD_RECIPE_VERSION } from "@mingd/build-config";
import { readFileSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { ExecutionBroker } from "./execution.js";

async function main() {
  const config = gatewayConfigFromEnvironment();
  const enabled = process.env.WORKER_GATEWAY_WORKERS_ENABLED ?? "false";
  if (!["true", "false"].includes(enabled)) throw new Error("Invalid worker control setting.");
  const release = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version as string;
  const executionConfig = executionConfigFromEnvironment(release);
  const database = enabled === "true" ? createGatewayDatabase() : undefined;
  const execution = executionConfig && database ? new ExecutionBroker(database, createGatewayDatabase(process.env, 120_000), executionConfig) : undefined;
  if (executionConfig) {
    await mkdir(executionConfig.workDir, { recursive: true });
    // Temporary disk belongs to this gateway instance, never a shared work volume.
    for (const entry of await readdir(executionConfig.workDir)) if (/^mingd-upload-[A-Za-z0-9]{6}$/.test(entry)) await rm(join(executionConfig.workDir, entry), { recursive: true, force: true });
  }
  const workers = database ? new WorkerStore(database, release, BUILD_RECIPE_VERSION, () => execution?.accepting() ?? false) : undefined;
  const server = buildServer({ logLevel: config.logLevel, workers, execution, workDir: executionConfig?.workDir, maxUploads: executionConfig?.maxUploads });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    try { await server.close(); }
    catch { server.log.error("Gateway shutdown failed"); process.exitCode = 1; }
    finally { clearTimeout(deadline); }
  };
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
  try {
    if (execution) await execution.start();
    await server.listen({ host: config.host, port: config.port });
  }
  catch {
    server.log.error("Gateway could not start; check listener, backend and queue configuration");
    await shutdown();
    process.exitCode = 1;
  }
}

main().catch(() => {
  // Do not echo environment values or backend errors into startup logs.
  process.stderr.write("Worker gateway configuration could not be loaded.\n");
  process.exitCode = 1;
});
