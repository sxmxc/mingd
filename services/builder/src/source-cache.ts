import { mkdir, rm, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { SUPPORTED_GODOT_VERSIONS, type GodotVersionId } from "@mingd/build-config";
import { runProcess } from "./process.js";
import { env } from "./env.js";

async function exists(path: string) {
  try { await stat(path); return true; } catch { return false; }
}

export async function ensureGodotSource(versionId: GodotVersionId, onVerifying: () => Promise<void> = async () => undefined): Promise<string> {
  const version = SUPPORTED_GODOT_VERSIONS[versionId];
  const versionDir = join(env.godotCacheDir, version.id);
  const sourceDir = join(versionDir, "source");
  const marker = join(sourceDir, "SConstruct");
  if (await exists(marker)) return sourceDir;

  await mkdir(versionDir, { recursive: true });
  const archive = join(versionDir, `godot-${version.id}.tar.xz`);
  const tempSource = join(versionDir, `source.tmp-${process.pid}`);

  if (!(await exists(archive))) {
    await runProcess("curl", ["-fL", "--retry", "3", "-o", archive, version.sourceUrl]);
  }

  const { createHash } = await import("node:crypto");
  const { createReadStream } = await import("node:fs");
  await onVerifying();
  const digest = await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(archive).on("data", (chunk) => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
  });
  if (digest !== version.sourceSha256) {
    await rm(archive, { force: true });
    throw new Error(`Godot source checksum mismatch for ${version.id}: ${digest}`);
  }

  await rm(tempSource, { recursive: true, force: true });
  await mkdir(tempSource, { recursive: true });
  await runProcess("tar", ["-xJf", archive, "-C", tempSource, "--strip-components=1"]);
  if (!(await exists(join(tempSource, "SConstruct")))) throw new Error("Extracted Godot source does not contain SConstruct.");
  await rm(sourceDir, { recursive: true, force: true });
  await rename(tempSource, sourceDir);
  return sourceDir;
}
