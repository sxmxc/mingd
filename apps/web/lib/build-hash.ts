import { createHash } from "node:crypto";
import { canonicalBuildCacheInput, type SupportedGodotVersion } from "@mingd/build-config";

export function hashBuildConfig(input: unknown, source?: SupportedGodotVersion): string {
  return createHash("sha256").update(canonicalBuildCacheInput(input, source)).digest("hex");
}
