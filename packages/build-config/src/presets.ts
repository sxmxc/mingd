import type { BuildConfig, BuildFeatures } from "./schema.ts";

export const DEFAULT_FEATURES: BuildFeatures = {
  engine3d: true,
  advancedGui: true,
  physics2d: true,
  physics3d: true,
  jolt: true,
  navigation2d: true,
  navigation3d: true,
  multiplayer: true,
  enet: true,
  websocket: true,
  webrtc: true,
  openxr: true,
  gltf: true,
  csg: true,
  gridmap: true,
  tilemap: true,
  svg: true,
  oggVorbis: true,
  mp3: true,
  theora: true,
  zip: true,
  textServer: "advanced",
};

export const DEFAULT_BUILD_CONFIG: BuildConfig = {
  godotVersion: "4.7.2",
  platform: "linux",
  architecture: "x86_64",
  templateKinds: ["release"],
  optimization: "size",
  lto: false,
  features: DEFAULT_FEATURES,
};

export const PRESETS = {
  standard: {
    label: "Standard",
    description: "Keep Godot features enabled and optimize the binary for size.",
    features: DEFAULT_FEATURES,
  },
  lean2d: {
    label: "Lean 2D",
    description: "Remove 3D-only systems while retaining common 2D, UI, audio, and networking features.",
    features: {
      ...DEFAULT_FEATURES,
      engine3d: false,
      physics3d: false,
      jolt: false,
      navigation3d: false,
      openxr: false,
      gltf: false,
      csg: false,
      gridmap: false,
    },
  },
  offline2d: {
    label: "Offline 2D",
    description: "Lean 2D plus removal of multiplayer and network transport modules.",
    features: {
      ...DEFAULT_FEATURES,
      engine3d: false,
      physics3d: false,
      jolt: false,
      navigation3d: false,
      openxr: false,
      gltf: false,
      csg: false,
      gridmap: false,
      multiplayer: false,
      enet: false,
      websocket: false,
      webrtc: false,
    },
  },
} as const;

export type PresetId = keyof typeof PRESETS;

export type SupportedPresetId = "standard" | "lean2d";
export const SUPPORTED_PRESET_IDS: SupportedPresetId[] = ["standard", "lean2d"];

export function buildPresetId(config: BuildConfig): SupportedPresetId | null {
  return SUPPORTED_PRESET_IDS.find((id) => Object.entries(config.features).every(([key, value]) =>
    value === PRESETS[id].features[key as keyof BuildFeatures],
  )) ?? null;
}
