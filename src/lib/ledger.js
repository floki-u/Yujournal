import { assertAmount, CURRENCIES, convertAmount } from './money.js';
import { assertDate, localDate, nextOccurrence, advanceOccurrence, addDays } from './dates.js';

export const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
export const changedAt = (previous) =>
  new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();
export const BADGES = [
  'first',
  'threeDays',
  'sevenDays',
  'thirtyDays',
  'voice',
  'backup',
  'offline',
  'report',
  'goalStart',
  'goalHalf',
  'goalDone',
  'twenty',
];
export const THEMES = {
  classic: null,
  mint: 'first',
  postcard: 'backup',
  starlight: 'thirtyDays',
  pixel: 'report',
};
const text = (s, max = 100) => {
  if (typeof s !== 'string' || !s.trim() || s.length > max) throw Error('名称或备注无效。');
  return s.trim();
};
const identity = (s) => {
  if (typeof s !== 'string' || !/^[\w:.-]{1,160}$/.test(s)) throw Error('数据标识无效。');
  return s;
};
const enumValue = (v, allowed) => {
  if (!allowed.includes(v)) throw Error('数据字段无效。');
  return v;
};
export function createLedger(today = localDate()) {
  return {
    format: 'yuji-ledger',
    schemaVersion: 1,
    amountScale: 100,
    id: id(),
    createdAt: now(),
    updatedAt: now(),
    revision: 0,
    opening: { amount: 0, date: today, configured: false },
    transactions: [],
    goals: [],
    templates: [],
    pending: [],
    decisions: [],
    unlockedBadges: [],
    unlockedThemes: ['classic'],
    wornBadge: null,
    preferences: { theme: 'classic', displayMode: 'system' },
    activity: { offlineRecords: 0, reportExports: 0 },
    lastBackup: null,
  };
}
export const active = (s) => s.transactions.filter((t) => !t.deletedAt);
export const balance = (s) =>
  s.opening.amount +
  active(s).reduce((n, t) => n + (t.type === 'income' ? t.baseAmount : -t.baseAmount), 0);
export const saved = (g) => g.events.reduce((n, e) => n + e.amount, 0);
export const allocated = (s) =>
  s.goals.filter((g) => !g.archivedAt).reduce((n, g) => n + saved(g), 0);
