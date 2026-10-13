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
