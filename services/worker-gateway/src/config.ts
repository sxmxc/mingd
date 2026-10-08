export type GatewayLogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
export type GatewayConfig = { host: string; port: number; logLevel: GatewayLogLevel };

export function gatewayConfigFromEnvironment(values: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const host = values.WORKER_GATEWAY_HOST ?? "127.0.0.1";
  const portText = values.WORKER_GATEWAY_PORT ?? "3001";
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("WORKER_GATEWAY_PORT must be an integer between 1 and 65535.");
  }
  if (!host || host.trim() !== host || /[\s/]/.test(host)) throw new Error("WORKER_GATEWAY_HOST must be a host or IP address.");
  const logLevel = values.WORKER_GATEWAY_LOG_LEVEL ?? "info";
  if (!["fatal", "error", "warn", "info", "debug", "trace", "silent"].includes(logLevel)) {
    throw new Error("Unsupported WORKER_GATEWAY_LOG_LEVEL.");
  }
  return { host, port, logLevel: logLevel as GatewayLogLevel };
}

export function executionConfigFromEnvironment(release: string, values: NodeJS.ProcessEnv = process.env): import("./execution.js").ExecutionOptions | null {
  const enabled = values.WORKER_GATEWAY_EXECUTION_ENABLED ?? "false";
  if (!["true", "false"].includes(enabled)) throw new Error("Invalid execution setting.");
  if (enabled === "false") return null;
  if (values.WORKER_GATEWAY_WORKERS_ENABLED !== "true" || !values.REDIS_URL) throw new Error("Execution requires worker control and internal Redis.");
  const integer = (name: string, fallback: number, max: number) => {
    const text = values[name] ?? String(fallback); const number = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number < 1 || number > max) throw new Error(`Invalid ${name}.`);
    return number;
  };
  return { release, redisUrl: values.REDIS_URL,
    queues: { desktop: values.BUILDER_QUEUE_NAME ?? "godot-builds", web: values.WEB_BUILDER_QUEUE_NAME ?? "godot-web-builds",
      android: values.ANDROID_BUILDER_QUEUE_NAME ?? "godot-android-builds", macos: values.MACOS_BUILDER_QUEUE_NAME ?? "godot-macos-builds" },
    concurrency: integer("WORKER_GATEWAY_QUEUE_CONCURRENCY", 16, 64), maxUploads: integer("WORKER_GATEWAY_MAX_UPLOADS", 2, 4),
    maxJobMs: integer("WORKER_GATEWAY_MAX_JOB_MS", 12 * 60 * 60 * 1000, 48 * 60 * 60 * 1000),
    dryRun: values.BUILDER_DRY_RUN === "true", artifactBucket: values.ARTIFACT_BUCKET ?? "build-artifacts",
    workDir: values.WORKER_GATEWAY_WORK_DIR ?? "/tmp/mingd-gateway", toolchainSha256: values.MACOS_TOOLCHAIN_SHA256 || null,
  };
}
