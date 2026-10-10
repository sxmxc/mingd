import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { bumpVersion } from './release-config.mjs';
import { releaseInventory, releaseMatrixPath, renderReleaseMatrix, writeReleaseMatrix } from './release-matrix.mjs';

export function platformRelease(root, kind, { dryRun = false } = {}) {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const manifest = read('package.json'), lock = read('package-lock.json');
  if (manifest.name !== 'mingd') throw new Error('Run from the mingd repository root.');
  if (lock.version !== manifest.version || lock.packages['']?.version !== manifest.version) throw new Error('Lockfile version differs for package.json.');
  const next = bumpVersion(manifest.version, kind);
  const snapshot = releaseInventory(root, { platformVersion: next });
  const path = resolve(root, `releases/v${next}.json`);
  if (existsSync(path)) throw new Error(`Platform release v${next} already has a snapshot; it will not be overwritten.`);
  if (existsSync(dirname(path)) && !statSync(dirname(path)).isDirectory()) throw new Error('Release snapshot parent is not a directory.');
  const matrix = renderReleaseMatrix(root, snapshot, { extraSnapshots: [snapshot] });
  manifest.version = next;
  lock.version = next;
  lock.packages[''].version = next;
  if (!dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    // Reserve the version before updating the root manifests. Existing snapshots are immutable.
    writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(resolve(root, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(resolve(root, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
    writeReleaseMatrix(root, matrix);
  }
  console.log(`${dryRun ? 'Would prepare' : 'Prepared'} platform release v${next}.`);
  console.log(`${dryRun ? 'Would capture' : 'Captured'} ${Object.keys(snapshot.packages).length} package versions and ${Object.keys(snapshot.images).length} image tags in releases/v${next}.json:`);
  console.log(JSON.stringify(snapshot, null, 2));
  console.log(`${dryRun ? 'Would update' : 'Updated'} ${releaseMatrixPath}.`);
  console.log('Component versions and deployment settings unchanged. No images built or published.');
}
