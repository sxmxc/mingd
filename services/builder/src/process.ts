import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";

export async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; logFile?: string; timeoutMs?: number; onOutput?: (chunk: Buffer) => void; resourceFile?: string; onPeakRss?: (value: number | null) => void } = {},
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(options.resourceFile ? "/usr/bin/time" : command, options.resourceFile ? ["-f", "%M", "-o", options.resourceFile, "--", command, ...args] : args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      detached: process.platform !== "win32",
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
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => {
      try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Process group has exited. */ }
    };
    const timeout = options.timeoutMs ? setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
      forceKill = setTimeout(() => kill("SIGKILL"), 5000);
    }, options.timeoutMs) : undefined;
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      log?.end();
      reject(error);
    });
    child.on("close", async (code) => {
      if (timeout) clearTimeout(timeout);
      // A wrapper can exit before a descendant that ignored TERM. Do not leave
      // that compiler running after the measured command has timed out.
      if (timedOut) kill("SIGKILL");
      if (forceKill) clearTimeout(forceKill);
      log?.end();
      if (options.resourceFile) {
        const content = await readFile(options.resourceFile, "utf8").catch(() => "");
        const value = Number(content.trim().split("\n").at(-1));
        options.onPeakRss?.(content.trim() && Number.isFinite(value) && value >= 0 ? value : null);
      }
      code === 0 && !timedOut ? resolve() : reject(new Error(timedOut ? `${command} exceeded its ${options.timeoutMs}ms timeout` : `${command} exited with code ${code}`));
    });
  });
}
