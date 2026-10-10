import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { bumpVersion, imagePackages, tagVariable } from '../release-config.mjs';

const script = fileURLToPath(new URL('../release.mjs', import.meta.url));
function fixture(version = '0.2.3') {
  const root = mkdtempSync(join(tmpdir(), 'mingd-release-'));
  const paths = ['', 'apps/web', 'apps/docs', 'packages/contract', 'services/builder', 'services/worker-gateway'];
  for (const folder of paths) {
    mkdirSync(join(root, folder), { recursive: true });
    writeFileSync(join(root, folder, 'package.json'), JSON.stringify({ name: folder || 'mingd', version }));
  }
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version, packages: Object.fromEntries(paths.map(key => [key, { version }])) }));
  for (const path of ['compose.web.prod.yml', 'compose.workers.prod.yml']) {
    writeFileSync(join(root, path), Object.keys(imagePackages).map(service => `${service}: \${${tagVariable(service)}:-\${IMAGE_TAG:-v${version}}}`).join('\n'));
  }
  for (const path of ['.env.web.prod.example', '.env.workers.prod.example']) writeFileSync(join(root, path), `IMAGE_TAG=v${version}\n`);
  writeFileSync(join(root, '.env'), `SECRET=never-print-this\nIMAGE_TAG=latest\nWEB_IMAGE_TAG=v${version === '0.2.3' ? '0.2.4' : version}\n`);
  return {
    root, read: path => readFileSync(join(root, path), 'utf8'),
    run: args => spawnSync(process.execPath, ['--', script, ...args], { cwd: root, encoding: 'utf8', timeout: 10_000 }),
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}
test('patch advances each current release independently and preserves secrets and fallback tags', () => {
  const f = fixture();
  try {
    // Independent workspace versions are valid, provided each matches its lock entry.
    writeFileSync(join(f.root, 'packages/contract/package.json'), JSON.stringify({ name: 'contract', version: '0.8.7' }));
    const before = JSON.parse(f.read('package-lock.json'));
    before.packages['packages/contract'].version = '0.8.7';
    writeFileSync(join(f.root, 'package-lock.json'), JSON.stringify(before));
    const result = f.run(['bump', 'patch']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /never-print-this/);
    const lock = JSON.parse(f.read('package-lock.json'));
    assert.equal(lock.version, '0.2.4');
    assert.equal(lock.packages['apps/web'].version, '0.2.5');
    assert.equal(lock.packages['services/worker-gateway'].version, '0.2.4');
    assert.equal(lock.packages['packages/contract'].version, '0.8.8');
    assert.match(f.read('.env'), /WEB_IMAGE_TAG=v0.2.5/);
    assert.match(f.read('.env'), /WORKER_GATEWAY_IMAGE_TAG=v0.2.4/);
    assert.match(f.read('.env'), /SECRET=never-print-this/);
    assert.match(f.read('.env'), /IMAGE_TAG=latest/);
    assert.match(f.read('compose.web.prod.yml'), /WEB_IMAGE_TAG:-\$\{IMAGE_TAG:-v0.2.5/);
    assert.match(f.read('.env.web.prod.example'), /WEB_IMAGE_TAG=v0.2.5/);
    // A repeat bumps from the prepared version, including after local env removal.
    rmSync(join(f.root, '.env'));
    assert.equal(f.run(['bump', 'patch', '--service', 'web']).status, 0);
    assert.equal(JSON.parse(f.read('apps/web/package.json')).version, '0.2.6');
  } finally { f.close(); }
});
test('version increments reset lower components and reject invalid inputs', () => {
  for (const [kind, expected] of [['patch', '0.3.6'], ['minor', '0.4.0'], ['major', '1.0.0']]) {
    assert.equal(bumpVersion('0.3.5', kind), expected);
  }
  for (const version of ['01.2.3', '1.2', '1.2.3-beta', '9007199254740992.0.0']) {
    assert.throws(() => bumpVersion(version, 'patch'));
  }
  assert.throws(() => bumpVersion('1.2.3', 'invalid'));
});
test('targeted service release leaves repo, other packages and other image tags unchanged', () => {
  const f = fixture();
  try {
    const result = f.run(['bump', 'patch', '--service', 'web']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(f.read('package.json')).version, '0.2.3');
    assert.equal(JSON.parse(f.read('apps/web/package.json')).version, '0.2.5');
    assert.equal(JSON.parse(f.read('services/worker-gateway/package.json')).version, '0.2.3');
    assert.match(f.read('compose.web.prod.yml'), /WORKER_GATEWAY_IMAGE_TAG:-\$\{IMAGE_TAG:-v0.2.3/);
    assert.doesNotMatch(f.read('.env'), /WORKER_GATEWAY_IMAGE_TAG/);
  } finally { f.close(); }
});
test('one compiler image can advance without forcing sibling image tags to match its shared package', () => {
  const f = fixture();
  try {
    assert.equal(f.run(['bump', 'minor', '--service', 'builder']).status, 0);
    assert.equal(JSON.parse(f.read('services/builder/package.json')).version, '0.3.0');
    const exported = f.run(['tags', '--env-file', 'deployment.env']);
    assert.equal(exported.status, 0, exported.stderr);
    assert.match(f.read('deployment.env'), /^BUILDER_IMAGE_TAG=v0.3.0$/m);
    assert.match(f.read('deployment.env'), /^WEB_BUILDER_IMAGE_TAG=v0.2.3$/m);
  } finally { f.close(); }
});
test('repeated selectors bump the chosen images and their shared workspace once', () => {
  const f = fixture();
  try {
    const services = ['builder', 'web-builder', 'android-builder', 'macos-builder', 'web', 'builder'];
    const args = ['bump', 'minor', ...services.flatMap(service => ['--service', service])];
    const preview = f.run([...args, '--dry-run']);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(JSON.parse(f.read('services/builder/package.json')).version, '0.2.3');
    const result = f.run(args);
    assert.equal(result.status, 0, result.stderr);
    for (const service of new Set(services)) assert.match(f.read('.env'), new RegExp(`^${tagVariable(service)}=v0\\.3\\.0$`, 'm'));
    assert.equal(JSON.parse(f.read('services/builder/package.json')).version, '0.3.0');
    assert.equal(JSON.parse(f.read('apps/web/package.json')).version, '0.3.0');
    assert.equal(JSON.parse(f.read('package.json')).version, '0.2.3');
    assert.equal(JSON.parse(f.read('services/worker-gateway/package.json')).version, '0.2.3');
    assert.doesNotMatch(f.read('.env'), /MAINTENANCE_IMAGE_TAG|WORKER_GATEWAY_IMAGE_TAG/);
    assert.equal(f.run(['bump', 'patch', '--service', 'all', '--service', 'web']).status, 1);
  } finally { f.close(); }
});
test('dry run and lockfile inconsistency do not mutate any release files', () => {
  const f = fixture();
  try {
    const original = f.read('.env');
    const dry = f.run(['bump', 'patch', '--dry-run']);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /web: v0.2.4 -> v0.2.5/);
    assert.match(dry.stdout, /mingd: 0.2.3 -> 0.2.4/);
    assert.equal(f.read('.env'), original);
    assert.equal(JSON.parse(f.read('package.json')).version, '0.2.3');
    writeFileSync(join(f.root, 'apps/web/package.json'), JSON.stringify({ version: '0.9.0' }));
    assert.equal(f.run(['bump', 'patch']).status, 1);
    assert.equal(JSON.parse(f.read('package.json')).version, '0.2.3');
    assert.equal(f.read('.env'), original);
    assert.equal(f.run(['bump', '0.2.5']).status, 1);
  } finally { f.close(); }
});
test('tags exports independent image versions without bumping or exposing secrets', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'deployment.env'), 'WEB_IMAGE_TAG=v0.1.0\nSECRET=keep\n');
    const result = f.run(['tags', '--env-file', 'deployment.env']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`Saved 7 image-tag settings to ${join(f.root, 'deployment.env')}.`));
    assert.match(f.read('deployment.env'), /WEB_IMAGE_TAG=v0.2.4/);
    assert.match(f.read('deployment.env'), /WORKER_GATEWAY_IMAGE_TAG=v0.2.3/);
    assert.match(f.read('deployment.env'), /SECRET=keep/);
    assert.doesNotMatch(f.read('deployment.env'), /never-print-this/);
    assert.match(f.read('.env'), /WEB_IMAGE_TAG=v0.2.4/);
    assert.equal(JSON.parse(f.read('package.json')).version, '0.2.3');
  } finally { f.close(); }
});

