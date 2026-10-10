import { normalizeBuildConfig } from "./normalize.ts";

/** The user-facing package name, independent of its cache/storage identity. */
export function templateArchiveFilename(input: unknown): string {
  const config = normalizeBuildConfig(input);
  return `mingd-${config.godotVersion}-${config.platform}-${config.architecture}-${config.templateKinds.join("-")}.tpz`;
}
