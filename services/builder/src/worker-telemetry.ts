import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import { WorkerTelemetrySchema, type WorkerTelemetry } from "@mingd/worker-protocol";
const exec = promisify(execFile);

async function readCcache(args: string[], cacheDir: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const command = exec("ccache", args, {
    env: { ...process.env, CCACHE_DIR: cacheDir }, timeout: 5000, maxBuffer: 64 * 1024,
  });
  // A failed spawn can leave Node/libuv's process handle with an invalid PID.
  // Register cancellation only after spawn succeeds, never on that handle.
  const cancel = () => {
    if (command.child.exitCode === null && command.child.signalCode === null) command.child.kill();
  };
  const spawned = () => {
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  };
  command.child.once("spawn", spawned);
  try { return await command; }
  finally {
    command.child.removeListener("spawn", spawned);
    signal?.removeEventListener("abort", cancel);
  }
}

export function parseCcacheCounters(output: string) {
  const counters: Record<string, number> = {};
  for (const line of output.trim().split("\n")) {
    const match = /^([a-z][a-z0-9_]{0,99})\s+(\d+)$/.exec(line.trim());
    if (!match || !Number.isSafeInteger(Number(match[2]))) throw new Error("Invalid ccache statistics.");
    counters[match[1]] = Number(match[2]);
  }
  if (Object.keys(counters).length > 100 || counters.cache_size_kibibyte === undefined || counters.cache_miss === undefined) throw new Error("Incomplete ccache statistics.");
  return counters;
}

export class WorkerTelemetrySampler {
  private previous?: { usage: number; time: number };
  constructor(private readonly cacheDir: string, private readonly cgroupDir = "/sys/fs/cgroup") {}
  async sample(signal?: AbortSignal): Promise<WorkerTelemetry> {
    const report: WorkerTelemetry = { schemaVersion: 1, uptimeSeconds: process.uptime(), ccache: null, container: null };
    const cache = async () => {
      try {
        const [stats, size, version] = await Promise.all([
          readCcache(["--print-stats"], this.cacheDir, signal), readCcache(["--get-config", "max_size"], this.cacheDir, signal), readCcache(["--version"], this.cacheDir, signal),
        ]);
        const counters = parseCcacheCounters(stats.stdout);
        report.ccache = { counters, hits: (counters.direct_cache_hit ?? 0) + (counters.preprocessed_cache_hit ?? 0),
          misses: counters.cache_miss, sizeBytes: counters.cache_size_kibibyte * 1024,
          files: counters.files_in_cache ?? 0, maxSize: size.stdout.trim(), version: version.stdout.split("\n")[0].trim() };
      } catch { /* Report unavailable, never invented zero counters. */ }
    };
    const container = async () => {
      try {
        // Only accept the private root of a cgroup-v2 container namespace. A host
        // process or --cgroupns=host must not report whole-host usage as its own.
        if (this.cgroupDir === "/sys/fs/cgroup" && (await readFile("/proc/self/cgroup", "utf8")).trim() !== "0::/") return;
        const [cpu, limit, memory, memoryLimit, pids] = await Promise.all(["cpu.stat", "cpu.max", "memory.current", "memory.max", "pids.current"].map(file => readFile(join(this.cgroupDir, file), "utf8")));
        const usage = Number(/^usage_usec\s+(\d+)$/m.exec(cpu)?.[1]);
        const time = performance.now();
        const cores = this.previous && usage >= this.previous.usage && time > this.previous.time
          ? (usage - this.previous.usage) / ((time - this.previous.time) * 1000) : null;
        const [quota, period] = limit.trim().split(/\s+/);
        report.container = { cpuUsageUsec: usage, cpuCoresUsed: cores, cpuLimitCores: quota === "max" ? null : Number(quota) / Number(period),
          memoryBytes: Number(memory.trim()), memoryLimitBytes: memoryLimit.trim() === "max" ? null : Number(memoryLimit.trim()), pids: Number(pids.trim()) };
        this.previous = { usage, time };
      } catch { /* cgroup v1 and inaccessible controllers are unavailable. */ }
    };
    await Promise.all([cache(), container()]);
    const parsed = WorkerTelemetrySchema.safeParse(report);
    // A malformed local tool result cannot break the compiler or worker lease.
    return parsed.success ? parsed.data : { schemaVersion: 1, uptimeSeconds: process.uptime(), ccache: null, container: null };
  }
}
