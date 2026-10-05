import { BuildConfigSchema, type BuildConfig } from "./schema.ts";

export function normalizeBuildConfig(input: unknown): BuildConfig {
  const parsed = BuildConfigSchema.parse(input);
  const features = { ...parsed.features };

  if (!features.engine3d) {
    features.physics3d = false;
    features.jolt = false;
    features.navigation3d = false;
    features.openxr = false;
    features.gltf = false;
    features.csg = false;
    features.gridmap = false;
  }

  if (!features.physics3d) {
    features.jolt = false;
  }

  if (!features.multiplayer) {
    features.enet = false;
    features.websocket = false;
    features.webrtc = false;
  }

  // Theora has required Ogg/Vorbis dependencies in Godot 4.7.2.
  if (!features.oggVorbis) features.theora = false;

  return BuildConfigSchema.parse({
    ...parsed,
    templateKinds: [...parsed.templateKinds].sort(),
    features,
  });
}

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableObject);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableObject(item)]),
    );
  }

  return value;
}

export function canonicalBuildConfigJson(input: unknown): string {
  const normalized = normalizeBuildConfig(input);
  return JSON.stringify(stableObject(normalized));
}
