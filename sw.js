const SCOPE = encodeURIComponent(new URL(self.registration.scope).pathname);
const PREFIX = 'yujournal-shell-' + SCOPE + '-';
const CORE = PREFIX + '__BUILD_HASH__',
  WORLD = 'yujournal-world-v4-' + SCOPE,
  OCR = 'yujournal-ocr-v6-fast-874164-' + SCOPE,
  VOICE = 'yujournal-voice-base-q8-v1-' + SCOPE;
const FILES = [
  './',
  'index.html',
  'install.html',
  'src/app.js',
  'src/icons.js',
  'styles/app.css',
  'styles/base.css',
  'styles/themes.css',
  'styles/worlds.css',
  'src/features.js',
  'src/theme-studio.js',
  'src/views.js',
  'icon.svg',
  'icon.png',
  'manifest.webmanifest',
  'src/lib/money.js',
  'src/lib/dates.js',
  'src/lib/ledger.js',
  'src/lib/database.js',
  'src/lib/backup.js',
  'src/lib/parser.js',
  'src/lib/exchange.js',
  'src/lib/ocr.js',
  'src/lib/voice.js',
  'src/lib/voice-worker.js',
  'src/lib/quick-input.js',
];

function valid(r) {
  return r.ok && !r.redirected;
}
self.addEventListener('install', (e) =>
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CORE);
      for (const file of FILES) {
        const r = await fetch(new URL(file, self.registration.scope), { cache: 'reload' });
        if (
          !valid(r) ||
          (file !== './' &&
            !file.endsWith('.html') &&
            r.headers.get('content-type')?.includes('text/html'))
        )
          throw Error('Incomplete shell');
        await cache.put(file, r);
      }
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(PREFIX) && name !== CORE) await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (!path || path === 'index.html') {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CORE);
        try {
          const r = await fetch(e.request);
          if (valid(r) && r.headers.get('content-type')?.includes('text/html')) return r;
        } catch {}
        return (await cache.match('index.html')) || (await cache.match('./'));
      })(),
    );
    return;
  }
  const cacheName = path.startsWith('vendor/voice/')
    ? VOICE
    : path.startsWith('vendor/ocr/')
      ? OCR
      : /^(assets|fonts)\//.test(path)
        ? WORLD
        : CORE;
  e.respondWith(
    (async () => {
      const cache = await caches.open(cacheName),
        cached = await cache.match(new URL(path, self.registration.scope));
      if (cached) return cached;
      const r = await fetch(e.request);
      if (
        valid(r) &&
        !r.headers.get('content-type')?.includes('text/html') &&
        // The voice downloader owns streaming/progress and cache writes. Waiting
        // for a second Cache.put here hides all bytes until a large model finishes.
        cacheName !== VOICE &&
        (cacheName !== CORE || FILES.includes(path))
      )
        await cache.put(new URL(path, self.registration.scope), r.clone());
      return r;
    })(),
  );
});
