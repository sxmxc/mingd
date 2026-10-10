import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { imagePackages, tagVariable } from '../release-config.mjs';

const script = fileURLToPath(new URL('../write-image-release.mjs', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
test('image metadata preserves the original build tag, with explicit untagged builds', t => {
  const directory = mkdtempSync(join(tmpdir(), 'mingd-image-release-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, 'release.json');
  for (const [tag, expected] of [['v0.3.2', 'v0.3.2'], ['', null]]) {
    const result = spawnSync(process.execPath, [script, output], { env: { ...process.env, MINGD_IMAGE_TAG: tag }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), { imageTag: expected });
  }
  for (const tag of ['bad tag', 'v1/token', 'x'.repeat(129)]) {
    assert.equal(spawnSync(process.execPath, [script, output], { env: { ...process.env, MINGD_IMAGE_TAG: tag } }).status, 1);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), { imageTag: null }, 'Invalid tags must not rewrite metadata');
  }
});

test('every Compose image build bakes its exact assigned tag, including independent builder tags', t => {
  const directory = mkdtempSync(join(tmpdir(), 'mingd-compose-image-release-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'compose.yml'), readFileSync(join(root, 'compose.yml')));
  writeFileSync(join(directory, '.env.example'), readFileSync(join(root, '.env.example')));
  // --env-file controls interpolation; worker env_file entries still require .env.
  // Keep both in a fixture so clean checkouts work without local credentials.
  writeFileSync(join(directory, '.env'), '');
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test', SUPABASE_SECRET_KEY: 'test', IMAGE_TAG: 'v0.9.0' };
  for (const [index, service] of Object.keys(imagePackages).entries()) env[tagVariable(service)] = `v0.3.${index}`;
  const result = spawnSync('docker', ['compose', '-f', 'compose.yml', '--env-file', '.env.example', '--profile', '*', 'config', '--format', 'json', '--no-env-resolution'], { cwd: directory, env, encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') return t.skip('Docker Compose is not installed');
  assert.equal(result.status, 0, result.stderr);
  const services = JSON.parse(result.stdout).services;
  for (const service of Object.keys(imagePackages)) {
    const build = services[service].build;
    assert.equal(build.args.MINGD_IMAGE_TAG, env[tagVariable(service)]);
    assert.ok(services[service].image.endsWith(':' + build.args.MINGD_IMAGE_TAG));
  }
});
