export const VOICE_CACHE =
  'yujournal-voice-base-q8-v1-' + encodeURIComponent(new URL('../../', import.meta.url).pathname);
const base = new URL('../../vendor/voice/', import.meta.url);
let metadata = null,
  worker = null,
  request = null,
  sequence = 0;
// Cache APIs and serviceWorker.ready do not accept a cancellation signal.
// Bound those waits too, so leaving the sheet never strands its caller.
function waitFor(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const settle = (fn, value) => {
      signal.removeEventListener('abort', abort);
      fn(value);
    };
    const abort = () => settle(reject, signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(
      (value) => settle(resolve, value),
      (error) => settle(reject, error),
    );
    if (signal.aborted) abort();
  });
}
function deadline(signal, milliseconds) {
  const timeout = AbortSignal.timeout(milliseconds);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
export async function voiceManifest(signal = null) {
  if (!metadata) {
    const limit = deadline(signal, 15000);
    const response = await waitFor(
      fetch(new URL('resource-manifest.json', base), { signal: limit }),
      limit,
    );
    if (!response.ok) throw Error('语音包清单暂不可用。');
    metadata = await waitFor(response.json(), limit);
  }
  return metadata;
}
export async function voiceReady() {
  const meta = await voiceManifest(),
    cache = await caches.open(VOICE_CACHE);
  for (const f of meta.files.filter((f) => !f.path.startsWith('licenses/')))
    if (!(await cache.match(new URL(f.path, base)))) return false;
  return true;
}
export async function prepareVoice(progress = () => {}, signal = null) {
  if (!('serviceWorker' in navigator)) throw Error('请在支持离线缓存的 Safari 中打开。');
  signal?.throwIfAborted();
  progress({ phase: 'checking', percent: 0, loaded: 0, total: 0, completed: 0, files: 0 });
  const startLimit = deadline(signal, 15000);
  await waitFor(navigator.serviceWorker.ready, startLimit);
  if (!navigator.serviceWorker.controller)
    throw Error('离线外壳尚未准备，请关闭余记后重新打开再试。');
  const meta = await voiceManifest(signal),
    files = meta.files.filter((f) => !f.path.startsWith('licenses/')),
    total = files.reduce((n, f) => n + f.bytes, 0),
    cache = await waitFor(caches.open(VOICE_CACHE), deadline(signal, 15000));
  let loaded = 0,
    completed = 0,
    lastProgress = 0;
  const report = (phase, force = false) => {
    const now = Date.now();
    if (!force && now - lastProgress < 120) return;
    lastProgress = now;
    progress({
      phase,
      percent: phase === 'ready' ? 100 : Math.min(99, Math.floor((loaded / total) * 100)),
      loaded,
      total,
      completed,
      files: files.length,
    });
  };
  for (const file of files) {
    signal?.throwIfAborted();
    const limit = deadline(signal, 120000);
    const url = new URL(file.path, base);
    report('checking', true);
    if (await waitFor(cache.match(url), limit)) {
      loaded += file.bytes;
      completed++;
      report('cached', true);
      continue;
    }
    report('connecting', true);
    const response = await waitFor(
      fetch(url, {
        cache: 'no-store',
        signal: limit,
      }),
      limit,
    );
    if (
      !response.ok ||
      response.redirected ||
      response.headers.get('content-type')?.includes('text/html')
    )
      throw Error('语音包下载失败，已有资源保留，可重试。');
    if (!response.body) throw Error('语音资源为空，请重试下载。');
    let bytes = 0;
    const stream = response.body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          loaded += chunk.byteLength;
          report('downloading');
          controller.enqueue(chunk);
        },
        flush() {
          if (bytes !== file.bytes) throw Error('语音资源未下载完整，已完成的文件保留，请重试。');
          report('saving', true);
        },
      }),
      { signal: limit },
    );
    const headers = new Headers(response.headers);
    headers.delete('Content-Encoding');
    headers.delete('Content-Length');
    await waitFor(cache.put(url, new Response(stream, { headers })), limit);
    completed++;
    report('saved', true);
  }
  signal?.throwIfAborted();
  report('saving', true);
  await waitFor(
    cache.put(
      new URL('resource-manifest.json', base),
      new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }),
    ),
    deadline(signal, 15000),
  );
  report('ready', true);
}
export function releaseVoice() {
  sequence++;
  if (worker) {
    worker.terminate();
    worker = null;
  }
  if (request) {
    request.reject(new DOMException('已取消本机识别。', 'AbortError'));
    request = null;
  }
}
export async function transcribe(audio, progress = () => {}) {
  if (!(await voiceReady())) throw Error('请先准备本机语音包。');
  if (!(audio instanceof Float32Array) || audio.length < 1600 || audio.length > 16000 * 90)
    throw Error('录音长度无效；一次最多 90 秒。');
  releaseVoice();
  const id = ++sequence;
  worker = new Worker(new URL('./voice-worker.js', import.meta.url), { type: 'module' });
  const result = new Promise((resolve, reject) => {
    request = { resolve, reject };
    worker.onerror = (e) => reject(Error(e.message || '本机语音引擎无法启动。'));
    worker.onmessage = (e) => {
      const data = e.data;
      if (data.id !== id) return;
      if (data.type === 'progress') progress(data.message);
      else if (data.type === 'result') resolve(data.text);
      else if (data.type === 'error') reject(Error(data.message));
    };
  });
  worker.postMessage({ id, audio }, [audio.buffer]);
  try {
    return await result;
  } finally {
    request = null;
    releaseVoice();
  }
}
export function resampleMono(channels, sampleRate, target = 16000) {
  if (!channels.length || sampleRate <= 0) throw Error('录音采样无效。');
  const length = Math.floor((channels[0].length * target) / sampleRate),
    out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = (i * sampleRate) / target,
      left = Math.floor(position),
      fraction = position - left;
    let sum = 0;
    for (const ch of channels)
      sum += (ch[left] || 0) * (1 - fraction) + (ch[left + 1] || 0) * fraction;
    out[i] = sum / channels.length;
  }
  return out;
}
export async function audioSamples(blob) {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context) throw Error('当前浏览器不支持录音解码。');
  let context;
  try {
    context = new Context({ sampleRate: 16000 });
  } catch {
    context = new Context();
  }
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
      audio.getChannelData(i),
    );
    return resampleMono(channels, audio.sampleRate);
  } finally {
    await context.close();
  }
}
export class VoiceCapture {
  constructor({
    onState = () => {},
    onResult = () => {},
    onError = () => {},
    ready = voiceReady,
  } = {}) {
    this.ready = ready;
    this.onState = onState;
    this.onResult = onResult;
    this.onError = onError;
    this.generation = 0;
    this.released = true;
    this.starting = false;
    this.stream = null;
    this.recorder = null;
    this.parts = [];
    this.timer = null;
  }
  async start() {
    if (this.stream || this.recorder || this.starting) return;
    this.starting = true;
    const generation = ++this.generation;
    this.released = false;
    this.cancelled = false;
    try {
      if (!(await this.ready())) throw Error('请先准备本机语音包。');
      if (this.released || generation !== this.generation) return;
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder)
        throw Error('当前环境不支持应用内录音，请用文本输入。');
      this.onState('正在请求麦克风权限…');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (this.released || generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        this.onState('麦克风已准备，请再次按住说话。');
        return;
      }
      this.stream = stream;
      this.parts = [];
      this.startedAt = Date.now();
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) this.parts.push(e.data);
      };
      this.recorder.onstop = () => this.finish(generation);
      this.recorder.start();
      this.onState('正在录音，松开后整理。上滑可取消。');
      this.timer = setTimeout(() => this.stop(), 90000);
    } catch (error) {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.released = true;
      if (error.name !== 'AbortError' && generation === this.generation) this.onError(error);
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }
  stop(cancel = false) {
    this.released = true;
    this.cancelled = cancel;
    clearTimeout(this.timer);
    if (this.recorder?.state === 'recording') this.recorder.stop();
    else this.stream?.getTracks().forEach((t) => t.stop());
  }
  async finish(generation) {
    const recorder = this.recorder;
    this.recorder = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const parts = this.parts;
    this.parts = [];
    if (this.cancelled || generation !== this.generation) {
      this.onState('已取消录音。');
      return;
    }
    if (Date.now() - this.startedAt < 500) {
      this.onState('按住说话，松开后自动整理。');
      return;
    }
    try {
      this.onState('录音已结束，正在本机整理…');
      const audio = await audioSamples(new Blob(parts, { type: recorder.mimeType }));
      if (generation !== this.generation) return;
      const text = await transcribe(audio, (message) => this.onState(message));
      if (generation === this.generation) this.onResult(text);
    } catch (error) {
      if (error.name !== 'AbortError' && generation === this.generation) this.onError(error);
    }
  }
  cancel() {
    this.generation++;
    this.starting = false;
    this.stop(true);
    releaseVoice();
  }
}
