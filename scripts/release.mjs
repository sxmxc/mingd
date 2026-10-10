import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { bumpVersion, imagePackages, imageVersions, newest, tagVariable, updateTags } from './release-config.mjs';
import { platformRelease } from './platform-release.mjs';

const root = process.cwd();
const read = path => readFileSync(resolve(root, path), 'utf8');
const usage = 'Usage: npm run release -- platform <patch|minor|major> [--dry-run], bump <patch|minor|major> [--service <name> ... | --service all] [--dry-run], or tags [--env-file <file>] [--dry-run].';
try {
  const { values, positionals } = parseArgs({ options: {
    'dry-run': { type: 'boolean' }, 'env-file': { type: 'string' }, service: { type: 'string', multiple: true },
  }, allowPositionals: true, strict: true });
  const [command, kind] = positionals;
  if (!['bump', 'tags', 'platform'].includes(command) || positionals.length !== (command === 'tags' ? 1 : 2)) throw new Error(usage);
  if (command === 'bump' && values['env-file'] || command === 'tags' && values.service) throw new Error(usage);
  if (command === 'platform') {
    if (values.service || values['env-file']) throw new Error(usage);
    platformRelease(root, kind, { dryRun: values['dry-run'] });
  } else {
  const selections = [...new Set(values.service ?? ['all'])];
  const all = selections.includes('all');
  if (all && selections.length > 1) throw new Error('Use all alone, or name the selected services.');
  if (selections.some(service => service !== 'all' && !Object.hasOwn(imagePackages, service))) throw new Error(`Unknown service. Choose all or ${Object.keys(imagePackages).join(', ')}.`);
  const manifest = JSON.parse(read('package.json'));
  if (manifest.name !== 'mingd') throw new Error('Run from the mingd repository root.');
  const currentImages = imageVersions(root);
  const versions = { ...currentImages }, changes = new Map(), summary = [];
  if (command === 'bump') {
    const services = all ? Object.keys(versions) : selections;
    for (const service of services) {
      versions[service] = bumpVersion(currentImages[service], kind);
      summary.push(`${service}: v${currentImages[service]} -> v${versions[service]}`);
    }
    const paths = all
      ? ['package.json', ...['apps', 'packages', 'services'].flatMap(base => readdirSync(resolve(root, base), { withFileTypes: true })
        .filter(entry => entry.isDirectory() && existsSync(resolve(root, base, entry.name, 'package.json')))
        .map(entry => `${base}/${entry.name}/package.json`))]
      : [...new Set(selections.map(service => `${imagePackages[service]}/package.json`))];
    const lock = JSON.parse(read('package-lock.json'));
    for (const path of paths) {
      const data = JSON.parse(read(path)), key = path === 'package.json' ? '' : dirname(path);
      if (!lock.packages[key] || lock.packages[key].version !== data.version) throw new Error(`Lockfile version differs for ${path}.`);
      const owned = services.filter(service => `${imagePackages[service]}/package.json` === path);
      const next = newest([bumpVersion(data.version, kind), ...owned.map(service => versions[service])]);
      summary.push(`${data.name ?? path}: ${data.version} -> ${next}`);
      data.version = next;
      lock.packages[key].version = next;
      if (path === 'package.json') lock.version = next;
      changes.set(path, JSON.stringify(data, null, 2) + '\n');
    }
    changes.set('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
    for (const path of ['compose.web.prod.yml', 'compose.workers.prod.yml']) {
      let text = read(path);
      for (const service of services) {
        const key = tagVariable(service);
        text = text.replace(new RegExp(`(\\$\\{${key}:-\\$\\{IMAGE_TAG:-)v\\d+\\.\\d+\\.\\d+`, 'g'), `$1v${versions[service]}`);
      }
      changes.set(path, text);
    }
    for (const [path, included] of [
      ['.env.web.prod.example', ['web', 'worker-gateway', 'maintenance']],
      ['.env.workers.prod.example', ['builder', 'web-builder', 'android-builder', 'macos-builder']],
    ]) {
      let text = read(path);
      for (const service of included) text = text.replace(new RegExp(`^# ${tagVariable(service)}=.*\\n?`, 'gm'), '');
      text = text.replace('# Optional deployment overrides; unset or empty uses IMAGE_TAG.', '# Independent image versions; release commands update these overrides.');
      changes.set(path, updateTags(text, Object.fromEntries(included.map(service => [service, versions[service]]))));
    }
  }
  const envPath = resolve(root, command === 'tags' ? values['env-file'] ?? '.env' : '.env');
  const original = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const selectedVersions = command === 'bump' && !all ? Object.fromEntries(selections.map(service => [service, versions[service]])) : versions;
  // Preserve IMAGE_TAG as a fallback; explicit service tags carry the releases.
  changes.set(envPath, updateTags(original, selectedVersions));
  for (const path of changes.keys()) {
    const target = resolve(root, path);
    if (!existsSync(dirname(target))) throw new Error('An output parent directory does not exist.');
    if (existsSync(target) && statSync(target).isDirectory()) throw new Error('An output path is a directory.');
  }
  if (!values['dry-run']) for (const [path, content] of changes) writeFileSync(resolve(root, path), content, { mode: 0o600 });
  console.log(`${values['dry-run'] ? 'Would prepare' : 'Prepared'} independent component versions:`);
  console.log((command === 'bump' ? summary : Object.entries(versions).map(([service, version]) => `${service}: v${version}`)).join('\n'));
  if (command === 'tags') console.log(`${values['dry-run'] ? 'Would save' : 'Saved'} ${Object.keys(selectedVersions).length} image-tag settings to ${envPath}.`);
  console.log('No images built or published.');
  }
} catch (error) {
  console.error(error instanceof Error && !('code' in error) ? error.message : 'Release preparation failed; check file permissions and paths.');
  process.exitCode = 1;
}
