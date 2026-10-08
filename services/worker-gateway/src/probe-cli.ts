import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { credentialFilePath } from "./credential-file.js";
import { BUILD_RECIPE_VERSION } from "@mingd/build-config";
import { WorkerHelloSchema, WORKER_PROTOCOL_VERSION } from "@mingd/worker-protocol";
import { probeWorkerGateway } from "./probe.js";

async function main() {
  const { values } = parseArgs({ options: {
    gateway: { type: "string" }, "credential-file": { type: "string" },
    target: { type: "string" }, "toolchain-sha256": { type: "string" }, help: { type: "boolean" },
  }, strict: true });
  if (values.help) {
    console.log("npm run probe --workspace @mingd/worker-gateway -- --gateway <https-origin> --credential-file <file> --target <target> [--toolchain-sha256 <digest>]");
    return;
  }
  if (!values.gateway || !values["credential-file"]) throw new Error("Missing gateway or credential file.");
  const release = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  const hello = WorkerHelloSchema.parse({ protocolVersion: WORKER_PROTOCOL_VERSION, release,
    recipeVersion: BUILD_RECIPE_VERSION, target: values.target, toolchainSha256: values["toolchain-sha256"] ?? null });
  const credential = readFileSync(credentialFilePath(values["credential-file"]), "utf8").trim();
  console.log(JSON.stringify(await probeWorkerGateway(values.gateway, credential, hello)));
}
main().catch(() => {
  console.error("Worker heartbeat probe failed. Check HTTPS connectivity, enrollment, release/target/toolchain compatibility and credential file.");
  process.exitCode = 1;
});
