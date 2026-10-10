import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { CredentialFileError, credentialFilePath, writeCredentialFile } from "./credential-file.js";
import { BUILD_RECIPE_VERSION } from "@mingd/build-config";
import { WorkerHelloSchema, WorkerIdSchema, WORKER_PROTOCOL_VERSION } from "@mingd/worker-protocol";
import { createGatewayDatabase } from "./backend.js";
import { createWorkerCredential } from "./credentials.js";
import { WorkerOperator } from "./operator.js";
import { BulkWorkerError, bulkWorkers } from "./operator-bulk.js";

const usage = `Usage: npm run workers -- <command> [options]
  enroll --name <name> --target <desktop|web|android|macos> --credential-file <new-file>
         [--capacity <1..16>] [--toolchain-sha256 <digest>]
  rotate --id <worker-id> --credential-file <new-file>
  drain --all [--wait] [--timeout-seconds <seconds>]
  resume --all
  rotate|upgrade --all --credential-dir <new-directory>
         [--toolchain-sha256 <digest> (upgrade only, macOS workers)]
  list
  revoke|enable|drain|resume --id <worker-id>
Enrollment uses this checkout's builder release and recipe. Credentials are saved to a
new file with mode 0600; existing files are never overwritten. Bulk operations
select enabled workers only. Bulk credentials require a drained, idle fleet;
upgrade also updates recipe/release enrollment while preserving worker IDs.
Bulk files use desktop.token, web.token, android.token and macos.token;
multiple workers of one target use <platform>-<worker-id>.token instead.
Relative paths
resolve from the directory where you invoked npm. macOS requires
--toolchain-sha256. No worker management HTTP routes are exposed.`;

let failureStep = "Invalid command or arguments. Use --help for usage.";

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help") { console.log(usage); return; }
  const allowed: Record<string, string[]> = {
    enroll: ["name", "target", "credential-file", "capacity", "toolchain-sha256"],
    rotate: ["id", "credential-file", "all", "credential-dir"], list: [],
    upgrade: ["all", "credential-dir", "toolchain-sha256"],
    revoke: ["id"], enable: ["id"], drain: ["id", "all", "wait", "timeout-seconds"], resume: ["id", "all"],
  };
  if (!Object.hasOwn(allowed, command)) throw new Error("Invalid worker command.");
  const { values, positionals } = parseArgs({ args, options: Object.fromEntries(allowed[command].map(name => [name, { type: ["all", "wait"].includes(name) ? "boolean" as const : "string" as const }])), strict: true, allowPositionals: true });
  if (positionals.length) throw new Error("Unexpected worker command arguments.");
  const string = (name: string) => typeof values[name] === "string" ? values[name] as string : undefined;
  const all = values.all === true;
  if ((all && values.id) || (command === "upgrade" && !all) || (!all && (values.wait || values["timeout-seconds"] || values["credential-dir"]))) throw new Error("Invalid bulk options.");
  if (all && values["credential-file"]) throw new Error("Use --credential-dir for bulk credentials.");
  if (all && ["rotate", "upgrade"].includes(command) && !string("credential-dir")) throw new Error("A new --credential-dir is required.");
  const timeout = string("timeout-seconds") === undefined ? undefined : Number(string("timeout-seconds"));
  if (timeout !== undefined && (!values.wait || !Number.isInteger(timeout) || timeout < 1 || timeout > 86400)) throw new Error("Invalid drain timeout.");
  const id = command !== "enroll" && command !== "list" && !all ? WorkerIdSchema.parse(values.id) : undefined;
  failureStep = "Backend configuration is missing or invalid. Check SUPABASE_URL and SUPABASE_SECRET_KEY.";
  const operator = new WorkerOperator(createGatewayDatabase());
  failureStep = "Backend request failed. Check connectivity, backend credentials and migrations.";
  if (command === "list") { console.log(JSON.stringify(await operator.list(), null, 2)); return; }
  if (all) {
    const release = JSON.parse(readFileSync(new URL("../../builder/package.json", import.meta.url), "utf8")).version;
    // The bulk helper emits only known-safe operational errors, never backend text.
    if (command === "rotate" || command === "upgrade") failureStep = "Bulk credential operation stopped. Preserve the new credential directory and inspect its manifest before retrying; workers remain draining.";
    try {
      const result = await bulkWorkers(operator, command as "drain" | "resume" | "rotate" | "upgrade", {
        directory: string("credential-dir"), wait: values.wait === true, timeoutSeconds: timeout,
        release, toolchainSha256: string("toolchain-sha256"),
      });
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      if (error instanceof CredentialFileError) throw error;
      // Do not relay schema, filesystem or backend exceptions; approved errors
      // come from the bulk operation's explicit failure states.
      if (error instanceof BulkWorkerError) failureStep = error.message;
      throw error;
    }
    return;
  }
  if (command === "enroll" || command === "rotate") {
    failureStep = "Invalid enrollment/rotation arguments. Use --help for usage.";
    const requestedFile = string("credential-file");
    if (!requestedFile) throw new Error("A new --credential-file is required.");
    const file = credentialFilePath(requestedFile);
    const release = JSON.parse(readFileSync(new URL("../../builder/package.json", import.meta.url), "utf8")).version;
    const enrollment = command === "enroll" ? await operator.enroll(string("name") ?? "", WorkerHelloSchema.parse({
      protocolVersion: WORKER_PROTOCOL_VERSION, release, recipeVersion: BUILD_RECIPE_VERSION,
      target: values.target, toolchainSha256: string("toolchain-sha256") ?? null,
    }), values.capacity === undefined ? 1 : Number(values.capacity)) : null;
    const credential = enrollment ?? createWorkerCredential(id!);
    // Create the secret file before committing a hash, so a filesystem failure
    // cannot leave the operator without the new credential. Never print it.
    failureStep = "Could not create credential file. Check its parent directory and permissions.";
    writeCredentialFile(file, credential.credential);
    failureStep = `Backend ${command} request failed. Credential file was preserved; worker ID: ${credential.workerId}. Check backend connectivity, credentials and migrations before retrying.`;
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

main().catch((error: unknown) => {
  // Parser/filesystem/backend errors can contain secrets or environment values.
  console.error(`Worker operation failed. ${error instanceof CredentialFileError ? error.message : failureStep}`);
  process.exitCode = 1;
});
