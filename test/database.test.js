import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.BroadcastChannel = undefined;
const DB = await import('../src/lib/database.js');
const L = await import('../src/lib/ledger.js');
test('atomic DB rollback, concurrent append, scalar callbacks and stale import protection', async () => {
  let initial = await DB.readLedger();
  assert.equal(initial.transactions.length, 0);
  assert.equal(initial.opening.amount, 0);
  initial = await DB.mutate((s) => (s.opening.amount = 100000));
  assert.equal(initial.opening.amount, 100000);
  const make = (n) =>
    L.transaction(
      {
        title: '测试' + n,
        type: 'expense',
        amount: n * 100,
        currency: 'CNY',
        date: '2026-10-13',
        source: 'manual',
      },
      '2026-10-13',
    );
  await Promise.all([
    DB.mutate((s) => L.addTransaction(s, make(1))),
    DB.mutate((s) => L.addTransaction(s, make(2))),
  ]);
  const before = await DB.readLedger();
  assert.equal(before.transactions.length, 2);
  await assert.rejects(() =>
    DB.mutate((s) => {
      s.opening.amount = 5000;
      s.transactions[0].amount = -1;
    }),
  );
  assert.deepEqual(await DB.readLedger(), before);
  await assert.rejects(
    () => DB.mutate((s) => (s.opening.amount = 0), { expectedRevision: 1 }),
    /更新/,
  );
  assert.deepEqual(await DB.readLedger(), before);
  const a = { id: L.id(), blob: new Blob(['screenshot'], { type: 'image/jpeg' }) };
  await DB.mutate(
    (s) =>
      L.addTransaction(
        s,
        L.transaction(
          {
            title: '截图',
            type: 'expense',
            amount: 1000,
            currency: 'CNY',
            date: '2026-10-13',
            source: 'ocr',
            attachmentIds: [a.id],
          },
          '2026-10-13',
        ),
      ),
    { attachments: [a] },
  );
  const full = await DB.snapshot();
  assert.equal(full.attachments.length, 1);
  assert.equal(full.state.transactions.length, 3);
  const invalid = { id: L.id(), blob: new Blob(['bad'], { type: 'text/html' }) };
  await assert.rejects(() =>
    DB.mutate((s) => L.addTransaction(s, make(3)), { attachments: [invalid] }),
  );
  assert.equal((await DB.readLedger()).transactions.length, 3);
  await assert.rejects(
    () =>
      DB.mutate((s) =>
        L.addTransaction(
          s,
          L.transaction(
            {
              title: '不存在附件',
              type: 'expense',
              amount: 100,
              currency: 'CNY',
              date: '2026-10-13',
              source: 'ocr',
              attachmentIds: [L.id()],
            },
            '2026-10-13',
          ),
        ),
      ),
    /不存在/,
  );
  assert.equal((await DB.readLedger()).transactions.length, 3);
  const replacement = L.createLedger('2026-10-13');
  const result = await DB.mutate(() => replacement, {
    replaceAttachments: true,
    expectedRevision: full.state.revision,
  });
  assert.equal(result.revision, full.state.revision + 1);
  assert.equal((await DB.snapshot()).attachments.length, 0);
  (await DB.database()).close();
});
