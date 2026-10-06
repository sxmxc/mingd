export type SupportedGodotVersion = {
  id: string;
  displayName: string;
  versionIdentifier: string;
  sourceUrl: string;
  sourceSha256: string;
};

/** Offline fallback, not the complete release catalog. */
export const SUPPORTED_GODOT_VERSIONS: Record<string, SupportedGodotVersion> = {
  "4.7.2": {
    id: "4.7.2",
    displayName: "Godot 4.7.2 stable",
    versionIdentifier: "4.7.2.stable",
    sourceUrl:
      "https://github.com/godotengine/godot/releases/download/4.7.2-stable/godot-4.7.2-stable.tar.xz",
    sourceSha256:
      "a18ce0ccec3ecc40b0dd6c4f5132ca934e9fb7c2979717940ff32aee1eb35481",
  },
  "4.6.3": {
    id: "4.6.3",
    displayName: "Godot 4.6.3 stable",
    versionIdentifier: "4.6.3.stable",
    sourceUrl: "https://github.com/godotengine/godot/releases/download/4.6.3-stable/godot-4.6.3-stable.tar.xz",
    sourceSha256: "2261028c0dfc10e0cf4800a5b2e5a57ea241f72965162327f5764d536a69a46a",
  },
} satisfies Record<string, SupportedGodotVersion>;

export type GodotVersionId = string;
export const GODOT_VERSION_IDS = Object.keys(SUPPORTED_GODOT_VERSIONS) as [GodotVersionId, ...GodotVersionId[]];

export const MINIMUM_GODOT_VERSION = "4.5";

/** Only the current major's stable releases use this build recipe. */
export function isSupportedGodotVersion(id: string): boolean {
  return /^4\.(?:0|[1-9]\d*)(?:\.(?:[1-9]\d*))?$/.test(id) && Number(id.split(".")[1]) >= Number(MINIMUM_GODOT_VERSION.split(".")[1]);
}

export function godotVersionIdentifier(id: string): string {
  if (!isSupportedGodotVersion(id)) throw new Error("Unsupported Godot version.");
  return `${id.split(".").length === 2 ? `${id}.0` : id}.stable`;
}
