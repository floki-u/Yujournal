import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..'),
  out = resolve(root, '.release'),
  pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await mkdir(out, { recursive: true });
const archive = `Yujournal-v${pkg.version}-web.tar.gz`;
const result = spawnSync('tar', ['-czf', resolve(out, archive), '-C', resolve(root, 'dist'), '.'], {
  stdio: 'inherit',
});
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
