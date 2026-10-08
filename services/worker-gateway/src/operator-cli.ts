import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { BUILD_RECIPE_VERSION } from "@mingd/build-config";
import { WorkerHelloSchema, WorkerIdSchema, WORKER_PROTOCOL_VERSION } from "@mingd/worker-protocol";
import { createGatewayDatabase } from "./backend.js";
import { createWorkerCredential } from "./credentials.js";
import { WorkerOperator } from "./operator.js";

const usage = `Usage: npm run workers -- <command> [options]
  enroll --name <name> --target <desktop|web|android|macos> --credential-file <new-file>
         [--capacity <1..16>] [--toolchain-sha256 <digest>]
  rotate --id <worker-id> --credential-file <new-file>
  list
  revoke|enable|drain|resume --id <worker-id>
Enrollment uses this checkout's release and recipe. Credentials are saved to a
new file with mode 0600; existing files are never overwritten. macOS requires
--toolchain-sha256. No worker management HTTP routes are exposed.`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help") { console.log(usage); return; }
  const allowed: Record<string, string[]> = {
    enroll: ["name", "target", "credential-file", "capacity", "toolchain-sha256"],
    rotate: ["id", "credential-file"], list: [],
    revoke: ["id"], enable: ["id"], drain: ["id"], resume: ["id"],
  };
  if (!Object.hasOwn(allowed, command)) throw new Error("Invalid worker command.");
  const { values, positionals } = parseArgs({ args, options: Object.fromEntries(allowed[command].map(name => [name, { type: "string" as const }])), strict: true, allowPositionals: true });
  if (positionals.length) throw new Error("Unexpected worker command arguments.");
  const id = command !== "enroll" && command !== "list" ? WorkerIdSchema.parse(values.id) : undefined;
  const operator = new WorkerOperator(createGatewayDatabase());
  if (command === "list") { console.log(JSON.stringify(await operator.list(), null, 2)); return; }
  if (command === "enroll" || command === "rotate") {
    const file = values["credential-file"];
    if (!file) throw new Error("A new --credential-file is required.");
    const release = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
    const enrollment = command === "enroll" ? await operator.enroll(values.name ?? "", WorkerHelloSchema.parse({
      protocolVersion: WORKER_PROTOCOL_VERSION, release, recipeVersion: BUILD_RECIPE_VERSION,
      target: values.target, toolchainSha256: values["toolchain-sha256"] ?? null,
    }), values.capacity === undefined ? 1 : Number(values.capacity)) : null;
    const credential = enrollment ?? createWorkerCredential(id!);
    // Create the secret file before committing a hash, so a filesystem failure
    // cannot leave the operator without the new credential. Never print it.
    writeFileSync(file, `${credential.credential}\n`, { flag: "wx", mode: 0o600 });
    // Preserve the file on backend failure: a lost response may still have
    // committed the write, making this the only copy of the live credential.
    if (enrollment) await operator.saveEnrollment(enrollment);
    else await operator.rotate(credential.workerId, credential.credentialHash);
    console.log(JSON.stringify({ workerId: credential.workerId, credentialFile: file }));
    return;
  }
  await operator.setState(id!, command as "revoke" | "enable" | "drain" | "resume");
  console.log(JSON.stringify({ workerId: id, action: command }));
}

main().catch(() => {
  // Parser/filesystem/backend errors can contain secrets or environment values.
  console.error("Worker operation failed. Check arguments, credential-file permissions, backend configuration and migrations. Use --help for usage.");
  process.exitCode = 1;
});
