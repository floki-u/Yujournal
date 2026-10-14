import test from 'node:test';
import assert from 'node:assert/strict';
import { quickText, shortcutURL } from '../src/lib/quick-input.js';
import { readFile } from 'node:fs/promises';
test('only explicitly tagged clipboard contents enter the shortcut bridge', () => {
  assert.equal(quickText('YUJOURNAL-INBOX/1\n支付金额28元'), '支付金额28元');
  assert.throws(() => quickText('unrelated personal clipboard'));
  assert.throws(() => quickText('YUJOURNAL-INBOX/1\n'));
  assert.equal(
    shortcutURL('screenshot', 'https://example.com/ledger/'),
    'https://example.com/ledger/shortcuts/Yujournal-Screenshot.shortcut',
  );
});
test('installable shortcuts are Apple-signed and templates never upload screenshot or record speech remotely', async () => {
  for (const name of ['Screenshot', 'Voice']) {
    const signed = await readFile(
      new URL(`../shortcuts/Yujournal-${name}.shortcut`, import.meta.url),
    );
    assert.equal(signed.subarray(0, 4).toString(), 'AEA1');
    const template = await readFile(
      new URL(`../shortcuts/templates/Yujournal-${name}.plist`, import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(template, /downloadurl|dictatetext|WFHTTPMethod/);
    assert.equal(template.includes('?text='), false);
  }
  const screenshot = await readFile(
    new URL('../shortcuts/templates/Yujournal-Screenshot.plist', import.meta.url),
    'utf8',
  );
  assert.match(screenshot, /<key>WFLocalOnly<\/key>\s*<true\/>/);
});
test('shortcut installers stay on the app origin instead of requiring GitHub attachment redirects', () => {
  assert.equal(
    shortcutURL('screenshot', 'https://floki-u.github.io/Yujournal/'),
    'https://floki-u.github.io/Yujournal/shortcuts/Yujournal-Screenshot.shortcut',
  );
  assert.equal(
    shortcutURL('voice', 'https://floki-u.github.io/Yujournal/'),
    'https://floki-u.github.io/Yujournal/shortcuts/Yujournal-Voice.shortcut',
  );
});
test('shortcut preparation fetches and verifies the same-origin signed file once', async (t) => {
  const module = await import('../src/lib/quick-input.js');
  assert.equal(typeof module.prepareShortcut, 'function');
  const original = globalThis.fetch,
    requests = [];
  t.after(() => {
    globalThis.fetch = original;
  });
  const base = 'https://test.yujournal.local/ledger/';
  for (const [type, name] of Object.entries(module.shortcutFiles)) {
    const bytes = await readFile(new URL('../shortcuts/' + name, import.meta.url));
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return new Response(bytes);
    };
    const [a, b] = await Promise.all([
      module.prepareShortcut(type, base),
      module.prepareShortcut(type, base),
    ]);
    assert.equal(a, b);
    assert.equal(a.name, name);
    assert.deepEqual(new Uint8Array(await a.arrayBuffer()), new Uint8Array(bytes));
  }
  assert.deepEqual(requests, [
    'https://test.yujournal.local/ledger/shortcuts/Yujournal-Screenshot.shortcut',
    'https://test.yujournal.local/ledger/shortcuts/Yujournal-Voice.shortcut',
  ]);
});
test('prepared-file sharing invokes the native sheet before any asynchronous work', async (t) => {
  const module = await import('../src/lib/quick-input.js');
  assert.equal(typeof module.shareShortcut, 'function');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => {
    Object.defineProperty(globalThis, 'navigator', original);
  });
  let opened = false;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      canShare: () => true,
      share: async () => {
        opened = true;
      },
    },
  });
  const pending = module.shareShortcut(
    new File(['AEA1'], 'test.shortcut', { type: 'application/octet-stream' }),
  );
  assert.equal(opened, true, 'fetching after a tap would lose iOS transient activation');
  assert.equal(await pending, true);
});
test('HTML and corrupted downloads cannot become installable shortcut files', async (t) => {
  const { prepareShortcut } = await import('../src/lib/quick-input.js');
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async () =>
    new Response('<html>unavailable</html>', { headers: { 'Content-Type': 'text/html' } });
  await assert.rejects(prepareShortcut('voice', 'https://invalid.yujournal.local/'), /暂不可用/);
  globalThis.fetch = async () => new Response('AEA1corrupted');
  await assert.rejects(prepareShortcut('voice', 'https://invalid.yujournal.local/'), /校验失败/);
});
test('cancelling the native shortcut share stays cancelled rather than starting another action', async (t) => {
  const { shareShortcut } = await import('../src/lib/quick-input.js');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => Object.defineProperty(globalThis, 'navigator', original));
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      canShare: () => true,
      share: async () => {
        throw new DOMException('cancelled', 'AbortError');
      },
    },
  });
  await assert.rejects(shareShortcut(new File(['AEA1'], 'test.shortcut')), { name: 'AbortError' });
});