test('platform release captures prepared independent components and changes only root versions', () => {
  const f = fixture();
  try {
    assert.equal(f.run(['bump', 'minor', '--service', 'builder']).status, 0);
    assert.equal(f.run(['bump', 'patch', '--service', 'web']).status, 0);
    const paths = ['apps/web/package.json', 'services/builder/package.json', 'services/worker-gateway/package.json', '.env', 'compose.web.prod.yml', 'compose.workers.prod.yml', '.env.web.prod.example', '.env.workers.prod.example'];
    const before = Object.fromEntries(paths.map(path => [path, f.read(path)]));
    const previousLock = JSON.parse(f.read('package-lock.json'));
    const preview = f.run(['platform', 'major', '--dry-run']);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /Would prepare platform release v1.0.0/);
    assert.equal(existsSync(join(f.root, 'releases')), false);
    assert.equal(JSON.parse(f.read('package.json')).version, '0.2.3');
    const result = f.run(['platform', 'major']);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /never-print-this/);
    assert.equal(JSON.parse(f.read('package.json')).version, '1.0.0');
    const lock = JSON.parse(f.read('package-lock.json'));
    assert.equal(lock.version, '1.0.0');
    assert.equal(lock.packages[''].version, '1.0.0');
    delete lock.packages['']; delete previousLock.packages[''];
    assert.deepEqual(lock.packages, previousLock.packages);
    for (const path of paths) assert.equal(f.read(path), before[path]);
    const snapshot = JSON.parse(f.read('releases/v1.0.0.json'));
    assert.equal(snapshot.platformVersion, '1.0.0');
    assert.equal(snapshot.packages['apps/web'], '0.2.5');
    assert.equal(snapshot.packages['services/builder'], '0.3.0');
    assert.deepEqual(snapshot.images.builder, { tag: 'v0.3.0', package: 'services/builder' });
    assert.deepEqual(snapshot.images['web-builder'], { tag: 'v0.2.3', package: 'services/builder' });
    assert.equal(snapshot.images.web.tag, 'v0.2.5');
    assert.equal(Object.keys(snapshot.images).length, 7);
    const matrix = f.read('docs/operators/release-matrix.md');
    assert.match(matrix, /### v1.0.0/);
    assert.match(matrix, /\| builder \| v0.3.0 \| services\/builder \| 0.3.0 \|/);
    assert.equal(f.run(['bump', 'patch', '--service', 'builder']).status, 0);
    const updated = f.read('docs/operators/release-matrix.md');
    assert.match(updated.split('## Platform release history')[0], /\| builder \| v0.3.1 \| services\/builder \| 0.3.1 \|/);
    assert.match(updated.split('### v1.0.0')[1], /\| builder \| v0.3.0 \| services\/builder \| 0.3.0 \|/);
    assert.deepEqual(JSON.parse(f.read('releases/v1.0.0.json')), snapshot);
    assert.equal(f.run(['platform', 'patch']).status, 0);
    assert.equal(JSON.parse(f.read('releases/v1.0.1.json')).platformVersion, '1.0.1');
  } finally { f.close(); }
});

