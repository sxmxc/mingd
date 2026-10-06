import { godotVersionIdentifier, isSupportedGodotVersion, SUPPORTED_GODOT_VERSIONS, type SupportedGodotVersion } from "./versions.ts";

const API = "https://api.github.com/repos/godotengine/godot-builds/releases";
const DOWNLOADS = "https://github.com/godotengine/godot-builds/releases/download/";
const TTL_MS = 60 * 60 * 1000;
type Release = { tag_name: string; draft: boolean; prerelease: boolean; assets: { name: string; browser_download_url: string; digest?: string | null }[] };
export type GodotReleaseCatalog = { versions: SupportedGodotVersion[]; stale: boolean };

export function releaseSource(release: Release): SupportedGodotVersion | null {
  if (release.draft || release.prerelease || !release.tag_name.endsWith("-stable")) return null;
  const id = release.tag_name.slice(0, -7);
  if (!isSupportedGodotVersion(id)) return null;
  const name = `godot-${release.tag_name}.tar.xz`;
  const url = `${DOWNLOADS}${release.tag_name}/${name}`;
  const asset = release.assets.find(asset => asset.name === name && asset.browser_download_url === url);
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? "")) return null;
  const sourceSha256 = asset.digest!.slice(7);
  // Preserve existing cache identities when the discovered source is identical.
  const pinned = SUPPORTED_GODOT_VERSIONS[id];
  const sourceUrl = pinned?.sourceSha256 === sourceSha256 ? pinned.sourceUrl : url;
  return { id, displayName: `Godot ${id} stable`, versionIdentifier: godotVersionIdentifier(id), sourceUrl, sourceSha256 };
}

/** Server/worker only: official GitHub assets provide their SHA-256 digest. */
export function createGodotReleaseCatalog(fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  let cached: GodotReleaseCatalog | undefined;
  let expires = 0;
  let pending: Promise<GodotReleaseCatalog> | undefined;
  async function refresh(): Promise<GodotReleaseCatalog> {
    try {
      const versions = new Map<string, SupportedGodotVersion>();
      // Follow pagination even when newer dev snapshots fill the first page.
      for (let page = 1; page <= 20; page++) {
        const response = await fetcher(`${API}?per_page=100&page=${page}`, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "mingd-release-catalog" },
          cache: "no-store", signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`Godot catalog returned HTTP ${response.status}.`);
        const releases = await response.json() as Release[];
        if (!Array.isArray(releases)) throw new Error("Invalid Godot release catalog.");
        for (const release of releases) {
          const source = releaseSource(release);
          if (source) versions.set(source.id, source);
        }
        if (releases.length < 100) break;
        if (page === 20) throw new Error("Godot release catalog pagination limit reached.");
      }
      if (!versions.size) throw new Error("No verified stable Godot releases found.");
      cached = { versions: [...versions.values()].sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true })), stale: false };
      expires = now() + TTL_MS;
    } catch {
      cached = { versions: cached?.versions ?? Object.values(SUPPORTED_GODOT_VERSIONS), stale: true };
      expires = now() + 60000;
    }
    return cached;
  }
  return async (): Promise<GodotReleaseCatalog> => {
    if (cached && now() < expires) return cached;
    pending ??= refresh().finally(() => { pending = undefined; });
    return pending;
  };
}

export const getGodotReleaseCatalog = createGodotReleaseCatalog();

export async function resolveGodotVersion(id: string): Promise<SupportedGodotVersion> {
  if (!isSupportedGodotVersion(id)) throw new Error("Unsupported Godot version.");
  const catalog = await getGodotReleaseCatalog();
  const source = catalog.versions.find(version => version.id === id);
  if (!source) throw new Error(catalog.stale ? "Godot releases are temporarily unavailable. Try again shortly." : "Choose an available official stable Godot release.");
  return source;
}
