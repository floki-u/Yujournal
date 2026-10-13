import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/lib/ledger.js';
import { parseAmount, convertAmount } from '../src/lib/money.js';
import { nextOccurrence, addDays } from '../src/lib/dates.js';
import { parseEntry, chineseNumber } from '../src/lib/parser.js';
import { exportBackup, importBackup } from '../src/lib/backup.js';
const today = '2026-10-13';
const txn = (input = {}) =>
  L.transaction(
    {
      title: '午饭',
      type: 'expense',
      amount: 3600,
      currency: 'CNY',
      date: today,
      source: 'text',
      ...input,
    },
    today,
  );
test('decimal input stays in integer hundredths, JPY cannot be fractional', () => {
  assert.equal(parseAmount('0.29'), 29);
  assert.equal(parseAmount('1,000.01'), 100001);
  assert.equal(parseAmount('1200', 'JPY'), 120000);
  assert.throws(() => parseAmount('1.5', 'JPY'));
  assert.throws(() => parseAmount('1e5'));
  assert.throws(() => parseAmount('0'));
  assert.equal(convertAmount(1234, 7.125), 8792);
});
test('stock loss is one expense; initial assets and goal allocations do not become expenses', () => {
  const s = L.createLedger(today);
  s.opening.amount = 100000;
  const p = parseEntry('今天股票亏了100元', { today });
  L.addTransaction(s, txn(p));
  assert.equal(L.balance(s), 90000);
  s.goals.push({ id: L.id(), name: '旅行', target: 50000, date: '2027-01-01', events: [] });
  L.allocateGoal(s, s.goals[0].id, 10000);
  assert.equal(L.balance(s), 90000);
  assert.equal(L.allocated(s), 10000);
  assert.throws(() => L.allocateGoal(s, s.goals[0].id, 90000));
  L.allocateGoal(s, s.goals[0].id, -5000);
  assert.equal(L.saved(s.goals[0]), 5000);
  assert.throws(() => L.allocateGoal(s, s.goals[0].id, -6000));
});
test('frozen currency amount is unaffected by current rates; actual settlement overrides reference', () => {
  const s = L.createLedger(today),
    t = txn({ currency: 'USD', amount: 10000, rate: 7.1, rateDate: '2026-10-12' });
  L.addTransaction(s, t);
  assert.equal(L.balance(s), -71000);
  const real = txn({ currency: 'USD', amount: 10000, settlement: 72123 });
  assert.equal(real.baseAmount, 72123);
  assert.equal(real.rateSource, 'settlement');
  assert.throws(() => txn({ currency: 'USD', rate: 7, rateDate: '2026-10-14' }));
  assert.throws(() => txn({ date: '2026-10-14' }));
});
test('calendar handles leap day, DST boundary and monthly end dates', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  const t = { startDate: '2024-01-31', day: 31, frequency: 'monthly', interval: 1 };
  assert.equal(nextOccurrence(t, '2024-02-01'), '2024-02-29');
  assert.equal(nextOccurrence(t, '2024-03-01'), '2024-03-31');
  assert.equal(nextOccurrence({ ...t, frequency: 'weekly' }, '2024-02-01'), '2024-02-07');
  assert.equal(
    nextOccurrence(
      { startDate: '2024-02-29', day: 29, frequency: 'yearly', interval: 1 },
      '2025-01-01',
    ),
    '2025-02-28',
  );
});
test('automatic and pending recurring catch-up never duplicate; pending freezes template', () => {
  const s = L.createLedger(today);
  L.saveTemplate(s, {
    name: '房租',
    type: 'expense',
    amount: 10000,
    currency: 'CNY',
    frequency: 'monthly',
    interval: 1,
    day: 31,
    startDate: '2026-07-01',
    endDate: '',
    mode: 'auto',
  });
  L.catchUp(s, today);
  assert.equal(s.transactions.length, 3);
  assert.deepEqual(
    s.transactions.map((t) => t.date),
    ['2026-07-31', '2026-08-31', '2026-09-30'],
  );
  L.catchUp(s, today);
  assert.equal(s.transactions.length, 3);
  L.saveTemplate(s, {
    name: '工资',
    type: 'income',
    amount: 50000,
    currency: 'CNY',
    frequency: 'monthly',
    interval: 1,
    day: 1,
    startDate: '2026-09-01',
    endDate: '',
    mode: 'confirm',
  });
  L.catchUp(s, today);
  assert.equal(s.pending.length, 2);
  const key = s.pending[0].id;
  s.templates[1].amount = 60000;
  assert.equal(s.pending[0].snapshot.amount, 50000);
  L.resolvePending(
    s,
    key,
    txn({ title: '工资', type: 'income', amount: 50000, date: '2026-09-01' }),
  );
  L.catchUp(s, today);
  assert.equal(s.pending.length, 1);
  assert.throws(() => L.resolvePending(s, key));
  assert.equal(s.transactions.at(-1).occurrenceId, key);
});
test('delete excludes record, undo restores, milestones stay permanent and stale edits rejected', () => {
  const s = L.createLedger(today),
    t = txn();
  L.addTransaction(s, t);
  L.deleteTransaction(s, t.id, t.updatedAt);
  assert.equal(L.balance(s), 0);
  assert.ok(s.unlockedThemes.includes('mint'));
  assert.throws(() => L.editTransaction(s, t.id, t.updatedAt, { ...t, title: 'x' }));
  L.restoreTransaction(s, t.id);
  assert.equal(L.balance(s), -3600);
  assert.throws(() => L.editTransaction(s, t.id, 'stale', { ...t, title: 'x' }));
});
test('voice parses Chinese and relative date; ambiguous amounts require selection; OCR payment wins', () => {
  assert.equal(chineseNumber('一万二'), 12000);
  assert.equal(chineseNumber('一千零二'), 1002);
  assert.equal(chineseNumber('九块五'), 9.5);
  assert.equal(parseEntry('昨天工资到账一万二元', { today }).amount, 1200000);
  assert.equal(parseEntry('昨天工资到账一万二元', { today }).date, '2026-10-12');
  assert.equal(parseEntry('午饭36元晚饭20元', { today }).ambiguous, true);
  const ocr = parseEntry('支付成功\n原价 35.00\n实付金额\n￥28.00\n2026-10-12 12:03\n星巴克', {
    today,
    source: 'ocr',
  });
  assert.equal(ocr.amount, 2800);
  assert.equal(ocr.title, '咖啡');
  assert.equal(ocr.date, '2026-10-12');
  assert.throws(() => parseEntry('交易订单12345678901234', { today, source: 'ocr' }));
});
test('full backup round-trips screenshots, goals, templates, achievements and encryption', async () => {
  const s = L.createLedger(today),
    attachment = { id: L.id(), blob: new Blob(['local image bytes'], { type: 'image/jpeg' }) };
  L.addTransaction(s, txn({ attachmentIds: [attachment.id] }));
  s.lastBackup = new Date().toISOString();
  L.award(s);
  const blob = await exportBackup(s, [attachment]);
  const read = await importBackup(blob);
  assert.deepEqual(read.state, s);
  assert.equal(await read.attachments[0].blob.text(), 'local image bytes');
  const encrypted = await exportBackup(s, [attachment], 'correct password');
  assert.deepEqual((await importBackup(encrypted, 'correct password')).state, s);
  await assert.rejects(() => importBackup(encrypted, 'wrong password'));
  await assert.rejects(() => exportBackup(s, []));
  const corrupt = await blob.arrayBuffer();
  new Uint8Array(corrupt)[corrupt.byteLength - 1] ^= 1;
  await assert.rejects(() => importBackup(new Blob([corrupt])), /校验/);
  await assert.rejects(() => importBackup(new Blob([blob, 'junk'])), /未声明/);
});
test('merge is idempotent, handles conflicts, never sums opening balances or savings twice', () => {
  const a = L.createLedger(today);
  a.opening.amount = 10000;
  L.addTransaction(a, txn());
  const b = structuredClone(a);
  b.opening.amount = 20000;
  b.transactions[0].title = '改备注';
  L.addTransaction(b, txn({ type: 'income', amount: 8000 }));
  b.lastBackup = '2026-10-13T00:00:00Z';
  L.award(b);
  const merged = L.mergeLedger(a, b);
  assert.equal(merged.opening.amount, 10000);
  assert.equal(merged.transactions[0].title, '午饭');
  assert.equal(merged.transactions.length, 2);
  assert.ok(merged.unlockedThemes.includes('postcard'));
  assert.deepEqual(L.mergeLedger(merged, b).transactions, merged.transactions);
  assert.equal(L.mergeLedger(a, b, 'imported').opening.amount, 20000);
  assert.equal(L.mergeLedger(a, b, 'imported').transactions[0].title, '改备注');
  assert.throws(() => L.validateLedger({ ...a, schemaVersion: 99 }));
});

