import { PLATFORM_ARCHITECTURES } from "./platforms.ts";
import { z } from "zod";
import { isSupportedGodotVersion, MINIMUM_GODOT_VERSION } from "./versions.ts";

export const TemplateKindSchema = z.enum(["release", "debug"]);
export const PlatformSchema = z.enum(["windows", "linux", "web", "android", "macos"]);
export const ArchitectureSchema = z.enum(["x86_64", "wasm32", "arm64", "arm32", "x86_32", "universal"]);
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
  godotVersion: z.string().max(32).refine(isSupportedGodotVersion, `Choose a stable Godot 4 release, version ${MINIMUM_GODOT_VERSION} or newer.`),
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
}).refine(config => (PLATFORM_ARCHITECTURES[config.platform] as readonly string[]).includes(config.architecture), {
  message: "Choose an architecture supported by the selected platform.", path: ["architecture"],
});

export type BuildConfig = z.infer<typeof BuildConfigSchema>;
export type BuildFeatures = z.infer<typeof BuildFeaturesSchema>;
export type TemplateKind = z.infer<typeof TemplateKindSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
