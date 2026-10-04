import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

export async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; logFile?: string } = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const log = options.logFile ? createWriteStream(options.logFile, { flags: "a" }) : undefined;
    child.stdout.on("data", (chunk) => { process.stdout.write(chunk); log?.write(chunk); });
    child.stderr.on("data", (chunk) => { process.stderr.write(chunk); log?.write(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      log?.end();
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
