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
