import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
function section(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
}
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
