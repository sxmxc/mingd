import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expectedTemplateFilename, expectedConsoleTemplateFilename, godotVersionIdentifier, type BuildConfig } from "@mingd/build-config";

export class ArtifactValidationError extends Error {
  constructor() { super("Invalid template package."); }
}

export async function validateUpload(path: string, config: BuildConfig, dryRun: boolean): Promise<number> {
  const templates = [...new Set(config.templateKinds.map(kind => expectedTemplateFilename(config, kind)))];
  const consoles = config.platform === "windows" ? config.templateKinds.map(kind => expectedConsoleTemplateFilename(config, kind)) : [];
  const required = dryRun ? ["README.txt", "version.txt"] : ["README-mingd.txt", "version.txt", ...templates, ...consoles, ...(config.platform === "android" ? ["android_source.zip"] : [])];
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [fileURLToPath(new URL("../scripts/validate-upload.py", import.meta.url)), path], { shell: false, stdio: ["pipe", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk.toString(); if (output.length > 2048) child.kill("SIGKILL"); });
    child.stdin.on("error", () => undefined);
    child.stdin.end(JSON.stringify({ config, dryRun, templates, consoles, required, version: godotVersionIdentifier(config.godotVersion) }));
    const deadline = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("error", () => { clearTimeout(deadline); reject(new Error("Artifact validation unavailable.")); });
    child.on("close", code => {
      clearTimeout(deadline);
      if (code !== 0) { reject(new ArtifactValidationError()); return; }
      try {
        const value = JSON.parse(output).binarySizeBytes;
        if (!Number.isSafeInteger(value) || value < 0 || (!dryRun && value === 0)) throw new Error();
        resolve(value);
      } catch { reject(new ArtifactValidationError()); }
    });
  });
}
