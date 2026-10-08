import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { SUPPORTED_GODOT_VERSIONS } from "@mingd/build-config";

const exec = promisify(execFile);

test("compiler dry-run packages isolated attempts without backend credentials or connections", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mingd-compiler-runtime-"));
  try {
    // A minimal cached source fixture is only suitable for diagnostic dry-runs.
    const source = join(dir, "cache", "4.6.3", SUPPORTED_GODOT_VERSIONS["4.6.3"].sourceSha256, "source");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, "SConstruct"), "# dry-run source fixture\n");
    const childEnv = { ...process.env };
    for (const name of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "REDIS_URL"]) delete childEnv[name];
    // A fresh process proves no import-time credential requirement remains.
    const script = `
      import assert from 'node:assert/strict';
      import { join } from 'node:path';
      import { readFile } from 'node:fs/promises';
      import { DEFAULT_BUILD_CONFIG } from '@mingd/build-config';
      import { compileBuild } from './src/compiler.ts';
      import { compilerRuntimeFromEnvironment } from './src/compiler-runtime.ts';
      globalThis.fetch = async () => { throw new Error('Offline release catalog fixture'); };
      const root = process.argv[1];
      const runtime = compilerRuntimeFromEnvironment({
        BUILDER_DRY_RUN: 'true', GODOT_CACHE_DIR: join(root, 'cache'),
        GODOT_WORK_DIR: join(root, 'jobs'), CCACHE_DIR: join(root, 'ccache'),
      });
      const config = { ...DEFAULT_BUILD_CONFIG, godotVersion: '4.6.3', platform: 'linux', architecture: 'x86_64' };
      const stages = [];
      const result = await compileBuild('attempt-one', config, join(root, 'compile.log'), runtime,
        async stage => { stages.push(stage); });
      assert.equal(result.binarySizeBytes, 0);
      assert.equal(result.artifactPath, join(root, 'jobs/attempt-one/output/mingd-attempt-one-DRY-RUN.tpz'));
      assert.deepEqual(stages, ['preparing_source', 'preparing_workspace', 'compiling', 'packaging']);
      const archive = await readFile(result.artifactPath);
      assert.equal(archive.readUInt32LE(0), 0x04034b50);
      assert.ok(archive.includes(Buffer.from('README.txt')));
      assert.ok(archive.includes(Buffer.from('version.txt')));
      assert.equal(await readFile(join(root, 'jobs/attempt-one/source/SConstruct'), 'utf8'), '# dry-run source fixture\\n');
      const second = await compileBuild('attempt-two', config, join(root, 'second.log'), runtime);
      assert.notEqual(second.artifactPath, result.artifactPath);
      await assert.rejects(compileBuild('wrong-target', config, join(root, 'wrong.log'), { ...runtime, target: 'web' }), /cannot compile linux/);
      await assert.rejects(compileBuild('invalid', { ...config, platform: 'arbitrary' }, join(root, 'invalid.log'), runtime));
    `;
    await exec(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, dir], {
      cwd: new URL("..", import.meta.url), env: childEnv, timeout: 30_000,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
