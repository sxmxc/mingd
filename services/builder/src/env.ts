import { resolve } from "node:path";
import type { WorkerTarget } from "@mingd/build-config";
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const target = process.env.BUILDER_TARGET ?? "desktop";
if (!["desktop", "web", "android", "macos"].includes(target)) throw new Error("Unsupported BUILDER_TARGET.");
export const env = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  redisUrl: required("REDIS_URL"),
  queueName: process.env.BUILDER_QUEUE_NAME ?? ({ desktop: "godot-builds", web: "godot-web-builds", android: "godot-android-builds", macos: "godot-macos-builds" }[target as WorkerTarget]),
  target: target as WorkerTarget,
  artifactBucket: process.env.ARTIFACT_BUCKET ?? "build-artifacts",
  concurrency: Math.max(1, Number(process.env.BUILDER_CONCURRENCY ?? "1")),
  dryRun: process.env.BUILDER_DRY_RUN === "true",
  godotCacheDir: resolve(process.env.GODOT_CACHE_DIR ?? "/cache/godot"),
  workDir: resolve(process.env.GODOT_WORK_DIR ?? "/work/jobs"),
  ccacheDir: resolve(process.env.CCACHE_DIR ?? "/cache/ccache"),
  sconsJobs: Math.max(1, Number(process.env.SCONS_JOBS ?? "4")),
  compileTimeoutMs: Math.max(60_000, Number(process.env.BUILDER_COMPILE_TIMEOUT_MS ?? String(2 * 60 * 60 * 1000))),
};
