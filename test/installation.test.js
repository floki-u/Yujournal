import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createProfile } from '../scripts/profile.js';
import { appURL } from '../scripts/config.js';
const root = resolve(import.meta.dirname, '..');
test('Web Clip is removable, URL-specific, deterministic and contains no management payload', () => {
  const url = 'https://example.com/ledger/',
    profile = createProfile(url, Buffer.from('icon'));
  assert.equal(profile, createProfile(url, Buffer.from('icon')));
  assert.equal((profile.match(/<string>com\.apple\.webClip\.managed<\/string>/g) || []).length, 1);
  assert.match(profile, /<key>FullScreen<\/key><true\/>/);
  assert.match(profile, /<key>IsRemovable<\/key><true\/>/);
  assert.match(profile, /<key>URL<\/key><string>https:\/\/example\.com\/ledger\/<\/string>/);
  assert.doesNotMatch(profile, /com\.apple\.(mdm|vpn|security|restrictions)/);
  assert.notEqual(profile, createProfile('https://example.com/another/', Buffer.from('icon')));
  assert.throws(() => appURL('http://example.com/'));
  assert.throws(() => appURL('https://token@example.com/'));
  assert.throws(() => appURL('https://example.com/?text=payment'));
});
test('portable build is reproducible and contains complete subdirectory-compatible assets, not local project files', async () => {
  const build = () => {
    const r = spawnSync(process.execPath, ['scripts/build.js'], {
      cwd: root,
      env: { ...process.env, YUJOURNAL_APP_URL: 'https://example.com/custom/' },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim());
  };
  const before = await readFile(resolve(root, 'sw.js'), 'utf8'),
    first = build(),
    second = build();
  assert.equal(first.revision, second.revision);
  assert.equal(await readFile(resolve(root, 'sw.js'), 'utf8'), before);
  const profile = await readFile(resolve(root, 'dist/Yujournal.mobileconfig'), 'utf8');
  assert.match(profile, /https:\/\/example\.com\/custom\//);
  const index = await readFile(resolve(root, 'dist/index.html'), 'utf8');
  assert.match(index, /src="src\/app.js"/);
  assert.match(index, /href="styles\/base.css"/);
  const worker = await readFile(resolve(root, 'dist/sw.js'), 'utf8');
  assert.doesNotMatch(worker, /__BUILD_HASH__/);
  assert.ok(worker.includes(first.revision));
  for (const dir of ['src', 'src/lib', 'styles', 'fonts', 'assets', 'vendor/ocr'])
    assert.ok((await readdir(resolve(root, 'dist', dir))).length);
  const names = await readdir(resolve(root, 'dist'));
  for (const forbidden of [
    'test',
    'scripts',
    'docs',
    'node_modules',
    '.git',
    '.openai',
    '.env',
    'README.md',
  ])
    assert.equal(names.includes(forbidden), false);
  const doc = await readFile(resolve(root, 'dist/styles/worlds.css'), 'utf8');
  assert.match(doc, /\.\.\/fonts\/PixelifySans\.ttf/);
});
