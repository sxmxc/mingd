import { canonicalBuildConfigJson } from "./normalize.ts";

/**
 * Bump this whenever compiler/toolchain choices or SCons-generation semantics
 * change in a way that should invalidate cached artifacts.
 */
export const BUILD_RECIPE_VERSION = "2";

export function canonicalBuildCacheInput(input: unknown): string {
  return `${BUILD_RECIPE_VERSION}\n${canonicalBuildConfigJson(input)}`;
}
