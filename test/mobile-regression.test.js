import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
function section(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
}
function downloadUI() {
  let click;
  const jobs = [],
    messages = [];
  const button = { disabled: false, isConnected: true };
  const scope = {
    busy: false,
    entry: { mode: 'voice' },
    voiceDownload: null,
    voiceCapture: null,
    voiceCheckSequence: 0,
    ocrSequence: 0,
    quoteSequence: 0,
    imported: null,
    importFile: null,
    screen: 'home',
    AbortController,
    document: {
      querySelector: () => button,
      addEventListener: (_, handler) => {
        click = handler;
      },
    },
    prepareVoice: (progress, signal) =>
      new Promise((resolve) => {
        jobs.push({ resolve, progress, signal });
      }),
    voiceState: (message) => messages.push(message),
    voiceUI() {},
    toast() {},
    error() {},
    releaseOCR() {},
    revoke() {},
    sheet: { close() {} },
    entryUI() {},
    go: (screen) => {
      scope.screen = screen;
    },
  };
  vm.runInNewContext(
    section('async function prepareVoiceUI(', 'let profilePictureURL') +
      section('function close(', 'function openSheet(') +
      section('function entryStart(', 'function tabs(') +
      section('async function execute(', "document.addEventListener('pointerdown'") +
      section("document.addEventListener('click', async", "document.addEventListener('submit'"),
    scope,
  );
  return {
    scope,
    jobs,
    messages,
    click: (action, value) =>
      click({
        preventDefault() {},
        target: { closest: () => ({ dataset: { action, value } }) },
      }),
    finish: (index = jobs.length - 1) => jobs[index].resolve(),
  };
}
test('voice package preparation does not block switching to text entry', async () => {
  const h = downloadUI(),
    pending = h.click('prepareVoice');
  await new Promise((resolve) => setImmediate(resolve));
  try {
    await h.click('entryMode', 'text');
    assert.equal(h.scope.entry.mode, 'text');
  } finally {
    h.finish();
    await pending;
  }
});
test('closing a still-pending voice download leaves page navigation responsive', async () => {
  const h = downloadUI(),
    pending = h.click('prepareVoice');
  await new Promise((resolve) => setImmediate(resolve));
  try {
    await h.click('close');
    await h.click('settings');
    assert.equal(h.scope.screen, 'settings');
  } finally {
    h.finish();
    await pending;
  }
});
test('a cancelled download cannot repaint or unlock its replacement when it settles late', async () => {
  const h = downloadUI();
  await h.click('prepareVoice');
  await h.click('close');
  assert.equal(h.jobs[0].signal.aborted, true);
  await h.click('entryMode', 'voice');
  await h.click('prepareVoice');
  const active = h.scope.voiceDownload;
  h.jobs[0].progress({ phase: 'downloading', percent: 80, loaded: 80, total: 100 });
  h.finish(0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.messages, []);
  assert.equal(h.scope.voiceDownload, active);
  h.finish(1);
  await new Promise((resolve) => setImmediate(resolve));
});
test('the initial readiness check cannot overwrite live download progress', async () => {
  let checked, finish;
  const nodes = new Map(
    [
      '#voice-status',
      '[data-voice-control]',
      '#prepare-voice',
      '#voice-progress',
      '#voice-download-detail',
    ].map((key) => [key, { isConnected: true }]),
  );
  const scope = {
    entry: { mode: 'voice' },
    voiceDownload: null,
    voiceCheckSequence: 0,
    AbortController,
    document: { querySelector: (selector) => nodes.get(selector) },
    tabs: () => '',
    icon: () => '',
    openSheet() {},
    VoiceCapture: class {},
    voiceCapture: null,
    voiceReady: () =>
      new Promise((resolve) => {
        checked = resolve;
      }),
    prepareVoice: (progress) => {
      progress({
        phase: 'downloading',
        percent: 30,
        loaded: 30,
        total: 100,
        completed: 0,
        files: 2,
      });
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    error() {},
  };
  vm.runInNewContext(section('function voiceState(', 'let profilePictureURL'), scope);
  scope.voiceUI();
  const pending = scope.prepareVoiceUI();
  checked(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes.get('#voice-status').textContent, '下载语音包 30%');
  assert.equal(nodes.get('#voice-progress').value, 30);
  scope.voiceDownload.abort();
  scope.voiceDownload = null;
  finish();
  await pending;
});
test('switching from a scrolled My screen resets the actual main scroll container', () => {
  const content = {
    scrollTop: 900,
    scrollLeft: 0,
    scrollTo({ top, left }) {
      this.scrollTop = top;
      this.scrollLeft = left;
    },
  };
  const scope = {
    content,
    close() {},
    posterCanvas: null,
    posterBlob: null,
    screen: 'settings',
    render() {},
    window: { scrollTo() {} },
  };
  vm.runInNewContext(section('function go(', 'async function commit(') + "\ngo('home');", scope);
  assert.equal(content.scrollTop, 0);
});
test('each normal app start stays silent when the offline cache is already ready', async () => {
  const messages = [],
    scope = {
      crypto: { subtle: {} },
      DB: { readLedger: async () => ({}) },
      T: { setup() {} },
      render() {},
      loadProfilePicture: async () => {},
      state: null,
      navigator: {
        serviceWorker: { register: async () => ({}), ready: Promise.resolve(), controller: {} },
      },
      toast: (m) => messages.push(m),
      processDue: async () => {},
      refreshRates() {},
      URLSearchParams,
      location: { hash: '', search: '', pathname: '/' },
      history: { replaceState() {} },
      content: { innerHTML: '' },
      esc: String,
    };
  const code = app.slice(app.lastIndexOf('\ntry {'));
  await vm.runInNewContext('(async()=>{' + code + '})()', scope);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scope.content.innerHTML, '');
  assert.deepEqual(messages, []);
});
test('the default save-image action shares a PNG to the iOS system sheet instead of a download page', async () => {
  const calls = [],
    scope = {
      posterBlob: new Blob(['png'], { type: 'image/png' }),
      F: { periodInfo: () => ({ prefix: '2026-10' }) },
      periodDate: '2026-10-13',
      period: 'month',
      posterIndex: 0,
      File,
      navigator: {
        canShare: () => true,
        share: async (v) => calls.push(['share', v.files[0].type]),
      },
      download: () => calls.push(['download']),
      commit: async () => {},
      toast() {},
    };
  await vm.runInNewContext(
    section('async function posterSave(', 'function backupUI(') + '\nposterSave();',
    scope,
  );
  assert.deepEqual(calls, [['share', 'image/png']]);
});
