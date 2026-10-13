import { createLedger, validateLedger, imageReferences } from './ledger.js';
let dbPromise;
const channel =
  typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('yujournal-updates:' + new URL('../../', import.meta.url).pathname)
    : null;
export const updates = new EventTarget();
channel?.addEventListener('message', () => updates.dispatchEvent(new Event('change')));
export function database() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(
      'yujournal-ledger:' + new URL('../../', import.meta.url).pathname,
      1,
    );
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('state');
      db.createObjectStore('attachments', { keyPath: 'id' });
      db.createObjectStore('cache');
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        dbPromise = null;
        updates.dispatchEvent(new Event('upgrade'));
      };
      resolve(request.result);
    };
    request.onerror = () => reject(Error('无法打开本机数据库，请检查浏览器是否允许储存。'));
    request.onblocked = () => reject(Error('请关闭其他余记窗口后重试升级。'));
  }));
}
const req = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export async function readLedger() {
  const db = await database();
  let s = await req(db.transaction('state').objectStore('state').get('ledger'));
  if (!s) {
    await mutate(() => {}, {});
    s = await req(db.transaction('state').objectStore('state').get('ledger'));
  }
  return validateLedger(s);
}
export async function mutate(
  action,
  { attachments = [], replaceAttachments = false, expectedRevision = null } = {},
) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['state', 'attachments'], 'readwrite'),
      store = tx.objectStore('state');
    let result, error;
    tx.oncomplete = () => {
      channel?.postMessage({ revision: result.revision });
      updates.dispatchEvent(new Event('change'));
      resolve(result);
    };
    tx.onabort = () => reject(error || Error('保存失败，原有账目未改变。请检查剩余储存空间。'));
    tx.onerror = () => {};
    const r = store.get('ledger');
    r.onsuccess = () => {
      try {
        const s = r.result || createLedger(),
          revision = s.revision;
        if (expectedRevision !== null && revision !== expectedRevision)
          throw Error('账本已被其他窗口更新，请重新预览导入。');
        const priorRefs = new Set(imageReferences(s));
        const returned = action(s);
        if (returned && typeof returned.then === 'function')
          throw Error('数据库更新必须为同步操作。');
        result = returned?.format === 'yuji-ledger' ? returned : s;
        result.revision = revision + 1;
        result.updatedAt = new Date().toISOString();
        validateLedger(result);
        const images = tx.objectStore('attachments');
        if (replaceAttachments) images.clear();
        for (const a of attachments) {
          if (
            !(a.blob instanceof Blob) ||
            a.blob.size > 2 * 1024 * 1024 ||
            !/^image\/(png|jpeg|webp)$/.test(a.blob.type)
          )
            throw Error('附件类型或大小无效。');
          images.put(a);
        }
        const supplied = new Set(attachments.map((a) => a.id));
        const refs = new Set(imageReferences(result));
        for (const key of refs) {
          if (supplied.has(key) || (!replaceAttachments && priorRefs.has(key))) continue;
          const check = images.get(key);
          check.onsuccess = () => {
            if (!check.result) {
              error = Error('引用的截图附件不存在。');
              tx.abort();
            }
          };
        }
        store.put(result, 'ledger');
      } catch (e) {
        error = e;
        tx.abort();
      }
    };
  });
}
export async function getAttachment(id) {
  const db = await database();
  return req(db.transaction('attachments').objectStore('attachments').get(id));
}
export async function snapshot() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['state', 'attachments']),
      r = tx.objectStore('state').get('ledger'),
      a = tx.objectStore('attachments').getAll();
    tx.oncomplete = () => resolve({ state: validateLedger(r.result), attachments: a.result });
    tx.onerror = () => reject(tx.error);
  });
}
export async function cacheGet(key) {
  const db = await database();
  return req(db.transaction('cache').objectStore('cache').get(key));
}
export async function cachePut(key, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite');
    tx.objectStore('cache').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
