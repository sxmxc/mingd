import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { bumpVersion, imagePackages, imageVersions, parseVersion } from './release-config.mjs';

export function platformRelease(root, kind, { dryRun = false } = {}) {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const manifest = read('package.json'), lock = read('package-lock.json');
  if (manifest.name !== 'mingd') throw new Error('Run from the mingd repository root.');
  if (lock.version !== manifest.version || lock.packages['']?.version !== manifest.version) throw new Error('Lockfile version differs for package.json.');
  const next = bumpVersion(manifest.version, kind);
  const packages = {}, names = {};
  for (const base of ['apps', 'packages', 'services']) {
    for (const entry of readdirSync(resolve(root, base), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const key = `${base}/${entry.name}`;
      if (!entry.isDirectory() || !existsSync(resolve(root, key, 'package.json'))) continue;
      const data = read(`${key}/package.json`);
      parseVersion(data.version);
      if (lock.packages[key]?.version !== data.version) throw new Error(`Lockfile version differs for ${key}/package.json.`);
      const name = data.name ?? key;
      if (Object.hasOwn(packages, name)) throw new Error(`Duplicate workspace package name: ${name}.`);
      packages[name] = data.version;
      names[key] = name;
    }
  }
  const images = Object.fromEntries(Object.entries(imageVersions(root)).map(([service, version]) => {
    const packageName = names[imagePackages[service]];
    if (!packageName) throw new Error(`Missing package for ${service}.`);
    return [service, { tag: `v${version}`, package: packageName }];
  }));
  const snapshot = { schemaVersion: 1, platformVersion: next, packages, images };
  const path = resolve(root, `releases/v${next}.json`);
  if (existsSync(path)) throw new Error(`Platform release v${next} already has a snapshot; it will not be overwritten.`);
  if (existsSync(dirname(path)) && !statSync(dirname(path)).isDirectory()) throw new Error('Release snapshot parent is not a directory.');
  manifest.version = next;
  lock.version = next;
  lock.packages[''].version = next;
  if (!dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    // Reserve the version before updating the root manifests. Existing snapshots are immutable.
    writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(resolve(root, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(resolve(root, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  }
  console.log(`${dryRun ? 'Would prepare' : 'Prepared'} platform release v${next}.`);
  console.log(`${dryRun ? 'Would capture' : 'Captured'} ${Object.keys(packages).length} package versions and ${Object.keys(images).length} image tags in releases/v${next}.json:`);
  console.log(JSON.stringify(snapshot, null, 2));
  console.log('Component versions and deployment settings unchanged. No images built or published.');
}
