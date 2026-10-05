import { canonicalBuildConfigJson } from "./normalize.ts";
import { SUPPORTED_GODOT_VERSIONS } from "./versions.ts";

/**
 * Bump this whenever compiler/toolchain choices or SCons-generation semantics
 * change in a way that should invalidate cached artifacts.
 */
export const BUILD_RECIPE_VERSION = "4";

export function canonicalBuildCacheInput(input: unknown): string {
  const configJson = canonicalBuildConfigJson(input);
  const config = JSON.parse(configJson) as { godotVersion: keyof typeof SUPPORTED_GODOT_VERSIONS };
  const source = SUPPORTED_GODOT_VERSIONS[config.godotVersion];
  return `${BUILD_RECIPE_VERSION}\n${source.sourceUrl}\n${source.sourceSha256}\n${configJson}`;
}
