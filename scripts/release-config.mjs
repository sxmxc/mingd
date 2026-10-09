import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const imagePackages = {
  web: 'apps/web', 'worker-gateway': 'services/worker-gateway',
  maintenance: 'services/builder', builder: 'services/builder',
  'web-builder': 'services/builder', 'android-builder': 'services/builder',
  'macos-builder': 'services/builder',
};
export const tagVariable = service => `${service.toUpperCase().replaceAll('-', '_')}_IMAGE_TAG`;
export function parseVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Versions must be stable major.minor.patch values.');
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Version components are too large.');
  return parts;
}
export function newest(versions) {
  return versions.reduce((a, b) => {
    const left = parseVersion(a), right = parseVersion(b);
    const index = right.findIndex((part, i) => part !== left[i]);
    return index >= 0 && right[index] > left[index] ? b : a;
  });
}
export function bumpVersion(version, kind) {
  const indices = { major: 0, minor: 1, patch: 2 };
  if (!Object.hasOwn(indices, kind)) throw new Error('Choose patch, minor, or major.');
  const index = indices[kind];
  const parts = parseVersion(version);
  parts[index]++;
  for (let i = index + 1; i < parts.length; i++) parts[i] = 0;
  const result = parts.join('.');
  parseVersion(result);
  return result;
}
export function envValue(text, key) {
  const matches = [...text.matchAll(new RegExp(`^(?:export\\s+)?${key}\\s*=([^\\r\\n]*)`, 'gm'))];
  if (!matches.length) return undefined;
  const value = matches.at(-1)[1].trim();
  return value.startsWith('"') || value.startsWith("'") ? value.slice(1, value.indexOf(value[0], 1)) : value.replace(/\s+#.*$/, '').trim();
}
export function updateTags(text, versions) {
  for (const [service, version] of Object.entries(versions)) {
    const key = tagVariable(service), tag = `v${version}`;
    const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, 'gm');
    text = pattern.test(text) ? text.replace(pattern, `${key}=${tag}`)
      : `${text}${text && !text.endsWith('\n') ? '\n' : ''}${key}=${tag}\n`;
  }
  return text;
}
// Keep each image's existing history. Local versioned overrides may record a
// targeted release newer than its package/production defaults. Floating latest
// is not a version; shell variables do not alter release preparation.
export function imageVersions(root) {
  const read = path => readFileSync(resolve(root, path), 'utf8');
  const env = existsSync(resolve(root, '.env')) ? read('.env') : '';
  const defaults = read('compose.web.prod.yml') + '\n' + read('compose.workers.prod.yml');
  return Object.fromEntries(Object.keys(imagePackages).map(service => {
    const key = tagVariable(service);
    const pattern = new RegExp(`\\$\\{${key}:-\\$\\{IMAGE_TAG:-v(\\d+\\.\\d+\\.\\d+)\\}\\}`);
    const recorded = defaults.match(pattern)?.[1];
    if (!recorded) throw new Error(`Missing production image version for ${service}.`);
    const configured = envValue(env, key) || envValue(env, 'IMAGE_TAG');
    if (configured && configured !== 'latest' && !/^v?\d+\.\d+\.\d+$/.test(configured)) throw new Error(`Cannot bump non-version image tag for ${service}; set a stable version first.`);
    return [service, newest([recorded, ...(configured && configured !== 'latest' ? [configured.replace(/^v/, '')] : [])])];
  }));
}
