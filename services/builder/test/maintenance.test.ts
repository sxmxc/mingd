import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanArtifacts, downloadTemplateArchive, officialTemplateAsset, runMaintenanceOnce, validArtifactPath } from "../src/maintenance.js";

const path = `4.7.2/linux/${"a".repeat(64)}/${"b".repeat(64)}/template.zip`;
const options = { supabaseUrl: "http://localhost", secretKey: "secret", bucket: "build-artifacts" };

test("cleanup accepts generated paths and rejects traversal or unrelated objects", () => {
  assert.equal(validArtifactPath(path), true);
  assert.equal(validArtifactPath(path.replace("template.zip", `${"12345678-1234-1234-1234-123456789abc"}-${"12345678-1234-1234-1234-123456789abc"}/template.zip`)), true);
  for (const invalid of ["../template.zip", "avatars/user.zip", path.replace("template.zip", "../template.zip"), path.replace("linux", "arbitrary"), path.replace("template.zip", "file.sh")]) assert.equal(validArtifactPath(invalid), false);
});

test("official archive metadata must match stable release, exact URL, digest and bounded size", () => {
  const asset = { name: "Godot_v4.7.2-stable_export_templates.tpz", browser_download_url: "https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_export_templates.tpz", size: 100, digest: `sha256:${"a".repeat(64)}` };
  const release = { tag_name: "4.7.2-stable", draft: false, prerelease: false, assets: [asset] };
  assert.equal(officialTemplateAsset("4.7.2", release), asset);
  for (const patch of [{ draft: true }, { prerelease: true }, { tag_name: "4.7.1-stable" }, { assets: [{ ...asset, digest: "missing" }] }, { assets: [{ ...asset, size: 4 * 1024 ** 3 + 1 }] }, { assets: [{ ...asset, browser_download_url: "https://example.com/file" }] }]) {
    assert.throws(() => officialTemplateAsset("4.7.2", { ...release, ...patch }));
  }
});

test("archive streaming enforces release size and aborts oversized/incomplete downloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mingd-maintenance-test-"));
  try {
    await downloadTemplateArchive(new Response("abc"), join(dir, "valid"), 3, new AbortController().signal);
    assert.equal(await readFile(join(dir, "valid"), "utf8"), "abc");
    await assert.rejects(downloadTemplateArchive(new Response("abcd"), join(dir, "oversize"), 3, new AbortController().signal), /exceeds/);
    await assert.rejects(downloadTemplateArchive(new Response("ab"), join(dir, "partial"), 3, new AbortController().signal), /incomplete/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

function fakeClient(storageFailure = false, taskName = "artifact_cleanup") {
  const events: string[] = [];
  const patches: Record<string, unknown>[] = [];
  const filters: [string, unknown][] = [];
  const client = {
    rpc: async (name: string) => {
      events.push(name);
      return { error: null, data: name === "claim_maintenance" ? [{ name: taskName, lease_token: "token" }] : 1 };
    },
    from: (table: string) => ({
      select: () => ({ is: () => ({ order: () => ({ limit: async () => ({ data: [{ storage_path: path }], error: null }) }) }) }),
      update: (patch: Record<string, unknown>) => {
        patches.push(patch); events.push(`update:${table}`);
        const query = { eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
          in: async () => ({ error: null }), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
        return query;
      },
    }),
    storage: { from: () => ({ remove: async () => { events.push("storage:remove"); return { error: storageFailure ? { message: "secret" } : null }; } }) },
  };
  return { client: client as unknown as SupabaseClient, events, patches, filters };
}

test("Storage removal precedes acknowledgment; failed deletion stays pending", async () => {
  const success = fakeClient();
  await cleanArtifacts(success.client, options);
  assert.deepEqual(success.events, ["retire_unused_artifacts", "storage:remove", "update:artifact_deletions"]);
  const failure = fakeClient(true);
  await assert.rejects(cleanArtifacts(failure.client, options));
  assert.equal(failure.patches.length, 0);
});

test("failed tasks retry without persisting secrets, and completion requires the lease token", async () => {
  const fake = fakeClient(true);
  await runMaintenanceOnce(fake.client, options);
  assert.equal(fake.patches[0].requested, true);
  assert.equal(fake.patches[0].lease_token, null);
  assert.ok(!String(fake.patches[0].last_error).includes("secret"));
  assert.deepEqual(fake.filters, [["name", "artifact_cleanup"], ["lease_token", "token"]]);
  const refreshed = fakeClient(false, "release_refresh");
  await runMaintenanceOnce(refreshed.client, options, async () => ({ releases: 2, importedVersion: null, remainingVersions: 0 }));
  assert.equal(refreshed.patches[0].last_error, null);
  assert.equal(refreshed.patches[0].requested, undefined, "completion preserves a request received during work");
});
