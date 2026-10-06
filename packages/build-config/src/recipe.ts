import { canonicalBuildConfigJson } from "./normalize.ts";
import { SUPPORTED_GODOT_VERSIONS, type SupportedGodotVersion } from "./versions.ts";

/**
 * Bump this whenever compiler/toolchain choices or SCons-generation semantics
 * change in a way that should invalidate cached artifacts.
 */
export const BUILD_RECIPE_VERSION = "8";

export function canonicalBuildCacheInput(input: unknown, resolvedSource?: SupportedGodotVersion): string {
  const configJson = canonicalBuildConfigJson(input);
  const config = JSON.parse(configJson) as { godotVersion: keyof typeof SUPPORTED_GODOT_VERSIONS };
  const source = resolvedSource ?? SUPPORTED_GODOT_VERSIONS[config.godotVersion];
  if (!source || source.id !== config.godotVersion || !/^[a-f0-9]{64}$/.test(source.sourceSha256)) {
    throw new Error("Resolve official Godot source metadata before hashing this version.");
  }
  return `${BUILD_RECIPE_VERSION}\n${source.sourceUrl}\n${source.sourceSha256}\n${configJson}`;
}
