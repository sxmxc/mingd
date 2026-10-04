import { createHash } from "node:crypto";
import { canonicalBuildCacheInput } from "@gdslimmer/build-config";

export function hashBuildConfig(input: unknown): string {
  return createHash("sha256").update(canonicalBuildCacheInput(input)).digest("hex");
}
