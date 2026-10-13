import { mkdir, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { appURL } from './config.js';
import { writeProfile } from './profile.js';
const root = resolve(import.meta.dirname, '..'),
  dist = resolve(root, 'dist');
// dist is a generated directory; source files are never removed by a build.
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const name of [
  'index.html',
  'install.html',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'src',
  'styles',
  'assets',
  'fonts',
  'vendor',
  'manifest.webmanifest',
  'icon.svg',
  'icon.png',
]) {
  await cp(resolve(root, name), resolve(dist, name), { recursive: true });
}
await mkdir(resolve(dist, 'shortcuts'), { recursive: true });
for (const name of ['Yujournal-Screenshot.shortcut', 'Yujournal-Voice.shortcut'])
  await cp(resolve(root, 'shortcuts', name), resolve(dist, 'shortcuts', name));
const url = appURL();
await writeProfile(url, resolve(dist, 'Yujournal.mobileconfig'));
await writeFile(resolve(dist, '.nojekyll'), '');
const hash = createHash('sha256');
async function digest(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await digest(path);
    else {
      hash.update(path.slice(dist.length));
      hash.update(await readFile(path));
    }
  }
}
await digest(dist);
const revision = hash.digest('hex').slice(0, 12),
  worker = (await readFile(resolve(root, 'sw.js'), 'utf8')).replaceAll('__BUILD_HASH__', revision);
await writeFile(resolve(dist, 'sw.js'), worker);
console.log(
  JSON.stringify({ directory: 'dist', appURL: url, revision, profile: 'Yujournal.mobileconfig' }),
);