export function award(s) {
  const rows = active(s),
    days = new Set(rows.map((t) => t.date)).size,
    gs = s.goals.map(saved);
  const achieved = {
    first: rows.length >= 1,
    threeDays: days >= 3,
    sevenDays: days >= 7,
    thirtyDays: days >= 30,
    voice: rows.filter((t) => t.source === 'text' || t.source === 'voice').length >= 5,
    backup: !!s.lastBackup,
    offline: s.activity.offlineRecords >= 1,
    report: s.activity.reportExports >= 1,
    goalStart: gs.some((v) => v > 0),
    goalHalf: s.goals.some((g) => saved(g) / g.target >= 0.5),
    goalDone: s.goals.some((g) => saved(g) >= g.target),
    twenty: rows.length >= 20,
  };
  for (const b of BADGES)
    if (achieved[b] && !s.unlockedBadges.includes(b)) s.unlockedBadges.push(b);
  for (const [t, b] of Object.entries(THEMES))
    if ((!b || s.unlockedBadges.includes(b)) && !s.unlockedThemes.includes(t))
      s.unlockedThemes.push(t);
}
export function validateTransaction(t) {
  identity(t.id);
  text(t.title);
  assertDate(t.date);
  enumValue(t.type, ['income', 'expense']);
  enumValue(t.source, ['text', 'voice', 'ocr', 'manual', 'fixed']);
  enumValue(t.currency, Object.keys(CURRENCIES));
  assertAmount(t.amount);
  if (t.currency === 'JPY' && t.amount % 100) throw Error('日元金额必须为整数。');
  assertAmount(t.baseAmount, { zero: true });
  if (!Number.isFinite(t.rate) || t.rate <= 0 || t.rate > 1e6) throw Error('记账汇率无效。');
  if (t.currency === 'CNY' && (t.rate !== 1 || t.amount !== t.baseAmount))
    throw Error('人民币金额不一致。');
  if (t.rateDate) assertDate(t.rateDate);
  if (!['reference', 'settlement', 'CNY'].includes(t.rateSource)) throw Error('汇率来源无效。');
  if (
    t.rateSource === 'reference' &&
    (t.rateDate > t.date || t.baseAmount !== convertAmount(t.amount, t.rate))
  )
    throw Error('外币折算金额或报价日期不一致。');
  if (!Array.isArray(t.attachmentIds) || t.attachmentIds.length > 5)
    throw Error('截图附件字段无效。');
  t.attachmentIds.forEach(identity);
  if (t.rawText && (typeof t.rawText !== 'string' || t.rawText.length > 12000))
    throw Error('识别文字过长。');
  if (typeof t.createdAt !== 'string' || typeof t.updatedAt !== 'string')
    throw Error('记录时间无效。');
  return t;
}
export function validateTemplate(t) {
  identity(t.id);
  text(t.name, 60);
  enumValue(t.type, ['income', 'expense']);
  enumValue(t.currency, Object.keys(CURRENCIES));
  assertAmount(t.amount);
  if (t.currency === 'JPY' && t.amount % 100) throw Error('日元金额必须为整数。');
  enumValue(t.frequency, ['monthly', 'weekly', 'yearly']);
  enumValue(t.mode, ['auto', 'confirm']);
  if (
    !Number.isInteger(t.interval) ||
    t.interval < 1 ||
    t.interval > 12 ||
    !Number.isInteger(t.day) ||
    t.day < 1 ||
    t.day > 31
  )
    throw Error('固定收支周期无效。');
  assertDate(t.startDate);
  if (t.endDate) {
    assertDate(t.endDate);
    if (t.endDate < t.startDate) throw Error('结束日期早于开始日期。');
  }
  assertDate(t.nextDate);
  if (typeof t.paused !== 'boolean') throw Error('模板状态无效。');
  return t;
}
function uniqueRows(rows, check) {
  if (!Array.isArray(rows) || rows.length > 100000) throw Error('备份条目数量无效。');
  const keys = new Set();
  for (const r of rows) {
    check(r);
    if (keys.has(r.id)) throw Error('备份包含重复标识。');
    keys.add(r.id);
  }
}
export function validateLedger(s) {
  if (!s || s.format !== 'yuji-ledger' || s.schemaVersion !== 1 || s.amountScale !== 100)
    throw Error('不是当前版本的余记完整备份。');
  identity(s.id);
  if (!Number.isSafeInteger(s.revision) || s.revision < 0) throw Error('数据版本无效。');
  assertAmount(s.opening?.amount, { zero: true });
  assertDate(s.opening.date);
  uniqueRows(s.transactions, validateTransaction);
  uniqueRows(s.templates, validateTemplate);
  uniqueRows(s.goals, (g) => {
    identity(g.id);
    text(g.name, 60);
    assertAmount(g.target);
    assertDate(g.date);
    uniqueRows(g.events, (e) => {
      identity(e.id);
      assertAmount(Math.abs(e.amount));
      assertDate(e.date);
    });
    if (saved(g) < 0) throw Error('计划留存余额无效。');
  });
  uniqueRows(s.pending, (p) => {
    identity(p.id);
    assertDate(p.dueDate);
    validateTemplate(p.snapshot);
    if (p.id !== `fixed:${p.snapshot.id}:${p.dueDate}`) throw Error('待确认账单标识不一致。');
  });
  if (
    !Array.isArray(s.decisions) ||
    s.decisions.length > 100000 ||
    s.decisions.some((d) => typeof d !== 'string' || d.length > 160)
  )
    throw Error('周期账单记录无效。');
  if (
    !Array.isArray(s.unlockedBadges) ||
    s.unlockedBadges.some((b) => !BADGES.includes(b)) ||
    !Array.isArray(s.unlockedThemes) ||
    s.unlockedThemes.some((t) => !(t in THEMES))
  )
    throw Error('解锁记录无效。');
  if (s.wornBadge && !s.unlockedBadges.includes(s.wornBadge)) throw Error('佩戴徽章尚未解锁。');
  enumValue(s.preferences?.theme, Object.keys(THEMES));
  enumValue(s.preferences.displayMode, ['light', 'dark', 'system']);
  if (!s.unlockedThemes.includes(s.preferences.theme)) throw Error('使用的主题尚未解锁。');
  if (
    !s.activity ||
    !['offlineRecords', 'reportExports'].every(
      (k) => Number.isSafeInteger(s.activity[k]) && s.activity[k] >= 0,
    )
  )
    throw Error('活动统计无效。');
  if (!Number.isSafeInteger(balance(s))) throw Error('累计资产超出有效范围。');
  return s;
}
export function transaction(input, today = localDate()) {
  assertDate(input.date);
  if (input.date > today) throw Error('尚未发生的收支请使用固定模板。');
  const rateSource =
    input.currency === 'CNY' ? 'CNY' : input.settlement != null ? 'settlement' : 'reference';
  const rate =
    rateSource === 'CNY'
      ? 1
      : rateSource === 'settlement'
        ? input.settlement / input.amount
        : input.rate;
  if (rateSource === 'reference' && (!input.rateDate || input.rateDate > input.date))
    throw Error('请获取记账日期的参考汇率，或填写实际人民币结算。');
  return validateTransaction({
    id: input.occurrenceId || id(),
    title: text(input.title),
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    rate,
    baseAmount:
      rateSource === 'settlement'
        ? assertAmount(input.settlement)
        : convertAmount(input.amount, rate),
    rateDate: rateSource === 'reference' ? input.rateDate : input.date,
    rateSource,
    date: input.date,
    source: input.source || 'manual',
    icon: input.icon || 'book',
    rawText: input.rawText || '',
    attachmentIds: input.attachmentIds || [],
    createdAt: now(),
    updatedAt: now(),
    ...(input.occurrenceId ? { occurrenceId: input.occurrenceId } : {}),
  });
}
export function addTransaction(s, t, { offline = false } = {}) {
  validateTransaction(t);
  if (s.transactions.some((x) => x.id === t.id)) throw Error('这笔记录已存在。');
  if (t.occurrenceId && s.transactions.some((x) => x.occurrenceId === t.occurrenceId))
    throw Error('这期账单已经入账。');
  s.transactions.push(t);
  if (offline) s.activity.offlineRecords++;
  award(s);
}
export function editTransaction(s, id, expected, input, today = localDate()) {
  const t = s.transactions.find((t) => t.id === id);
  if (!t || t.deletedAt || t.updatedAt !== expected)
    throw Error('记录已被其他窗口修改，请重新打开。');
  const replacement = transaction(
    {
      ...input,
      source: t.source,
      rawText: t.rawText,
      attachmentIds: t.attachmentIds,
      occurrenceId: t.occurrenceId,
    },
    today,
  );
  Object.assign(t, replacement, {
    id: t.id,
    createdAt: t.createdAt,
    updatedAt: changedAt(t.updatedAt),
  });
  award(s);
}
export function deleteTransaction(s, id, expected) {
  const t = s.transactions.find((t) => t.id === id);
  if (!t || t.deletedAt || t.updatedAt !== expected) throw Error('记录状态已变化，请重新打开。');
  t.deletedAt = now();
  t.updatedAt = changedAt(t.updatedAt);
}
export function restoreTransaction(s, id) {
  const t = s.transactions.find((t) => t.id === id);
  if (!t?.deletedAt) throw Error('没有可撤销的删除。');
  delete t.deletedAt;
  t.updatedAt = changedAt(t.updatedAt);
}
export function allocateGoal(s, id, amount) {
  const g = s.goals.find((g) => g.id === id && !g.archivedAt);
  if (!g) throw Error('计划已不存在。');
  assertAmount(Math.abs(amount));
  if (amount > 0 && amount > Math.max(0, balance(s) - allocated(s)))
    throw Error('可分配的资产不足。');
  if (amount < 0 && -amount > saved(g)) throw Error('取回金额超过已留存金额。');
  g.events.push({ id: crypto.randomUUID(), amount, date: localDate(), createdAt: now() });
  g.updatedAt = changedAt(g.updatedAt);
  award(s);
}
export function archiveGoal(s, id) {
  const g = s.goals.find((g) => g.id === id && !g.archivedAt);
  if (!g) throw Error('计划已归档。');
  const value = saved(g);
  if (value)
    g.events.push({ id: crypto.randomUUID(), amount: -value, date: localDate(), createdAt: now() });
  g.archivedAt = now();
  g.updatedAt = changedAt(g.updatedAt);
}
export function restoreGoal(s, id) {
  const g = s.goals.find((g) => g.id === id && g.archivedAt);
  if (!g) throw Error('计划未归档。');
  delete g.archivedAt;
  g.updatedAt = changedAt(g.updatedAt);
}
export function saveTemplate(s, input, today = localDate()) {
  const existing = s.templates.find((t) => t.id === input.id);
  if (existing && input.expected !== existing.updatedAt) throw Error('模板已被其他窗口修改。');
  const t = {
    ...input,
    id: existing?.id || id(),
    interval: Number(input.interval) || 1,
    day: Number(input.day),
    paused: !!input.paused,
    createdAt: existing?.createdAt || now(),
    updatedAt: changedAt(existing?.updatedAt),
  };
  delete t.expected;
  t.nextDate = nextOccurrence(
    t,
    existing ? [addDays(today, 1), existing.nextDate, t.startDate].sort().at(-1) : t.startDate,
  );
  validateTemplate(t);
  if (existing) Object.assign(existing, t);
  else s.templates.push(t);
}
export function catchUp(s, today = localDate(), quotes = {}) {
  let count = 0;
  const decided = new Set([
    ...s.decisions,
    ...s.pending.map((p) => p.id),
    ...s.transactions.map((t) => t.occurrenceId).filter(Boolean),
  ]);
  for (const template of s.templates) {
    if (template.paused) continue;
    while (
      template.nextDate <= today &&
      (!template.endDate || template.nextDate <= template.endDate) &&
      count < 1000
    ) {
      const dueDate = template.nextDate,
        key = `fixed:${template.id}:${dueDate}`;
      if (!decided.has(key)) {
        const quote = quotes[`${template.currency}:${dueDate}`];
        if (template.mode === 'auto' && (template.currency === 'CNY' || quote)) {
          const t = transaction(
            {
              title: template.name,
              type: template.type,
              amount: template.amount,
              currency: template.currency,
              date: dueDate,
              source: 'fixed',
              icon: 'repeat',
              occurrenceId: key,
              ...quote,
            },
            today,
          );
          addTransaction(s, t);
          s.decisions.push(key);
        } else
          s.pending.push({
            id: key,
            templateId: template.id,
            dueDate,
            snapshot: structuredClone(template),
          });
        decided.add(key);
        count++;
      }
      template.nextDate = advanceOccurrence(template, template.nextDate);
    }
  }
  return {
    count,
    more: s.templates.some(
      (t) => !t.paused && t.nextDate <= today && (!t.endDate || t.nextDate <= t.endDate),
    ),
  };
}
export function resolvePending(s, key, t = null) {
  const p = s.pending.find((p) => p.id === key);
  if (!p) throw Error('这期账单已经处理。');
  if (t) {
    t.occurrenceId = key;
    t.id = key;
    addTransaction(s, t);
  }
  s.decisions.push(key);
  s.pending = s.pending.filter((p) => p.id !== key);
}
export function mergeLedger(local, incoming, prefer = 'local') {
  validateLedger(incoming);
  const out = structuredClone(local);
  for (const key of ['transactions', 'templates', 'goals', 'pending']) {
    const map = new Map(out[key].map((x) => [x.id, x]));
    for (const x of incoming[key])
      if (!map.has(x.id) || prefer === 'imported') map.set(x.id, structuredClone(x));
    out[key] = [...map.values()];
  }
  out.decisions = [...new Set([...out.decisions, ...incoming.decisions])];
  const handled = new Set([
    ...out.decisions,
    ...out.transactions.map((t) => t.occurrenceId).filter(Boolean),
  ]);
  out.pending = out.pending.filter((p) => !handled.has(p.id));
  if (prefer === 'imported') {
    out.opening = structuredClone(incoming.opening);
    out.preferences = structuredClone(incoming.preferences);
    out.wornBadge = incoming.wornBadge;
  }
  out.unlockedBadges = [...new Set([...out.unlockedBadges, ...incoming.unlockedBadges])];
  out.unlockedThemes = [...new Set([...out.unlockedThemes, ...incoming.unlockedThemes])];
  out.lastBackup = [out.lastBackup, incoming.lastBackup].filter(Boolean).sort().at(-1) || null;
  for (const key of ['offlineRecords', 'reportExports'])
    out.activity[key] = Math.max(out.activity[key], incoming.activity[key]);
  award(out);
  return validateLedger(out);
}
export function importSummary(local, incoming) {
  const counts = {};
  let conflicts = 0;
  for (const key of ['transactions', 'goals', 'templates', 'pending']) {
    const map = new Map(local[key].map((x) => [x.id, x]));
    counts[key] = incoming[key].filter((x) => !map.has(x.id)).length;
    conflicts += incoming[key].filter(
      (x) => map.has(x.id) && JSON.stringify(map.get(x.id)) !== JSON.stringify(x),
    ).length;
  }
  return { ...counts, conflicts };
}