test('matrix refresh is deterministic, changes no versions, and dry runs write no documentation', () => {
  const f = fixture();
  try {
    const files = ['package.json', 'package-lock.json', '.env', 'compose.web.prod.yml', 'compose.workers.prod.yml'];
    const before = Object.fromEntries(files.map(path => [path, f.read(path)]));
    assert.equal(f.run(['matrix', '--dry-run']).status, 0);
    assert.equal(existsSync(join(f.root, 'docs')), false);
    assert.equal(f.run(['matrix']).status, 0);
    const matrix = f.read('docs/operators/release-matrix.md');
    assert.match(matrix, /Platform version in the checkout: \*\*v0.2.3\*\*/);
    assert.match(matrix, /\| web \| v0.2.4 \| apps\/web \| 0.2.3 \|/);
    assert.doesNotMatch(matrix, /never-print-this/);
    assert.equal(f.run(['matrix']).status, 0);
    assert.equal(f.read('docs/operators/release-matrix.md'), matrix);
    for (const path of files) assert.equal(f.read(path), before[path]);
    assert.equal(f.run(['matrix', '--service', 'web']).status, 1);
  } finally { f.close(); }
});

test('blocked matrix output prevents component and platform version mutations', () => {
  for (const args of [['bump', 'patch', '--service', 'web'], ['platform', 'major']]) {
    const f = fixture();
    try {
      const paths = ['package.json', 'package-lock.json', 'apps/web/package.json', '.env', 'compose.web.prod.yml'];
      const before = Object.fromEntries(paths.map(path => [path, f.read(path)]));
      mkdirSync(join(f.root, 'docs/operators/release-matrix.md'), { recursive: true });
      assert.equal(f.run(args).status, 1);
      for (const path of paths) assert.equal(f.read(path), before[path]);
      assert.equal(existsSync(join(f.root, 'releases')), false);
    } finally { f.close(); }
  }
});

test('invalid platform options, inconsistent packages and existing snapshots do not mutate files', () => {
  const f = fixture();
  try {
    const root = f.read('package.json'), lock = f.read('package-lock.json'), env = f.read('.env');
    for (const args of [['platform', 'invalid'], ['platform', 'major', '--service', 'web'], ['platform', 'major', '--env-file', 'other.env']]) assert.equal(f.run(args).status, 1);
    writeFileSync(join(f.root, 'services/builder/package.json'), JSON.stringify({ version: '0.9.0' }));
    assert.equal(f.run(['platform', 'major']).status, 1);
    assert.equal(existsSync(join(f.root, 'releases')), false);
    writeFileSync(join(f.root, 'services/builder/package.json'), JSON.stringify({ name: 'services/builder', version: '0.2.3' }));
    mkdirSync(join(f.root, 'releases'));
    writeFileSync(join(f.root, 'releases/v1.0.0.json'), 'existing snapshot');
    assert.equal(f.run(['platform', 'major']).status, 1);
    assert.equal(f.read('releases/v1.0.0.json'), 'existing snapshot');
    assert.equal(f.read('package.json'), root);
    assert.equal(f.read('package-lock.json'), lock);
    assert.equal(f.read('.env'), env);
  } finally { f.close(); }
});
