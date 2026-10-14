import test from 'node:test';
import assert from 'node:assert/strict';
import { resampleMono, VoiceCapture, prepareVoice } from '../src/lib/voice.js';
async function downloadHarness(t, { short = false } = {}) {
  const saved = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    fetch: globalThis.fetch,
    caches: globalThis.caches,
  };
  t.after(() => {
    Object.defineProperty(globalThis, 'navigator', saved.navigator);
    globalThis.fetch = saved.fetch;
    globalThis.caches = saved.caches;
  });
  const meta = {
    files: [
      { path: 'cached.bin', bytes: 3 },
      { path: 'next.bin', bytes: 4 },
    ],
  };
  const entries = new Map([['cached.bin', new Response(new Uint8Array(3))]]),
    progress = [];
  let allowSave, saving;
  const saveStarted = new Promise((resolve) => {
    saving = resolve;
  });
  const saveGate = new Promise((resolve) => {
    allowSave = resolve;
  });
  const name = (url) => new URL(url).pathname.split('/').at(-1);
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: { ready: Promise.resolve(), controller: {} } },
    configurable: true,
  });
  globalThis.caches = {
    open: async () => ({
      match: async (url) => entries.get(name(url))?.clone(),
      put: async (url, response) => {
        const bytes = await response.arrayBuffer();
        if (name(url) === 'next.bin') {
          saving();
          await saveGate;
        }
        entries.set(name(url), new Response(bytes, { headers: response.headers }));
      },
    }),
  };
  globalThis.fetch = async (url) =>
    name(url) === 'resource-manifest.json'
      ? Response.json(meta)
      : new Response(new Uint8Array(short ? 2 : 4));
  const voice = await import('../src/lib/voice.js?download=' + (short ? 'short' : 'complete'));
  return { entries, progress, saveStarted, allowSave, voice };
}
test('resumed downloads report existing bytes and reach ready only after complete cache writes', async (t) => {
  const h = await downloadHarness(t);
  const pending = h.voice.prepareVoice((p) => h.progress.push(p));
  await h.saveStarted;
  assert.ok(h.progress.some((p) => p.phase === 'cached' && p.loaded === 3));
  assert.equal(h.progress.at(-1).phase, 'saving');
  assert.ok(h.progress.every((p) => p.percent < 100));
  assert.equal(h.entries.has('resource-manifest.json'), false);
  h.allowSave();
  await pending;
  assert.equal(h.progress.at(-1).phase, 'ready');
  assert.equal(h.progress.at(-1).percent, 100);
  assert.equal(await h.voice.voiceReady(), true);
});
test('an incomplete response never becomes a prepared voice pack and preserves prior files', async (t) => {
  const h = await downloadHarness(t, { short: true });
  await assert.rejects(h.voice.prepareVoice(), /未下载完整/);
  assert.equal(h.entries.has('next.bin'), false);
  assert.equal(h.entries.has('cached.bin'), true);
  assert.equal(await h.voice.voiceReady(), false);
});
test('cancelling while the service worker is not ready settles the download promptly', async () => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: { ready: new Promise(() => {}), controller: {} } },
    configurable: true,
  });
  const controller = new AbortController();
  const pending = prepareVoice(() => {}, controller.signal).then(
    () => 'finished',
    (error) => error.name,
  );
  controller.abort();
  const outcome = await Promise.race([
    pending,
    new Promise((resolve) => setTimeout(() => resolve('still waiting'), 40)),
  ]);
  assert.equal(outcome, 'AbortError');
});
test('voice preparation downmixes/resamples locally to 16kHz without changing duration', () => {
  const channels = [new Float32Array(48000).fill(0.25), new Float32Array(48000).fill(0.75)];
  const out = resampleMono(channels, 48000);
  assert.equal(out.length, 16000);
  assert.equal(out[123], 0.5);
});
test('releasing before readiness never requests a microphone later', async () => {
  let finish,
    requested = 0;
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: async () => {
          requested++;
          return { getTracks: () => [] };
        },
      },
    },
    configurable: true,
  });
  const capture = new VoiceCapture({ ready: () => new Promise((resolve) => (finish = resolve)) }),
    pending = capture.start();
  capture.stop();
  finish(true);
  await pending;
  assert.equal(requested, 0);
});
test('granting microphone permission after release closes the stream instead of starting an unrequested recording', async () => {
  let grant,
    stopped = 0,
    created = 0;
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: () => new Promise((resolve) => (grant = resolve)) } },
    configurable: true,
  });
  globalThis.MediaRecorder = class {
    constructor() {
      created++;
    }
    static isTypeSupported() {
      return true;
    }
  };
  const capture = new VoiceCapture({ ready: async () => true }),
    pending = capture.start();
  await new Promise((r) => setImmediate(r));
  capture.stop();
  grant({
    getTracks: () => [
      {
        stop() {
          stopped++;
        },
      },
    ],
  });
  await pending;
  assert.equal(stopped, 1);
  assert.equal(created, 0);
});
