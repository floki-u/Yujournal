import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
function harness({ redirect = false } = {}) {
  const handlers = {},
    maps = new Map(),
    scope = 'https://test.yuji.local/',
    requests = [];
  let offline = false,
    claimed = false,
    skipped = false;
  const abs = (key) => new URL(typeof key === 'string' ? key : key.href || key.url, scope).href;
  const caches = {
    keys: async () => [...maps.keys()],
    delete: async (n) => maps.delete(n),
    open: async (n) => {
      if (!maps.has(n)) maps.set(n, new Map());
      const map = maps.get(n);
      return {
        put: async (k, v) => map.set(abs(k), v.clone()),
        match: async (k) => map.get(abs(k))?.clone(),
      };
    },
  };
  const fakeFetch = async (input) => {
    const url = abs(input);
    requests.push(url);
    if (offline) throw Error('offline');
    const pathname = new URL(url).pathname;
    const isHTML = pathname === '/' || pathname.endsWith('.html');
    const r = new Response(isHTML ? 'YUJI SHELL' : pathname, {
      headers: {
        'Content-Type': isHTML
          ? 'text/html'
          : pathname.endsWith('.js')
            ? 'text/javascript'
            : 'application/octet-stream',
      },
    });
    if (redirect && pathname.endsWith('app.js')) {
      Object.defineProperty(r, 'redirected', { value: true });
    }
    return r;
  };
  vm.runInNewContext(source, {
    self: {
      registration: { scope },
      location: { origin: new URL(scope).origin },
      addEventListener: (n, h) => (handlers[n] = h),
      skipWaiting: async () => (skipped = true),
      clients: { claim: async () => (claimed = true) },
    },
    URL,
    caches,
    fetch: fakeFetch,
    Error,
  });
  return {
    handlers,
    maps,
    caches,
    requests,
    setOffline: () => (offline = true),
    skipped: () => skipped,
    claimed: () => claimed,
    async event(name) {
      let p;
      handlers[name]({ waitUntil: (promise) => (p = promise) });
      await p;
    },
    async request(path) {
      let promise;
      handlers.fetch({
        request: new Request(new URL(path, scope)),
        respondWith: (p) => (promise = p),
      });
      return promise;
    },
  };
}
test('SW precaches only app shell, supports offline reopening/resources and preserves optional caches on upgrade', async () => {
  const h = harness();
  await h.caches.open('yujournal-shell-%2F-older');
  await h.caches.open('yujournal-ocr-v6-fast-874164-%2F');
  await h.caches.open('yujournal-world-v4-%2F');
  await h.event('install');
  assert.equal(h.skipped(), true);
  assert.ok(h.requests.some((r) => r.endsWith('/src/lib/database.js')));
  assert.equal(
    h.requests.some((r) => r.includes('vendor/ocr')),
    false,
  );
  assert.equal(
    h.requests.some((r) => r.includes('assets/')),
    false,
  );
  await h.event('activate');
  assert.equal(h.claimed(), true);
  assert.equal(h.maps.has('yujournal-shell-%2F-older'), false);
  assert.equal(h.maps.has('yujournal-ocr-v6-fast-874164-%2F'), true);
  await h.request('assets/mint-bg.webp');
  h.setOffline();
  assert.equal(await (await h.request('./?entry=text')).text(), 'YUJI SHELL');
  assert.equal(await (await h.request('src/app.js')).text(), '/src/app.js');
  assert.equal(await (await h.request('assets/mint-bg.webp')).text(), '/assets/mint-bg.webp');
});
test('auth redirects cannot be accepted as an installed script shell', async () => {
  const h = harness({ redirect: true });
  await assert.rejects(() => h.event('install'), /Incomplete shell/);
  assert.equal(h.skipped(), false);
});
