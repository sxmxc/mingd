function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  redisUrl: required("REDIS_URL"),
  queueName: process.env.BUILDER_QUEUE_NAME ?? "godot-builds",
  artifactBucket: process.env.ARTIFACT_BUCKET ?? "build-artifacts",
  concurrency: Math.max(1, Number(process.env.BUILDER_CONCURRENCY ?? "1")),
  dryRun: process.env.BUILDER_DRY_RUN === "true",
  godotCacheDir: process.env.GODOT_CACHE_DIR ?? "/cache/godot",
  workDir: process.env.GODOT_WORK_DIR ?? "/work/jobs",
  ccacheDir: process.env.CCACHE_DIR ?? "/cache/ccache",
  sconsJobs: Math.max(1, Number(process.env.SCONS_JOBS ?? "4")),
};
