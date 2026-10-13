import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const source = await readFile(new URL('../src/features.js', import.meta.url), 'utf8');
const sandbox = {
  window: {},
  document: {
    createElement: (tag) => {
      assert.equal(tag, 'canvas');
      return createCanvas(1, 1);
    },
  },
};
vm.runInNewContext(source, sandbox);
const F = sandbox.window.Yujournal;
const palette = {
  paper: '#f8f8f2',
  ink: '#263427',
  secondary: '#65745f',
  sage: '#e5eedf',
  leaf: '#43694c',
  clay: '#997760',
  line: '#d8e0cf',
  family: 'mint',
  displayFont: '"Hiragino Sans GB", Arial, sans-serif',
};
test('report uses frozen settlement, actual period boundaries and pagination without cutting details', async () => {
  const rows = Array.from({ length: 61 }, (_, i) => ({
    id: 'report-' + i,
    title: i === 0 ? '股票亏损' : '午饭',
    type: 'expense',
    amount: 2800,
    rate: 9,
    baseAmount: i === 0 ? 100000 : 2800,
    date: '2026-10-13',
    currency: 'CNY',
    source: '金额录入',
  }));
  const data = {
    opening: 1000000,
    openingDate: '2026-10-01',
    transactions: rows,
    wornBadge: 'first',
  };
  const stats = F.statistics(data, '2026-10-13', 'month');
  assert.equal(stats.expense, 268000);
  assert.equal(stats.net, -268000);
  assert.equal(stats.endBalance, 732000);
  assert.equal(stats.startBalance, 1000000);
  const summary = F.drawPoster(data, stats, { palette, includeDetails: false, includeBadge: true });
  assert.equal(summary.pages, 1);
  assert.equal(summary.canvas.width, 1080);
  assert.equal(summary.canvas.height, 1800);
  const first = F.drawPoster(data, stats, {
      palette,
      includeDetails: true,
      includeBadge: false,
      pageIndex: 0,
    }),
    second = F.drawPoster(data, stats, {
      palette,
      includeDetails: true,
      includeBadge: false,
      pageIndex: 1,
    });
  assert.equal(first.pages, 2);
  assert.equal(second.pages, 2);
  assert.equal(first.canvas.height, 6270);
  assert.equal(second.canvas.height, 2022);
  const png = summary.canvas.toBuffer('image/png');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.ok(png.length > 20000);
  const mascot = await loadImage(new URL('../assets/mint-avatar.png', import.meta.url).pathname);
  summary.canvas.getContext('2d').drawImage(mascot, 830, 180, 150, 150);
  const output = new URL('../.artifacts/report-preview.png', import.meta.url);
  await mkdir(new URL('../.artifacts/', import.meta.url), { recursive: true });
  await writeFile(output, summary.canvas.toBuffer('image/png'));
});
test('daily, monthly and annual summaries agree; earlier unknown balances are not fabricated', () => {
  const data = {
    opening: 500000,
    openingDate: '2026-10-01',
    transactions: [
      {
        date: '2026-10-13',
        title: '工资',
        type: 'income',
        amount: 10000,
        rate: 3,
        baseAmount: 72000,
      },
      {
        date: '2026-10-13',
        title: '咖啡',
        type: 'expense',
        amount: 2800,
        rate: 1,
        baseAmount: 2800,
      },
    ],
  };
  assert.equal(F.statistics(data, '2026-10-13', 'day').net, 69200);
  assert.equal(F.statistics(data, '2026-10-13', 'month').net, 69200);
  assert.equal(F.statistics(data, '2026-10-13', 'year').net, 69200);
  const earlier = F.statistics(data, '2026-09-01', 'month');
  assert.equal(earlier.startBalance, null);
  assert.equal(earlier.endBalance, null);
});
