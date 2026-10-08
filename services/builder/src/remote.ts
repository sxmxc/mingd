import { runRemoteWorker } from "./remote-runtime.js";
const shutdown = new AbortController();
process.once("SIGTERM", () => shutdown.abort()); process.once("SIGINT", () => shutdown.abort());
runRemoteWorker(process.env, fetch, shutdown).catch(() => {
  console.error("Remote worker stopped. Check HTTPS connectivity, enrollment, release and local toolchain/resource configuration."); process.exitCode = 1;
});
