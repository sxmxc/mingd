import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGodotReleaseCatalog, officialTemplateReferenceTargets, templateReferenceIdentity, type TemplateReferenceTarget } from "@mingd/build-config";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const importer = fileURLToPath(new URL("../../../scripts/import-template-references.mjs", import.meta.url));
const MAX_ARCHIVE_BYTES = 4 * 1024 ** 3;
export type MaintenanceOptions = { supabaseUrl: string; secretKey: string; bucket: string };

// Only messages constructed here may reach logs/the dashboard. Upstream errors
// and child-process stderr can contain credentials, so never forward them raw.
class MaintenanceError extends Error {}

export function maintenanceFailureMessage(error: unknown): string {
  if (error instanceof MaintenanceError) return error.message;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "Maintenance exceeded its time limit.";
  }
  return "Unexpected maintenance failure; check worker configuration and connectivity.";
}

export function missingTemplateReferenceVersions(versions: { id: string }[], references: (TemplateReferenceTarget & { godot_version: string })[]) {
  const identities = new Set(references.map(row => `${row.godot_version}/${templateReferenceIdentity(row)}`));
  return versions.filter(version => officialTemplateReferenceTargets(version.id).some(target =>
    !identities.has(`${version.id}/${templateReferenceIdentity(target)}`)));
}

export function validArtifactPath(path: string): boolean {
  // Only generated ZIP paths, including the legacy layout, are eligible.
  return /^4\.[0-9]+(?:\.[0-9]+)?\/(?:linux|windows|web|android|macos)\/[a-f0-9]{64}\/[a-f0-9]{64}\/(?:[a-f0-9-]{73}\/)?[A-Za-z0-9_.-]+\.zip$/.test(path)
    && !path.split("/").some(part => part === "." || part === "..");
}

export function officialTemplateAsset(version: string, release: {
  tag_name?: string; draft?: boolean; prerelease?: boolean;
  assets?: { name: string; browser_download_url: string; size: number; digest?: string }[];
}) {
  const name = `Godot_v${version}-stable_export_templates.tpz`;
  const url = `https://github.com/godotengine/godot-builds/releases/download/${version}-stable/${name}`;
  const asset = release.assets?.find(item => item.name === name && item.browser_download_url === url);
  if (release.tag_name !== `${version}-stable` || release.draft !== false || release.prerelease !== false
    || !/^sha256:[a-f0-9]{64}$/.test(asset?.digest ?? "") || !Number.isSafeInteger(asset?.size)
    || !asset || asset.size <= 0 || asset.size > MAX_ARCHIVE_BYTES) throw new MaintenanceError("Official template archive identity is unavailable.");
  return asset;
}

export async function downloadTemplateArchive(response: Response, path: string, expectedSize: number, signal: AbortSignal) {
  if (!response.ok || !response.body) throw new MaintenanceError("Official archive download unavailable.");
  let size = 0;
  await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      callback(size > expectedSize ? new MaintenanceError("Official archive exceeds its declared size.") : null, chunk);
    },
  }), createWriteStream(path, { flags: "wx" }), { signal });
  if (size !== expectedSize) throw new MaintenanceError("Official archive download is incomplete.");
}

