import { validateLedger } from './ledger.js';
const MAGIC = new TextEncoder().encode('YUJI001\n'),
  MAX_FILE = 256 * 1024 * 1024,
  MAX_ENCRYPTED = 32 * 1024 * 1024;
const enc = new TextEncoder(),
  dec = new TextDecoder();
export async function sha(blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
async function compress(blob) {
  if (!globalThis.CompressionStream) return { blob, encoding: 'none' };
  return {
    blob: await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob(),
    encoding: 'gzip',
  };
}
async function inflate(blob, encoding) {
  if (encoding === 'none') return blob;
  if (encoding !== 'gzip' || !globalThis.DecompressionStream)
    throw Error('当前浏览器无法解压备份。');
  const reader = blob.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  let size = 0,
    parts = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20 * 1024 * 1024) throw Error('账目文本超过安全解压范围。');
      parts.push(value);
    }
    return new Blob(parts);
  } finally {
    reader.cancel().catch(() => {});
  }
}
function pack(header, parts) {
  const bytes = enc.encode(JSON.stringify(header)),
    length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, bytes.length);
  return new Blob([MAGIC, length, bytes, ...parts], { type: 'application/octet-stream' });
}
async function headerOf(file) {
  if (!(file instanceof Blob) || file.size > MAX_FILE || file.size < 12)
    throw Error('备份文件大小无效。');
  const start = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!MAGIC.every((v, i) => start[i] === v)) throw Error('请选择 .yuji 格式的正式完整备份。');
  const len = new DataView(start.buffer).getUint32(8);
  if (len > 1024 * 1024 || len < 2 || 12 + len > file.size) throw Error('备份头部损坏。');
  let header;
  try {
    header = JSON.parse(await file.slice(12, 12 + len).text());
  } catch {
    throw Error('备份头部无法读取。');
  }
  if (header.version !== 1) throw Error('备份版本暂不支持。');
  return { header, offset: 12 + len };
}
const b64 = (a) => btoa(String.fromCharCode(...a));
function unb64(s, n) {
  try {
    const a = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    if (a.length !== n) throw Error();
    return a;
  } catch {
    throw Error('加密备份参数损坏。');
  }
}
async function key(password, salt) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 256)
    throw Error('备份密码需要 8—256 个字符。');
  const raw = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function exportBackup(state, attachments = [], password = '') {
  validateLedger(state);
  const refs = new Set(state.transactions.flatMap((t) => t.attachmentIds));
  const included = attachments.filter((a) => refs.has(a.id));
  if (included.length !== refs.size || new Set(included.map((a) => a.id)).size !== refs.size)
    throw Error('账本截图附件缺失，暂不能导出。');
  const stateBlob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  if (stateBlob.size > 20 * 1024 * 1024) throw Error('账目文本超过 20 MiB 的单份备份范围。');
  const packedState = await compress(stateBlob);
  const parts = [packedState.blob],
    descriptors = [
      {
        kind: 'state',
        size: packedState.blob.size,
        encoding: packedState.encoding,
        sha256: await sha(packedState.blob),
      },
    ];
  for (const a of included) {
    if (a.blob.size > 2 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(a.blob.type))
      throw Error('截图附件不符合大小或格式限制。');
    descriptors.push({
      kind: 'image',
      id: a.id,
      type: a.blob.type,
      size: a.blob.size,
      sha256: await sha(a.blob),
    });
    parts.push(a.blob);
  }
  const plain = pack(
    { version: 1, encrypted: false, createdAt: new Date().toISOString(), parts: descriptors },
    parts,
  );
  if (plain.size > MAX_FILE) throw Error('完整备份超过 256 MiB 的单份文件范围。');
  if (!password) return plain;
  if (plain.size > MAX_ENCRYPTED) throw Error('加密备份上限为 32 MiB，可使用不加密的完整备份。');
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    k = await key(password, salt),
    cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: MAGIC },
      k,
      await plain.arrayBuffer(),
    );
  return pack(
    { version: 1, encrypted: true, salt: b64(salt), iv: b64(iv), size: cipher.byteLength },
    [cipher],
  );
}
export async function backupEncrypted(file) {
  return (await headerOf(file)).header.encrypted === true;
}
export async function importBackup(file, password = '', nested = false) {
  const { header, offset } = await headerOf(file);
  if (header.encrypted) {
    if (nested || file.size > MAX_ENCRYPTED + 1024 * 1024 || header.size !== file.size - offset)
      throw Error('加密备份大小无效。');
    const k = await key(password, unb64(header.salt, 16));
    let plain;
    try {
      plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(header.iv, 12), additionalData: MAGIC },
        k,
        await file.slice(offset).arrayBuffer(),
      );
    } catch {
      throw Error('密码不正确或备份已损坏；本机账目未改变。');
    }
    return importBackup(new Blob([plain]), '', true);
  }
  if (
    !Array.isArray(header.parts) ||
    header.parts.length > 100001 ||
    header.parts[0]?.kind !== 'state'
  )
    throw Error('备份结构损坏。');
  let at = offset,
    state,
    attachments = [],
    seen = new Set();
  for (let i = 0; i < header.parts.length; i++) {
    const p = header.parts[i];
    if (
      !Number.isSafeInteger(p.size) ||
      p.size < 1 ||
      at + p.size > file.size ||
      !/^([0-9a-f]{64})$/.test(p.sha256)
    )
      throw Error('备份数据段损坏。');
    const blob = file.slice(at, at + p.size, p.type);
    at += p.size;
    if ((await sha(blob)) !== p.sha256) throw Error('备份校验失败；本机账目未改变。');
    if (i === 0) {
      state = validateLedger(JSON.parse(await (await inflate(blob, p.encoding)).text()));
    } else {
      if (
        p.kind !== 'image' ||
        typeof p.id !== 'string' ||
        seen.has(p.id) ||
        p.size > 2 * 1024 * 1024 ||
        !/^image\/(png|jpeg|webp)$/.test(p.type)
      )
        throw Error('备份截图字段无效。');
      seen.add(p.id);
      attachments.push({ id: p.id, blob, sha256: p.sha256 });
    }
  }
  if (at !== file.size) throw Error('备份含有未声明的数据。');
  const refs = new Set(state.transactions.flatMap((t) => t.attachmentIds));
  if (refs.size !== seen.size || [...refs].some((id) => !seen.has(id)))
    throw Error('备份截图缺失或多余。');
  return { state, attachments };
}
