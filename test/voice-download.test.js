import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

async function harness(t, { ranges = true } = {}) {
  const original = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    fetch: globalThis.fetch,
    caches: globalThis.caches,
  };
  t.after(() => {
    Object.defineProperty(globalThis, 'navigator', original.navigator);
    globalThis.fetch = original.fetch;
    globalThis.caches = original.caches;
  });
  const bytes = new Uint8Array(5 * 1024 * 1024);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const meta = { files: [{ path: 'models/test.onnx', bytes: bytes.length, sha256 }] };
  const entries = new Map(),
    requests = [];
  let interrupt = false;
  const key = (url) => new URL(url.url || url).href;
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: { ready: Promise.resolve(), controller: {} } },
    configurable: true,
  });
  globalThis.caches = {
    open: async () => ({
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      match: async (url) => entries.get(key(url))?.clone(),
      put: async (url, response) => {
        const body = await response.arrayBuffer();
        entries.set(key(url), new Response(body, { headers: response.headers }));
      },
      delete: async (url) => entries.delete(key(url)),
    }),
  };
  globalThis.fetch = async (url, options = {}) => {
    if (new URL(url).pathname.endsWith('resource-manifest.json')) return Response.json(meta);
    const range = options.headers?.Range;
    requests.push(range || 'whole file');
    if (!ranges || !range) return new Response(bytes);
    const [, from, to] = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (interrupt && Number(from) > 0) throw new TypeError('connection interrupted');
    return new Response(bytes.slice(Number(from), Number(to) + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${from}-${to}/${bytes.length}` },
    });
  };
  const voice = await import('../src/lib/voice.js?parts=' + (ranges ? 'ranges' : 'fallback'));
  return {
    entries,
    requests,
    bytes,
    sha256,
    voice,
    setInterrupt: (value) => {
      interrupt = value;
    },
  };
}

test('an interrupted model download resumes after saved chunks and keeps one complete copy', async (t) => {
  const h = await harness(t);
  h.setInterrupt(true);
  await assert.rejects(h.voice.prepareVoice(), /connection interrupted/);
  assert.equal(await h.voice.voiceReady(), false);
  assert.equal(h.entries.size, 1, 'only the first complete chunk should be retained');
  const paused = await h.voice.voiceStorage();
  assert.equal(paused.completeBytes, 0);
  assert.equal(paused.partialBytes, 2097152);
  assert.equal(paused.parts, 1);
  h.setInterrupt(false);
  h.requests.length = 0;
  const progress = [];
  await h.voice.prepareVoice((state) => progress.push(state));
  assert.equal(h.requests[0], 'bytes=2097152-4194303');
  assert.ok(progress.some((state) => state.loaded === 2097152));
  assert.equal(await h.voice.voiceReady(), true);
  assert.equal(h.entries.size, 2, 'full model and manifest only; no chunk copies remain');
  const complete = await h.voice.voiceStorage();
  assert.equal(complete.completeBytes, h.bytes.length);
  assert.equal(complete.partialBytes, 0);
  assert.equal(complete.parts, 0);
  const model = [...h.entries].find(([url]) => new URL(url).pathname.endsWith('test.onnx'))[1];
  assert.equal(
    createHash('sha256')
      .update(new Uint8Array(await model.arrayBuffer()))
      .digest('hex'),
    h.sha256,
  );
});

test('a host without range support falls back to one whole file and leaves no partial copies', async (t) => {
  const h = await harness(t, { ranges: false });
  await h.voice.prepareVoice();
  assert.equal(h.requests.length, 1);
  assert.equal(await h.voice.voiceReady(), true);
  assert.equal(h.entries.size, 2);
});

test('reopening a complete pack removes chunks left by an interruption during final cleanup', async (t) => {
  const h = await harness(t);
  await h.voice.prepareVoice();
  const model = [...h.entries.keys()].find((url) => new URL(url).pathname.endsWith('test.onnx'));
  const leftover = new URL(model);
  leftover.searchParams.set('yujournal-part', h.sha256 + ':0');
  h.entries.set(
    leftover.href,
    new Response(h.bytes.slice(0, 2097152), { headers: { 'X-Yujournal-Part-Bytes': '2097152' } }),
  );
  assert.equal(await h.voice.voiceReady(), true);
  assert.equal(h.entries.has(leftover.href), false);
  assert.equal(h.entries.size, 2);
});
