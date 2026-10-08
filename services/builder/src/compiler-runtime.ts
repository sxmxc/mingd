import { resolve } from "node:path";
import type { WorkerTarget } from "@mingd/build-config";

/** Local operator settings only. Queue, API and database credentials belong to orchestration. */
export type CompilerRuntime = {
  target: WorkerTarget;
  dryRun: boolean;
  godotCacheDir: string;
  workDir: string;
  ccacheDir: string;
  sconsJobs: number;
  compileTimeoutMs: number;
};

export function compilerRuntimeFromEnvironment(values: NodeJS.ProcessEnv = process.env): CompilerRuntime {
  const target = values.BUILDER_TARGET ?? "desktop";
  if (!["desktop", "web", "android", "macos"].includes(target)) throw new Error("Unsupported BUILDER_TARGET.");
  return {
    target: target as WorkerTarget,
    dryRun: values.BUILDER_DRY_RUN === "true",
    godotCacheDir: resolve(values.GODOT_CACHE_DIR ?? "/cache/godot"),
    workDir: resolve(values.GODOT_WORK_DIR ?? "/work/jobs"),
    ccacheDir: resolve(values.CCACHE_DIR ?? "/cache/ccache"),
    sconsJobs: Math.max(1, Number(values.SCONS_JOBS ?? "4")),
    compileTimeoutMs: Math.max(60_000, Number(values.BUILDER_COMPILE_TIMEOUT_MS ?? String(2 * 60 * 60 * 1000))),
  };
}
