import test from 'node:test';
import assert from 'node:assert/strict';
import { resampleMono, VoiceCapture } from '../src/lib/voice.js';
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
