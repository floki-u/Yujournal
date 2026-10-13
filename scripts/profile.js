import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { appURL } from './config.js';
const root = resolve(import.meta.dirname, '..');
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char],
  );
function uuid(name) {
  const namespace = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');
  const bytes = createHash('sha1').update(namespace).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function createProfile(url, icon) {
  const address = appURL(url),
    suffix = createHash('sha256').update(address).digest('hex').slice(0, 16);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadIdentifier</key><string>io.yujournal.install.${suffix}</string>
  <key>PayloadUUID</key><string>${uuid(address + ':profile')}</string>
  <key>PayloadDisplayName</key><string>Yujournal · 余记</string>
  <key>PayloadDescription</key><string>Adds a removable full-screen Yujournal Web Clip. Ledger data stays on this device.</string>
  <key>PayloadOrganization</key><string>Yujournal</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadContent</key><array><dict>
    <key>PayloadType</key><string>com.apple.webClip.managed</string>
    <key>PayloadVersion</key><integer>1</integer>
    <key>PayloadIdentifier</key><string>io.yujournal.webclip.${suffix}</string>
    <key>PayloadUUID</key><string>${uuid(address + ':webclip')}</string>
    <key>PayloadDisplayName</key><string>Yujournal · 余记</string>
    <key>Label</key><string>余记</string>
    <key>URL</key><string>${xml(address)}</string>
    <key>FullScreen</key><true/>
    <key>IsRemovable</key><true/>
    <key>Precomposed</key><true/>
    <key>Icon</key><data>${Buffer.from(icon).toString('base64')}</data>
  </dict></array>
</dict></plist>
`;
}
export async function writeProfile(
  url = appURL(),
  path = resolve(root, 'install/Yujournal.mobileconfig'),
) {
  const profile = createProfile(url, await readFile(resolve(root, 'icon.png')));
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, profile);
  return path;
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href)
  console.log(await writeProfile());
