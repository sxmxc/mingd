import assert from "node:assert/strict";
import test from "node:test";
import { createGodotReleaseCatalog, releaseSource, canonicalBuildCacheInput, DEFAULT_BUILD_CONFIG, normalizeBuildConfig, godotVersionIdentifier, SUPPORTED_GODOT_VERSIONS } from "../src/index.ts";

function release(id: string, digest = "a".repeat(64)) {
  const tag = `${id}-stable`;
  return { tag_name: tag, draft: false, prerelease: false, assets: [{ name: `godot-${tag}.tar.xz`, browser_download_url: `https://github.com/godotengine/godot-builds/releases/download/${tag}/godot-${tag}.tar.xz`, digest: `sha256:${digest}` }] };
}

test("discovery accepts official stable sources and excludes old, prerelease, foreign and unverified assets", () => {
  assert.equal(releaseSource(release("4.6"))?.versionIdentifier, "4.6.stable");
  assert.equal(releaseSource(release("4.8.1"))?.id, "4.8.1");
  assert.equal(releaseSource(release("4.5.2"))?.id, "4.5.2");
  for (const id of ["3.6.3", "4.4.2", "5.0", "4.6.0", "4.06", "4.6-rc1", "../../source"]) assert.equal(releaseSource(release(id)), null);
  assert.equal(releaseSource({ ...release("4.6"), prerelease: true }), null);
  assert.equal(releaseSource({ ...release("4.6"), draft: true }), null);
  assert.equal(releaseSource(release("4.6", "invalid")), null);
  const foreign = release("4.6");
  foreign.assets[0].browser_download_url = "https://example.com/source.tar.xz";
  assert.equal(releaseSource(foreign), null);
  assert.equal(releaseSource({ ...release("4.6"), assets: [] }), null);
});

test("catalog paginates, sorts numerically, deduplicates and shares refresh requests", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url) => {
    calls++;
    const second = String(url).endsWith("page=2");
    return Response.json(second ? [release("4.6"), release("4.10.1")] : Array.from({ length: 100 }, () => release("4.7.1")));
  };
  const get = createGodotReleaseCatalog(fetcher);
  const [a, b] = await Promise.all([get(), get()]);
  assert.equal(a, b);
  assert.equal(calls, 2);
  assert.deepEqual(a.versions.map(source => source.id), ["4.10.1", "4.7.1", "4.6"]);
  assert.equal(a.stale, false);
  await get();
  assert.equal(calls, 2);
});

test("outages retain the verified catalog and retry after one minute", async () => {
  let time = 0;
  let fails = false;
  let calls = 0;
  const get = createGodotReleaseCatalog(async () => {
    calls++;
    if (fails) return new Response(null, { status: 403 });
    return Response.json([release("4.6.1")]);
  }, () => time);
  assert.equal((await get()).stale, false);
  fails = true;
  time = 3600001;
  const stale = await get();
  assert.equal(stale.stale, true);
  assert.equal(stale.versions[0].id, "4.6.1");
  await get();
  assert.equal(calls, 2);
  fails = false;
  time += 60001;
  assert.equal((await get()).stale, false);
  assert.equal(calls, 3);
  const offline = createGodotReleaseCatalog(async () => { throw new Error("offline"); });
  assert.equal((await offline()).stale, true);
  assert.ok((await offline()).versions.every(source => /^[a-f0-9]{64}$/.test(source.sourceSha256)));
});

test("discovered versions require resolved integrity metadata and separate hashes when source changes", () => {
  const config = normalizeBuildConfig({ ...DEFAULT_BUILD_CONFIG, godotVersion: "4.6" });
  const source = releaseSource(release("4.6"))!;
  assert.throws(() => canonicalBuildCacheInput(config), /Resolve official/);
  const hash = canonicalBuildCacheInput(config, source);
  assert.equal(hash, canonicalBuildCacheInput(normalizeBuildConfig(config), source));
  assert.notEqual(hash, canonicalBuildCacheInput(config, { ...source, sourceSha256: "b".repeat(64) }));
  assert.throws(() => canonicalBuildCacheInput(config, { ...source, id: "4.7" }), /Resolve official/);
  assert.equal(godotVersionIdentifier("4.6.1"), "4.6.1.stable");
  assert.equal(godotVersionIdentifier("4.7"), "4.7.stable");
  assert.equal(godotVersionIdentifier("4.5"), "4.5.stable");
  const pinned = SUPPORTED_GODOT_VERSIONS[DEFAULT_BUILD_CONFIG.godotVersion];
  const discovered = releaseSource(release(pinned.id, pinned.sourceSha256))!;
  assert.equal(canonicalBuildCacheInput(DEFAULT_BUILD_CONFIG, discovered), canonicalBuildCacheInput(DEFAULT_BUILD_CONFIG));
});
