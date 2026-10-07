function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY"),
  redisUrl: () => required("REDIS_URL"),
  queueName: () => process.env.BUILDER_QUEUE_NAME ?? "godot-builds",
  webQueueName: () => process.env.WEB_BUILDER_QUEUE_NAME ?? "godot-web-builds",
  androidQueueName: () => process.env.ANDROID_BUILDER_QUEUE_NAME ?? "godot-android-builds",
  macosQueueName: () => process.env.MACOS_BUILDER_QUEUE_NAME ?? "godot-macos-builds",
  artifactBucket: () => process.env.ARTIFACT_BUCKET ?? "build-artifacts",
  signedDownloadTtl: () => Number(process.env.SIGNED_DOWNLOAD_TTL_SECONDS ?? "900"),
};
