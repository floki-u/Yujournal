import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntry, parseBatch } from '../src/lib/parser.js';
import { createLedger, setProfile, mergeLedger, imageReferences } from '../src/lib/ledger.js';
import { exportBackup, importBackup } from '../src/lib/backup.js';
test('payee labels in a payment screenshot never make an outgoing payment income', () => {
  const t = parseEntry('支付成功\n交易金额 ￥36.00\n收款方 星巴克\n付款人 我', { source: 'ocr' });
  assert.equal(t.amount, 3600);
  assert.equal(t.type, 'expense');
  assert.equal(parseEntry('收款成功\n到账金额 ￥100.00', { source: 'ocr' }).type, 'income');
});
test('one long sentence becomes separately dated income and expenses without counting a total twice', () => {
  const out = parseBatch('昨天午饭36元咖啡28元，今天收到工资两万元，股票亏了1000元，合计1064元', {
    today: '2026-10-13',
    source: 'voice',
  });
  assert.deepEqual(
    out.items.map((t) => [t.type, t.amount, t.date]),
    [
      ['expense', 3600, '2026-10-12'],
      ['expense', 2800, '2026-10-12'],
      ['income', 2000000, '2026-10-13'],
      ['expense', 100000, '2026-10-13'],
    ],
  );
  assert.equal(out.warnings.length, 1);
});
test('receipt mode selects actual paid amount instead of original price or discount', () => {
  const out = parseBatch('支付成功\n原价35.00\n优惠7.00\n实付金额 ￥28.00\n星巴克', {
    source: 'ocr',
    receipt: true,
  });
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].amount, 2800);
});
test('profile name and photo are included in complete backups and merge preference', async () => {
  const s = createLedger(),
    blob = new Blob(['avatar'], { type: 'image/jpeg' }),
    id = crypto.randomUUID();
  setProfile(s, { name: '我的生活', avatarId: id });
  assert.ok(imageReferences(s).includes(id));
  const restored = await importBackup(await exportBackup(s, [{ id, blob }]));
  assert.equal(restored.state.profile.name, '我的生活');
  assert.equal(await restored.attachments[0].blob.text(), 'avatar');
  const local = createLedger();
  setProfile(local, { name: '本机名字' });
  assert.equal(mergeLedger(local, s).profile.name, '本机名字');
  assert.equal(mergeLedger(local, s, 'imported').profile.name, '我的生活');
  await assert.rejects(() => exportBackup(s, []), /缺失/);
});

test('Arabic/Chinese mixed units from speech preserve the full amount', () => {
  assert.equal(parseEntry('工资到账1.8万元').amount, 1800000);
  assert.equal(parseEntry('房租1万2千元').amount, 1200000);
  const out = parseBatch('今天午飯花了36元,咖啡28元,收到公司2萬元,股票亏了1000元。', {
    source: 'voice',
  });
  assert.deepEqual(
    out.items.map((t) => t.amount),
    [3600, 2800, 2000000, 100000],
  );
});
test('receipt lists retain merchant, signed direction and visible dates', () => {
  const out = parseBatch('星巴克\n-28.00\n10月13日 12:03\n工资\n+20000.00\n10月12日 08:00', {
    today: '2026-10-13',
    source: 'ocr',
  });
  assert.deepEqual(
    out.items.map((t) => [t.title, t.type, t.amount, t.date]),
    [
      ['星巴克', 'expense', 2800, '2026-10-13'],
      ['工资', 'income', 2000000, '2026-10-12'],
    ],
  );
});
