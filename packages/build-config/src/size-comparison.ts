import { assertRealBuildSupported } from "./scons.ts";
import type { Platform, TemplateKind } from "./schema.ts";
import { PLATFORM_ARCHITECTURES, platformVersionSupported } from "./platforms.ts";
import { isSupportedGodotVersion } from "./versions.ts";

export type TemplateReference = {
  godot_version: string; platform: Platform; architecture: string; template_kind: TemplateKind;
  web_threads: boolean; binary_size_bytes: number; archive_sha256: string; source_url: string; measured_at: string;
};
export type TemplateReferenceTarget = Pick<TemplateReference, "platform" | "architecture" | "template_kind" | "web_threads">;
export type TemplateReferenceMeasurement = TemplateReferenceTarget & { binary_size_bytes: number };

/** Reference coverage follows the same release/architecture policy as builds. */
export function officialTemplateReferenceTargets(version: string): TemplateReferenceTarget[] {
  if (!isSupportedGodotVersion(version)) throw new Error("Unsupported Godot version.");
  return (Object.keys(PLATFORM_ARCHITECTURES) as Platform[])
    .filter(platform => platformVersionSupported(platform, version))
    .flatMap(platform => PLATFORM_ARCHITECTURES[platform].flatMap(architecture =>
      (["release", "debug"] as TemplateKind[]).flatMap(template_kind =>
        (platform === "web" ? [false, true] : [false]).map(web_threads =>
          ({ platform, architecture, template_kind, web_threads })))));
}

export function templateReferenceIdentity(row: TemplateReferenceTarget): string {
  return `${row.platform}/${row.architecture}/${row.template_kind}/${row.web_threads}`;
}

/** Reject partial imports, duplicates and sizes that cannot be represented exactly. */
export function validateTemplateReferenceMeasurements(version: string, input: unknown): TemplateReferenceMeasurement[] {
  const targets = officialTemplateReferenceTargets(version);
  if (!Array.isArray(input) || input.length !== targets.length) throw new Error("Official template measurements are incomplete.");
  const rows = new Map<string, TemplateReferenceMeasurement>();
  for (const row of input) {
    if (!row || typeof row !== "object" || !Number.isSafeInteger(row.binary_size_bytes) || row.binary_size_bytes <= 0
      || typeof row.web_threads !== "boolean") throw new Error("Invalid official template measurement.");
    const identity = templateReferenceIdentity(row);
    if (rows.has(identity)) throw new Error("Duplicate official template measurement.");
    rows.set(identity, row);
  }
  return targets.map(target => {
    const row = rows.get(templateReferenceIdentity(target));
    if (!row) throw new Error("Official template measurements are incomplete.");
    return { ...target, binary_size_bytes: row.binary_size_bytes };
  });
}
export type SizeComparison = {
  officialBytes: number; customBytes: number; savedBytes: number; percentSaved: number;
  measurement: "executables" | "wasm" | "libraries"; references: TemplateReference[];
};

/** Compare main executables, native engine libraries or WASM. Require matching kinds and architectures. */
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