export async function refreshOfficialReleases(admin: SupabaseClient, options: MaintenanceOptions, signal: AbortSignal) {
  const catalog = await createGodotReleaseCatalog((input, init) => fetch(input, {
    ...init, signal: AbortSignal.any([signal, init?.signal ?? AbortSignal.timeout(10000)]),
  }))();
  if (catalog.stale) throw new MaintenanceError("Official release catalog unavailable; retained previous data.");
  const saved = await admin.from("official_release_catalog").upsert({ id: true, versions: catalog.versions, refreshed_at: new Date().toISOString() });
  if (saved.error) throw new MaintenanceError("Release catalog could not be saved.");
  const existing = await admin.from("official_template_references").select("godot_version,platform,architecture,template_kind,web_threads");
  if (existing.error) throw new MaintenanceError("Template reference inventory unavailable.");
  const missing = missingTemplateReferenceVersions(catalog.versions, existing.data ?? []);
  // One archive per lease bounds disk, memory and network use. Catch up through
  // coalesced tasks until every release has all supported platform references.
  const version = missing.at(0)?.id;
  if (version) {
    const release = await fetch(`https://api.github.com/repos/godotengine/godot-builds/releases/tags/${version}-stable`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "mingd-maintenance" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    if (!release.ok) throw new MaintenanceError("Official template release unavailable.");
    const asset = officialTemplateAsset(version, await release.json());
    const directory = await mkdtemp(join(tmpdir(), "mingd-templates-"));
    try {
      const archive = join(directory, "official.tpz");
      await downloadTemplateArchive(await fetch(asset.browser_download_url, { signal }), archive, asset.size, signal);
      // Reuse the existing SHA-256 verification and bounded, nonexecuting Python
      // measurement importer. It checks version.txt and binary headers as well.
      try {
        await promisify(execFile)(process.execPath, ["--import", "tsx", importer, "--version", version, "--archive", archive], {
          timeout: 150000, signal, maxBuffer: 65536,
          env: { ...process.env, SUPABASE_URL: options.supabaseUrl, NEXT_PUBLIC_SUPABASE_URL: options.supabaseUrl, SUPABASE_SECRET_KEY: options.secretKey },
        });
      } catch (error) {
        const child = error as { stderr?: unknown; signal?: unknown; killed?: unknown };
        const reasons = [
          "Official archive version.txt does not match the requested release",
          "Official archive SHA-256 verification failed.",
          "Could not resolve the official Godot release.",
          "Reference import failed. Apply the recipes_and_template_references migration first.",
        ];
        const stderr = typeof child?.stderr === "string" ? child.stderr : "";
        const reason = reasons.find(message => stderr.includes(message));
        throw new MaintenanceError(`Template reference import for ${version} failed: ${reason ??
          (child?.signal === "SIGKILL" ? "importer was killed; check the container memory limit." :
            child?.killed ? "importer exceeded its time limit." : "archive measurement or importer execution failed.")}`);
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  if (missing.length > 1) {
    const requested = await admin.rpc("request_maintenance", { task_name: "release_refresh" });
    if (requested.error) throw new MaintenanceError("Release refresh continuation unavailable.");
  }
  return { releases: catalog.versions.length, importedVersion: version ?? null, remainingVersions: Math.max(0, missing.length - 1) };
}

export async function cleanArtifacts(admin: SupabaseClient, options: MaintenanceOptions) {
  const retired = await admin.rpc("retire_unused_artifacts");
  if (retired.error) throw new MaintenanceError("Artifact retirement unavailable.");
  const pending = await admin.from("artifact_deletions").select("storage_path").is("deleted_at", null).order("queued_at").limit(100);
  if (pending.error) throw new MaintenanceError("Artifact deletion inventory unavailable.");
  const paths = (pending.data ?? []).map(row => row.storage_path as string);
  if (paths.some(path => !validArtifactPath(path))) throw new MaintenanceError("Artifact cleanup found an invalid generated path.");
  if (paths.length) {
    const removed = await admin.storage.from(options.bucket).remove(paths);
    if (removed.error) throw new MaintenanceError("Artifact Storage deletion unavailable.");
    const acknowledged = await admin.from("artifact_deletions").update({ deleted_at: new Date().toISOString() }).in("storage_path", paths);
    if (acknowledged.error) throw new MaintenanceError("Artifact deletion acknowledgement unavailable.");
  }
  if (retired.data === 100 || paths.length === 100) {
    const requested = await admin.rpc("request_maintenance", { task_name: "artifact_cleanup" });
    if (requested.error) throw new MaintenanceError("Artifact cleanup continuation unavailable.");
  }
  return { retired: retired.data, deleted: paths.length };
}

export async function runMaintenanceOnce(admin: SupabaseClient, options: MaintenanceOptions,
  refresh = refreshOfficialReleases,
  log: (event: Record<string, unknown>) => void = event => console.error(JSON.stringify(event))) {
  const claim = await admin.rpc("claim_maintenance");
  if (claim.error) throw new MaintenanceError("Maintenance claim unavailable.");
  const task = claim.data?.[0];
  if (!task) return;
  let patch: Record<string, unknown>;
  try {
    const result = task.name === "artifact_cleanup" ? await cleanArtifacts(admin, options)
      : await refresh(admin, options, AbortSignal.timeout(15 * 60 * 1000));
    patch = { completed_at: new Date().toISOString(), result, last_error: null, lease_token: null, lease_until: null };
  } catch (error) {
    const message = maintenanceFailureMessage(error);
    log({ event: "maintenance_failed", task: task.name === "artifact_cleanup" ? "artifact_cleanup" : "release_refresh", message });
    patch = { requested: true, retry_after: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      last_error: `${message} Will retry in 15 minutes.`, lease_token: null, lease_until: null };
  }
  const finished = await admin.from("maintenance_tasks").update(patch).eq("name", task.name).eq("lease_token", task.lease_token);
  if (finished.error) throw new MaintenanceError("Maintenance completion unavailable; lease will be recovered.");
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) throw new MaintenanceError("Configure SUPABASE_URL and SUPABASE_SECRET_KEY for maintenance.");
  const options = { supabaseUrl, secretKey, bucket: process.env.ARTIFACT_BUCKET ?? "build-artifacts" };
  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([init?.signal ?? AbortSignal.timeout(30000), AbortSignal.timeout(30000)]) }) },
  });
  let closing = false;
  let wake: (() => void) | undefined;
  console.info("Maintenance worker started.");
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { closing = true; wake?.(); });
  do {
    await runMaintenanceOnce(admin, options).catch(error => console.warn(maintenanceFailureMessage(error)));
    if (process.argv.includes("--once") || closing) break;
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 30000);
      wake = () => { clearTimeout(timer); resolve(); };
    });
  } while (!closing);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main().catch(() => {
  console.error("Maintenance could not start. Check server configuration."); process.exitCode = 1;
});
