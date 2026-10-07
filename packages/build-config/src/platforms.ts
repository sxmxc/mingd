import type { BuildConfig, Platform } from "./schema.ts";

export const PLATFORM_ARCHITECTURES = {
  linux: ["x86_64"], windows: ["x86_64"], web: ["wasm32"],
  android: ["arm64", "arm32", "x86_64", "x86_32"], macos: ["universal", "arm64", "x86_64"],
} as const;
export function defaultArchitecture(platform: Platform): BuildConfig["architecture"] {
  return PLATFORM_ARCHITECTURES[platform][0];
}
/** These platform toolchains and packaging paths are verified against these exact releases. */
export const MOBILE_DESKTOP_GODOT_VERSIONS = ["4.6.3", "4.7.2"] as const;
export function platformVersionSupported(platform: Platform, version: string) {
  return !["android", "macos"].includes(platform) || (MOBILE_DESKTOP_GODOT_VERSIONS as readonly string[]).includes(version);
}
export function buildArchitectures(config: BuildConfig): BuildConfig["architecture"][] {
  return config.platform === "macos" && config.architecture === "universal" ? ["arm64", "x86_64"] : [config.architecture];
}
export type WorkerTarget = "desktop" | "web" | "android" | "macos";
export function workerPlatforms(target: WorkerTarget): Platform[] {
  return target === "desktop" ? ["linux", "windows"] : [target];
}
export function workerTargetForPlatform(platform: Platform): WorkerTarget {
  return platform === "linux" || platform === "windows" ? "desktop" : platform;
}
