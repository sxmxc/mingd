import { mkdir, rm, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveGodotVersion, type GodotVersionId } from "@mingd/build-config";
import { runProcess } from "./process.js";

async function exists(path: string) {
  try { await stat(path); return true; } catch { return false; }
}

export async function ensureGodotSource(versionId: GodotVersionId, cacheDir: string, onVerifying: () => Promise<void> = async () => undefined, signal?: AbortSignal, onOutput?: (chunk: Buffer) => void): Promise<string> {
  signal?.throwIfAborted();
  const version = await resolveGodotVersion(versionId);
  const versionDir = join(cacheDir, version.id, version.sourceSha256);
  const sourceDir = join(versionDir, "source");
  const marker = join(sourceDir, "SConstruct");
  if (await exists(marker)) return sourceDir;

  await mkdir(versionDir, { recursive: true });
  const archive = join(versionDir, `godot-${version.id}.tar.xz`);
  const deliveryId = randomUUID();
  const tempSource = join(versionDir, `source.tmp-${deliveryId}`);
  const downloading = join(versionDir, `archive.tmp-${deliveryId}`);
  const archiveExists = await exists(archive);
  const candidate = archiveExists ? archive : downloading;

  try {
  if (!archiveExists) {
    await runProcess("curl", ["-fL", "--retry", "3", "--connect-timeout", "15", "--max-time", "600", "-o", downloading, version.sourceUrl], { signal, timeoutMs: 1_900_000, onOutput });
  }

  const { createHash } = await import("node:crypto");
  const { createReadStream } = await import("node:fs");
  await onVerifying();
  const digest = await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(candidate, { signal }).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
  });
  if (digest !== version.sourceSha256) {
    await rm(candidate, { force: true });
    throw new Error(`Godot source checksum mismatch for ${version.id}: ${digest}`);
  }
  if (!archiveExists) await rename(downloading, archive);

  await rm(tempSource, { recursive: true, force: true });
  await mkdir(tempSource, { recursive: true });
  await runProcess("tar", ["-xJf", archive, "-C", tempSource, "--strip-components=1"], { signal, timeoutMs: 300_000, onOutput });
  if (!(await exists(join(tempSource, "SConstruct")))) throw new Error("Extracted Godot source does not contain SConstruct.");
  try {
    await rename(tempSource, sourceDir);
  } catch (error) {
    // Another delivery may have published the same verified source first.
    if (!(await exists(marker))) throw error;
    await rm(tempSource, { recursive: true, force: true });
  }
  return sourceDir;
  } finally {
    await rm(downloading, { force: true });
    await rm(tempSource, { recursive: true, force: true });
  }
}
