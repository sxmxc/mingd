// Run with node --import tsx inside the Web worker image, using a disposable cache.
// Pure config tests cover every preset; this audit checks every compiler target,
// kind and Web threading mode against both verified release sources.
import { spawn } from "node:child_process";
import { ensureGodotSource } from "../services/builder/src/source-cache.ts";
import { GODOT_VERSION_IDS } from "../packages/build-config/src/versions.ts";

const jobs = [];
for (const version of GODOT_VERSION_IDS) {
  const source = await ensureGodotSource(version);
  for (const platform of ["linux", "windows", "web"]) jobs.push({ version, source, platform });
}

let failed = false;
async function auditNext() {
  while (jobs.length) {
    const { version, source, platform } = jobs.shift();
    console.log(`Auditing ${version}/${platform}`);
    const status = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--test", "services/builder/test/godot-source.test.ts"], {
        stdio: "inherit",
        env: { ...process.env, MINGD_GODOT_SOURCE: source, MINGD_GODOT_VERSION: version,
          MINGD_AUDIT_WEB: String(platform === "web"), MINGD_AUDIT_PLATFORM: platform, MINGD_AUDIT_STANDARD_ONLY: "true" },
      });
      const timeout = setTimeout(() => child.kill("SIGTERM"), 15 * 60 * 1000);
      child.once("error", error => { clearTimeout(timeout); reject(error); });
      child.once("exit", code => { clearTimeout(timeout); resolve(code); });
    });
    if (status !== 0) failed = true;
  }
}
await Promise.all([auditNext(), auditNext(), auditNext()]);
if (failed) process.exitCode = 1;
