import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..'),
  out = resolve(root, '.release'),
  pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await mkdir(out, { recursive: true });
const archive = `Yujournal-v${pkg.version}-web.tar.gz`;
// Preserve payload bytes but exclude the packager's local filesystem metadata.
const metadataFlags =
  process.platform === 'darwin'
    ? ['--no-xattrs', '--format=ustar', '--uid=0', '--gid=0', '--uname=root', '--gname=root']
    : ['--no-xattrs', '--format=ustar', '--owner=0', '--group=0', '--numeric-owner'];
const result = spawnSync(
  'tar',
  [...metadataFlags, '-czf', resolve(out, archive), '-C', resolve(root, 'dist'), '.'],
  {
    stdio: 'inherit',
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  },
);
if (result.status !== 0) throw Error('Could not package the built web app.');
await cp(resolve(root, 'dist/Yujournal.mobileconfig'), resolve(out, 'Yujournal.mobileconfig'));
await cp(resolve(root, 'docs/INSTALL.zh-CN.md'), resolve(out, 'INSTALL.zh-CN.md'));
await cp(resolve(root, 'LICENSE'), resolve(out, 'LICENSE'));
const names = [archive, 'Yujournal.mobileconfig', 'INSTALL.zh-CN.md', 'LICENSE'];
let checksums = '';
for (const name of names)
  checksums += `${createHash('sha256')
    .update(await readFile(resolve(out, name)))
    .digest('hex')}  ${name}\n`;
await writeFile(resolve(out, 'SHA256SUMS.txt'), checksums);
console.log(JSON.stringify({ directory: out, files: [...names, 'SHA256SUMS.txt'] }));
