import { compilerRuntimeFromEnvironment } from "./compiler-runtime.js";
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const runtime = compilerRuntimeFromEnvironment();
const target = runtime.target;
export const env = {
  ...runtime,
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  redisUrl: required("REDIS_URL"),
  queueName: process.env.BUILDER_QUEUE_NAME ?? ({ desktop: "godot-builds", web: "godot-web-builds", android: "godot-android-builds", macos: "godot-macos-builds" }[target]),
  artifactBucket: process.env.ARTIFACT_BUCKET ?? "build-artifacts",
  concurrency: Math.max(1, Number(process.env.BUILDER_CONCURRENCY ?? "1")),
};
