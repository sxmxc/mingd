import { z } from "zod";
import { BuildConfigSchema, BuildFeaturesSchema } from "./schema.ts";
import { assertRealBuildSupported } from "./scons.ts";

export const GDBUILD_MAX_BYTES = 64 * 1024;
// Portable files contain semantic settings only, never IDs, credentials, source URLs or commands.
const FileConfigSchema = BuildConfigSchema.safeExtend({ features: BuildFeaturesSchema.strict() }).strict();
export const GdBuildFileSchema = z.object({
  format: z.literal("gdbuild"), version: z.literal(1),
  name: z.string().trim().min(1).max(80),
  config: FileConfigSchema.transform(config => assertRealBuildSupported(config)),
}).strict();
export type GdBuildFile = z.infer<typeof GdBuildFileSchema>;
export function parseGdBuildFile(text: string): GdBuildFile {
  if (new TextEncoder().encode(text).length > GDBUILD_MAX_BYTES) throw new Error("Recipe files must be 64 KiB or smaller.");
  try { return GdBuildFileSchema.parse(JSON.parse(text.replace(/^\uFEFF/, ""))); }
  catch { throw new Error("Invalid .gdbuild file. Use a version 1 recipe with supported build settings."); }
}
export function serializeGdBuildFile(name: string, config: unknown): string {
  return JSON.stringify(GdBuildFileSchema.parse({ format: "gdbuild", version: 1, name, config }), null, 2) + "\n";
}
export function gdBuildFilename(name: string) {
  return (name.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "recipe") + ".gdbuild";
}
