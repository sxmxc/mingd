import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

export async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; logFile?: string; timeoutMs?: number; onOutput?: (chunk: Buffer) => void } = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const log = options.logFile ? createWriteStream(options.logFile, { flags: "a" }) : undefined;
    let loggedBytes = 0;
    const output = (chunk: Buffer) => {
      options.onOutput?.(chunk);
      // Keep local logs bounded too. The activity collector retains the live tail.
      if (loggedBytes < 2 * 1024 * 1024) {
        log?.write(chunk.subarray(0, 2 * 1024 * 1024 - loggedBytes));
        loggedBytes += chunk.length;
      }
    };
    child.stdout.on("data", output);
    child.stderr.on("data", output);
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
