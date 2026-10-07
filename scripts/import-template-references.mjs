import "dotenv/config";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify, parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { isSupportedGodotVersion, godotVersionIdentifier } from "@mingd/build-config";

const { values } = parseArgs({ options: { version: { type: "string" }, archive: { type: "string" }, "dry-run": { type: "boolean", default: false } } });
if (!isSupportedGodotVersion(values.version ?? "") || !values.archive) throw new Error("Usage: node --import tsx scripts/import-template-references.mjs --version 4.7.2 --archive /path/to/official.tpz [--dry-run]");
const version = values.version;
const name = `Godot_v${version}-stable_export_templates.tpz`;
const sourceUrl = `https://github.com/godotengine/godot-builds/releases/download/${version}-stable/${name}`;
const response = await fetch(`https://api.github.com/repos/godotengine/godot-builds/releases/tags/${version}-stable`, {
  headers: { Accept: "application/vnd.github+json", "User-Agent": "mingd-template-references" }, signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error("Could not resolve the official Godot release.");
const release = await response.json();
const asset = release.assets?.find(item => item.name === name && item.browser_download_url === sourceUrl);
if (release.tag_name !== `${version}-stable` || release.draft || release.prerelease || !/^sha256:[a-f0-9]{64}$/.test(asset?.digest ?? "")) throw new Error("Official template archive has no verified release identity/SHA-256.");
const metadata = await stat(values.archive);
if (!metadata.isFile() || metadata.size <= 0 || metadata.size > 4 * 1024 ** 3 || metadata.size !== asset.size) throw new Error("Official archive size does not match the release asset.");
const hash = createHash("sha256");
for await (const chunk of createReadStream(values.archive)) hash.update(chunk);
const digest = hash.digest("hex");
if (`sha256:${digest}` !== asset.digest) throw new Error("Official archive SHA-256 verification failed.");
const { stdout } = await promisify(execFile)("python3", [fileURLToPath(new URL("./measure-official-templates.py", import.meta.url)), values.archive, godotVersionIdentifier(version)], { timeout: 120000, maxBuffer: 65536 });
const measuredAt = new Date().toISOString();
const rows = JSON.parse(stdout).map(row => ({ ...row, godot_version: version, archive_sha256: digest, source_url: sourceUrl, measured_at: measuredAt }));
if (rows.length !== 8 || rows.some(row => !Number.isSafeInteger(row.binary_size_bytes) || row.binary_size_bytes <= 0)) throw new Error("Official template measurements are incomplete.");
if (values["dry-run"]) console.log(JSON.stringify(rows, null, 2));
else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Configure the Supabase URL and server-only key in root .env, or use --dry-run.");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.from("official_template_references").upsert(rows, { onConflict: "godot_version,platform,architecture,template_kind,web_threads" });
  if (error) throw new Error("Reference import failed. Apply the recipes_and_template_references migration first.");
  console.log(`Imported ${rows.length} verified main-binary measurements for Godot ${version}.`);
}
