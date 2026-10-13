import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
async function scan(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await scan(path)));
    else if (entry.name.endsWith('.js')) out.push(path);
  }
  return out;
}
const files = [
  resolve(root, 'sw.js'),
  ...(await scan(resolve(root, 'src'))),
  ...(await scan(resolve(root, 'scripts'))),
  ...(await scan(resolve(root, 'test'))),
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status) {
    process.stderr.write(result.stderr);
    process.exit(result.status);
  }
}
for (const file of await scan(resolve(root, 'src'))) {
  const source = await readFile(file, 'utf8');
  if (
    /yuji-design-demo|fixedToday|恢复示例|导出示例|localStorage\.setItem|appgprj_|chatgpt\.site/.test(
      source,
    )
  )
    throw Error(`Local/demo configuration in production source: ${file}`);
}
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));
if (manifest.display !== 'standalone' || manifest.start_url !== './' || manifest.scope !== './')
  throw Error('Invalid PWA manifest.');
const resources = JSON.parse(
  await readFile(resolve(root, 'vendor/ocr/resource-manifest.json'), 'utf8'),
);
for (const item of resources.files) {
  const bytes = await readFile(resolve(root, 'vendor/ocr', item.path));
  if (
    bytes.length !== item.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== item.sha256
  )
    throw Error(`OCR resource checksum mismatch: ${item.path}`);
}
const voice = JSON.parse(
  await readFile(resolve(root, 'vendor/voice/resource-manifest.json'), 'utf8'),
);
for (const item of voice.files) {
  const bytes = await readFile(resolve(root, 'vendor/voice', item.path));
  if (
    bytes.length !== item.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== item.sha256
  )
    throw Error(`Voice checksum mismatch: ${item.path}`);
}
console.log(
  `Checked ${files.length} JavaScript files, manifest and ${resources.files.length} OCR resources.`,
);
