import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { Platform } from "@mingd/build-config";
import type { BuildMeasurements } from "./performance.js";
const exec = promisify(execFile);

export function compilerForPlatform(platform: Platform) {
  return platform === "web" ? "em++" : platform === "windows" ? "x86_64-w64-mingw32-g++" : "g++";
}

export function compilerCacheEnvironment(sourceDir: string, cacheDir: string, statsLog: string): NodeJS.ProcessEnv {
  return { ...process.env, CCACHE_DIR: cacheDir, CCACHE_BASEDIR: sourceDir, CCACHE_STATSLOG: statsLog };
}

export function parseCacheLog(log: string) {
  const counters: Record<string, number> = {};
  for (const line of log.split("\n")) {
    const key = line.trim();
    if (/^[a-z][a-z0-9_]+$/.test(key)) counters[key] = (counters[key] ?? 0) + 1;
  }
  const hits = (counters.direct_cache_hit ?? 0) + (counters.preprocessed_cache_hit ?? 0);
  const misses = counters.cache_miss ?? 0;
  return { counters, hits, misses, usageVerified: hits + misses > 0 };
}

export async function collectCacheDiagnostics(platform: Platform, statsLog: string, processEnv: NodeJS.ProcessEnv): Promise<NonNullable<BuildMeasurements["cache"]>> {
  const [compiler, cacheVersion, log] = await Promise.all([
    exec(compilerForPlatform(platform), ["--version"], { env: processEnv, timeout: 10000 }),
    exec("ccache", ["--version"], { env: processEnv, timeout: 10000 }),
    readFile(statsLog, "utf8").catch(() => ""),
  ]);
  return { ...parseCacheLog(log), compiler: compiler.stdout.split("\n")[0], cacheVersion: cacheVersion.stdout.split("\n")[0] };
}
