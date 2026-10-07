import { assertRealBuildSupported } from "./scons.ts";
import type { Platform, TemplateKind } from "./schema.ts";

export type TemplateReference = {
  godot_version: string; platform: Platform; architecture: string; template_kind: TemplateKind;
  web_threads: boolean; binary_size_bytes: number; archive_sha256: string; source_url: string; measured_at: string;
};
export type SizeComparison = {
  officialBytes: number; customBytes: number; savedBytes: number; percentSaved: number;
  measurement: "executables" | "wasm" | "libraries"; references: TemplateReference[];
};

/** Compare main executables/WASM only. Require a complete matching reference set. */
export function compareTemplateSize(input: unknown, bytes: number | null, dryRun: boolean, references: TemplateReference[]): SizeComparison | null {
  if (dryRun || !Number.isSafeInteger(bytes) || bytes! <= 0) return null;
  let config;
  try { config = assertRealBuildSupported(input); } catch { return null; }
  const matched = config.templateKinds.map(kind => references.filter(reference =>
    reference.godot_version === config.godotVersion && reference.platform === config.platform &&
    reference.architecture === config.architecture && reference.template_kind === kind &&
    reference.web_threads === config.webThreads));
  if (matched.some(rows => rows.length !== 1)) return null;
  const selected = matched.map(rows => rows[0]);
  if (new Set(selected.map(reference => reference.archive_sha256)).size !== 1) return null;
  if (selected.some(reference => !Number.isSafeInteger(reference.binary_size_bytes) || reference.binary_size_bytes <= 0 ||
    !/^[a-f0-9]{64}$/.test(reference.archive_sha256) ||
    reference.source_url !== `https://github.com/godotengine/godot-builds/releases/download/${config.godotVersion}-stable/Godot_v${config.godotVersion}-stable_export_templates.tpz`)) return null;
  const officialBytes = selected.reduce((total, reference) => total + reference.binary_size_bytes, 0);
  if (!Number.isSafeInteger(officialBytes)) return null;
  return { officialBytes, customBytes: bytes!, savedBytes: officialBytes - bytes!, percentSaved: (1 - bytes! / officialBytes) * 100,
    measurement: config.platform === "web" ? "wasm" : config.platform === "android" ? "libraries" : "executables", references: selected };
}
