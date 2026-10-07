import { canonicalBuildConfigJson } from "./normalize.ts";
import { SUPPORTED_GODOT_VERSIONS, type SupportedGodotVersion } from "./versions.ts";

/**
 * Bump this whenever compiler/toolchain choices or SCons-generation semantics
 * change in a way that should invalidate cached artifacts.
 */
export const BUILD_RECIPE_VERSION = "9";

export function canonicalBuildCacheInput(input: unknown, resolvedSource?: SupportedGodotVersion, macosToolchainSha256?: string): string {
  const configJson = canonicalBuildConfigJson(input);
  const config = JSON.parse(configJson) as { godotVersion: keyof typeof SUPPORTED_GODOT_VERSIONS; platform: string };
  const source = resolvedSource ?? SUPPORTED_GODOT_VERSIONS[config.godotVersion];
  if (!source || source.id !== config.godotVersion || !/^[a-f0-9]{64}$/.test(source.sourceSha256)) {
    throw new Error("Resolve official Godot source metadata before hashing this version.");
  }
  if (config.platform === "macos" && !/^[a-f0-9]{64}$/.test(macosToolchainSha256 ?? "")) throw new Error("macOS builds require a verified toolchain SHA-256.");
  const platformRecipe = config.platform === "android" ? "\nandroid-1:ndk-29.0.14206865:sdk-36:build-tools-36.1.0:java-17" : config.platform === "macos" ? `\nmacos-1:osxcross:sdk-27.0:compatibility:${macosToolchainSha256}` : "";
  return `${BUILD_RECIPE_VERSION}${platformRecipe}\n${source.sourceUrl}\n${source.sourceSha256}\n${configJson}`;
}
