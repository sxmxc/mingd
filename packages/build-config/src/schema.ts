import { z } from "zod";
import { GODOT_VERSION_IDS } from "./versions.ts";

export const TemplateKindSchema = z.enum(["release", "debug"]);
export const PlatformSchema = z.enum(["windows", "linux", "web"]);
export const ArchitectureSchema = z.enum(["x86_64", "wasm32"]);
export const OptimizationSchema = z.enum(["size", "size_extra"]);
export const TextServerSchema = z.enum(["advanced", "fallback"]);

export const BuildFeaturesSchema = z.object({
  engine3d: z.boolean(),
  advancedGui: z.boolean(),
  physics2d: z.boolean(),
  physics3d: z.boolean(),
  jolt: z.boolean(),
  navigation2d: z.boolean(),
  navigation3d: z.boolean(),
  multiplayer: z.boolean(),
  enet: z.boolean(),
  websocket: z.boolean(),
  webrtc: z.boolean(),
  openxr: z.boolean(),
  gltf: z.boolean(),
  csg: z.boolean(),
  gridmap: z.boolean(),
  tilemap: z.boolean(),
  svg: z.boolean(),
  oggVorbis: z.boolean(),
  mp3: z.boolean(),
  theora: z.boolean(),
  zip: z.boolean(),
  textServer: TextServerSchema,
});

export const BuildConfigSchema = z.object({
  godotVersion: z.enum(GODOT_VERSION_IDS),
  platform: PlatformSchema,
  architecture: ArchitectureSchema,
  templateKinds: z
    .array(TemplateKindSchema)
    .min(1)
    .max(2)
    .transform((items) => [...new Set(items)].sort()),
  optimization: OptimizationSchema,
  lto: z.boolean(),
  webThreads: z.boolean().default(false),
  features: BuildFeaturesSchema,
}).refine(config => config.architecture === (config.platform === "web" ? "wasm32" : "x86_64"), {
  message: "Web requires wasm32; desktop targets require x86_64.", path: ["architecture"],
});

export type BuildConfig = z.infer<typeof BuildConfigSchema>;
export type BuildFeatures = z.infer<typeof BuildFeaturesSchema>;
export type TemplateKind = z.infer<typeof TemplateKindSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
