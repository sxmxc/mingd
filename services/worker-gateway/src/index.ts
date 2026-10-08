import { gatewayConfigFromEnvironment } from "./config.js";
import { buildServer } from "./server.js";

async function main() {
  const config = gatewayConfigFromEnvironment();
  const server = buildServer({ logLevel: config.logLevel });
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
  try { await server.listen({ host: config.host, port: config.port }); }
  catch {
    server.log.error("Gateway listener could not start; check host and port configuration");
    await shutdown();
    process.exitCode = 1;
  }
}

main().catch(() => {
  // Do not echo environment values or backend errors into startup logs.
  process.stderr.write("Worker gateway configuration could not be loaded.\n");
  process.exitCode = 1;
});
