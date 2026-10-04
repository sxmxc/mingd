import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

export async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; logFile?: string; timeoutMs?: number } = {},
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
    let timedOut = false;
    const timeout = options.timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs) : undefined;
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      log?.end();
      reject(error);
    });
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      log?.end();
      code === 0 && !timedOut ? resolve() : reject(new Error(timedOut ? `${command} exceeded its ${options.timeoutMs}ms timeout` : `${command} exited with code ${code}`));
    });
  });
}