test('archiving releases savings while retaining event history and can be restored', () => {
  const s = L.createLedger(today);
  s.opening.amount = 100000;
  s.goals.push({ id: L.id(), name: '计划', target: 20000, date: '2027-01-01', events: [] });
  const id = s.goals[0].id;
  L.allocateGoal(s, id, 10000);
  L.archiveGoal(s, id);
  assert.equal(L.allocated(s), 0);
  assert.equal(L.balance(s), 100000);
  assert.equal(s.goals[0].events.length, 2);
  L.restoreGoal(s, id);
  assert.equal(L.saved(s.goals[0]), 0);
  assert.equal(s.goals[0].archivedAt, undefined);
});
test('two devices derive the same fixed transaction ID and merged catch-up cannot double count', () => {
  const a = L.createLedger(today);
  L.saveTemplate(a, {
    name: '工资',
    type: 'income',
    amount: 50000,
    currency: 'CNY',
    frequency: 'monthly',
    interval: 1,
    day: 13,
    startDate: today,
    endDate: '',
    mode: 'auto',
  });
  const b = structuredClone(a);
  L.catchUp(a, today);
  L.catchUp(b, today);
  assert.equal(a.transactions[0].id, b.transactions[0].id);
  assert.equal(L.mergeLedger(a, b).transactions.length, 1);
  const t = a.transactions[0],
    expected = t.updatedAt;
  L.editTransaction(a, t.id, expected, { ...t, title: '变更工资' }, today);
  assert.notEqual(t.updatedAt, expected);
  assert.throws(() => L.editTransaction(a, t.id, expected, { ...t, title: '旧窗口' }, today));
});
test('foreign automatic occurrence uses dated frozen quote and missing quote becomes pending', () => {
  const s = L.createLedger(today);
  L.saveTemplate(s, {
    name: '订阅',
    type: 'expense',
    amount: 10000,
    currency: 'USD',
    frequency: 'monthly',
    interval: 1,
    day: 13,
    startDate: '2026-09-13',
    endDate: '',
    mode: 'auto',
  });
  L.catchUp(s, today, { 'USD:2026-10-13': { rate: 7.1, rateDate: '2026-10-12' } });
  assert.equal(s.transactions.length, 1);
  assert.equal(s.transactions[0].baseAmount, 71000);
  assert.equal(s.pending.length, 1);
  assert.equal(s.pending[0].dueDate, '2026-09-13');
});

test('spoken fractional Chinese money does not become whole yuan', () => {
  assert.equal(parseEntry('今天花了五毛', { today }).amount, 50);
  assert.equal(parseEntry('今天花了三块五毛六分', { today }).amount, 356);
  assert.equal(parseEntry('今天花了九元五角六分', { today }).amount, 956);
  assert.equal(chineseNumber('三点五元'), 3.5);
});
