import * as L from './lib/ledger.js';
import * as DB from './lib/database.js';
import { money, parseAmount, CURRENCIES, originalMoney, convertAmount } from './lib/money.js';
import { localDate, addDays, monthDay, advanceOccurrence } from './lib/dates.js';
import { parseEntry } from './lib/parser.js';
import { exportBackup, importBackup, backupEncrypted, sha } from './lib/backup.js';
import { reference, latestRates } from './lib/exchange.js';
import { recognize, releaseOCR, shrinkImage, prepareOCR, ocrReady, OCR_CACHE } from './lib/ocr.js';
import { paths } from './icons.js';
const F = window.Yujournal,
  V = window.YujournalViews,
  T = window.YujournalThemes;
for (const theme of F.themes) Object.assign(theme, T.worlds[theme.id]);
F.badgeById('backup').reward = '风物来信主题';
F.badgeById('thirtyDays').reward = '月海玻璃主题';
F.badgeById('report').reward = '像素冒险主题';
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const icon = (n) =>
  T.icon(n, `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[n] || paths.book}</svg>`);
const amount = (n, cls = '') =>
  `<div class="amount ${cls}"><span class="currency">¥</span>${money(n).split('.')[0]}<span class="decimals">.${money(n).split('.')[1]}</span></div>`;
const sources = {
  manual: '金额录入',
  text: '一句话',
  voice: '语音听写',
  ocr: '截图识别',
  fixed: '固定收支',
};
const content = document.querySelector('#content'),
  nav = document.querySelector('#navigation'),
  sheet = document.querySelector('#sheet');
let state,
  data,
  screen = 'home',
  selectedDay = localDate(),
  periodDate = localDate(),
  period = 'month',
  dailyFilter = 'all',
  filter = 'all',
  query = '',
  badgeFilter = 'all',
  previewTheme = null,
  ledgerLimit = 50,
  includeDetails = false,
  includeBadge = true,
  posterIndex = 0,
  posterCanvas = null,
  posterBlob = null,
  posterPages = 1,
  fxInfo = null,
  cal = {},
  busy = false,
  entry = null,
  quote = null,
  quoteSequence = 0,
  imported = null,
  importRevision = null,
  importFile = null,
  urls = [],
  undoId = null,
  returnScreen = 'home',
  ocrSequence = 0;
function bridge() {
  const rows = L.active(state);
  const first = [state.opening.date, ...rows.map((t) => t.date)].sort()[0];
  data = {
    ...state,
    opening: state.opening.amount,
    openingDate: first,
    transactions: rows.map((t) => ({ ...t, source: sources[t.source] })),
    goals: state.goals
      .filter((g) => !g.archivedAt)
      .map((g) => ({ ...g, saved: L.saved(g), icon: 'leaf' })),
    theme: state.preferences.theme,
    displayMode: state.preferences.displayMode,
    offlineRecords: state.activity.offlineRecords,
    reportExports: state.activity.reportExports,
    fxInfo,
  };
}
function toast(message, undo = false) {
  const el = document.querySelector('#toast');
  el.innerHTML = `${esc(message)}${undo ? '<button class="toast-action" data-action="undoDelete">撤销删除</button>' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), undo ? 12000 : 5000);
}
function error(e) {
  const message = typeof e === 'string' ? e : e.message;
  const el = document.querySelector('#entry-error');
  if (el) {
    el.hidden = false;
    el.textContent = message;
  } else toast(message);
}
function revoke() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
}
function close() {
  ocrSequence++;
  quoteSequence++;
  releaseOCR();
  revoke();
  sheet.close();
  entry = null;
  imported = null;
  importFile = null;
}
function openSheet(html, title) {
  document.querySelector('#sheet-content').innerHTML =
    `<div class="sheet-handle"></div><div class="sheet-inner"><div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-button" data-action="close" aria-label="关闭">${icon('close')}</button></div>${html}<div id="entry-error" class="error" role="alert" hidden></div></div>`;
  if (!sheet.open) sheet.showModal();
}
const field = (label, name, value = '', type = 'text', extra = '') =>
  `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label, name, options, value) =>
  `<label class="field"><span>${label}</span><select name="${name}">${options.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
const submit = (label) =>
  `<button class="primary" type="submit">${icon('check')} ${label}</button>`;
const settingsRow = (ic, title, subtitle, act) =>
  `<button class="settings-row" data-action="${act}">${icon(ic)}<div><strong>${esc(title)}</strong><p>${esc(subtitle)}</p></div>${icon('arrow')}</button>`;
function head(title = '余记', back = false) {
  const worn = F.badgeById(state.wornBadge);
  return `<header class="page-head"><${back ? 'button' : 'div'} class="${back ? 'icon-button' : 'brand v3-brand'}" ${back ? 'data-action="back" aria-label="返回"' : ''}>${back ? icon('left') : icon('book') + esc(title)}</${back ? 'button' : 'div'}>${back ? `<span class="eyebrow">${esc(title)}</span>` : ''}<div class="head-right">${screen === 'home' ? `<button class="calendar-trigger" data-action="calendar" data-context="home" aria-label="打开日期日历">${icon('clock')}${selectedDay.slice(5).replace('-', ' 月 ')} 日 ${icon('down')}</button>` : ''}<button class="icon-button" data-action="settings" aria-label="我的与设置">${T.avatar(icon('user'))}${worn ? icon(worn.icon).replace('<svg ', '<svg class="worn-mini" ') : ''}</button></div></header>`;
}
const row = (t) =>
  `<button class="txn-row" data-action="detail" data-id="${esc(t.id)}"><span class="txn-icon">${icon(t.icon)}</span><span class="txn-info"><strong>${esc(t.title)}</strong><span>${esc(t.source)} · ${t.date === localDate() ? '今天' : t.date}</span></span><span class="txn-money ${t.type === 'income' ? 'positive' : ''}">${t.type === 'income' ? '+' : '−'}${money(t.baseAmount)}${t.currency !== 'CNY' ? `<small>${originalMoney(t.amount, t.currency)} ${t.currency}</small>` : ''}</span></button>`;
function context() {
  return {
    head,
    data,
    selectedDay,
    periodDate,
    period,
    dailyFilter,
    filter,
    query,
    badgeFilter,
    previewTheme,
    includeDetails,
    includeBadge,
    ledgerLimit,
    theme: previewTheme || data.theme,
    icon,
    esc,
    amount,
    transactionRow: row,
    settingsRow,
    balance: () => L.balance(state),
  };
}
function assets() {
  const totals = (type) =>
    data.transactions.filter((t) => t.type === type).reduce((n, t) => n + t.baseAmount, 0);
  return `${head('我的资产', true)}<div class="page-intro"><h1 class="page-title">每一笔，都有着落。</h1><p class="subline">一个总余额，简单记清收支。</p></div><section class="asset-summary"><p class="eyebrow">已记录资产余额 · CNY</p>${amount(L.balance(state), 'money-large')}<span class="pill">${icon('shield')} 只保存在本机</span></section><div class="detail-line"><span>整个账本的期初资产</span><button class="text-button" data-action="opening">¥ ${money(state.opening.amount)} ${icon('edit')}</button></div><div class="detail-line"><span>累计收入</span><strong class="positive">+ ¥ ${money(totals('income'))}</strong></div><div class="detail-line"><span>累计支出</span><strong>− ¥ ${money(totals('expense'))}</strong></div><div class="formula">余额 = 期初资产 + 累计收入 − 累计支出。<br>股票亏损按普通支出计算。计划留存属于现有资产，不会再扣一次。<br>这个余额仅体现你已记录的收支。</div><button class="secondary" style="width:100%" data-action="goals">查看存钱计划</button>`;
}
function goalCard(g) {
  const value = L.saved(g),
    percent = Math.min(100, Math.round((value / g.target) * 100));
  return `<div class="goal-card"><div class="goal-header"><span class="goal-symbol">${icon('leaf')}</span><div><h3>${esc(g.name)}</h3><p>${g.date} · 给未来留一点</p></div><strong class="goal-percent">${percent}<small>%</small></strong></div><div class="progress-track"><span style="width:${percent}%"></span></div><div class="goal-bottom"><span>已留存 <strong>¥ ${money(value)}</strong></span><span>目标 ¥ ${money(g.target)}</span></div></div>`;
}
function goals() {
  const gs = state.goals.filter((g) => !g.archivedAt);
  return `${head('存钱计划')}<div class="page-intro"><h1 class="page-title">为想要的生活，留一点。</h1><p class="subline">计划中的钱，也是现有资产的一部分。</p></div>${gs.map((g) => `<section class="goal-page-card">${goalCard(g)}<div class="button-row"><button class="primary" data-action="allocate" data-id="${g.id}">留存 / 取回</button><button class="secondary" data-action="goalDetail" data-id="${g.id}">查看计划</button></div></section>`).join('') || '<div class="empty"><p>旅行、储备、一个小心愿。<br>从第一个计划开始。</p></div>'}<button class="secondary" style="width:100%;margin-top:20px" data-action="newGoal">${icon('plus')} 新建计划</button><p class="allocated-info">已留存 ¥ ${money(L.allocated(state))}<br>可分配 ¥ ${money(Math.max(0, L.balance(state) - L.allocated(state)))}<br>留存不计入消费，也不改变资产总额。</p>${
    state.goals.some((g) => g.archivedAt)
      ? `<details class="helper"><summary>已归档计划</summary>${state.goals
          .filter((g) => g.archivedAt)
          .map(
            (g) =>
              `<div class="detail-line"><span>${esc(g.name)}</span><button class="text-button" data-action="restoreGoal" data-id="${g.id}">恢复计划</button></div>`,
          )
          .join('')}</details>`
      : ''
  }`;
}
function recurring() {
  return `${head('固定收支', true)}<h1 class="page-title">每个月，少记几次。</h1><p class="subline">下次打开时处理到期账单，离线也可入账。</p>${
    state.pending.length
      ? `<div class="section-head"><h2>待你确认 <span class="pending-count">${state.pending.length}</span></h2></div>${state.pending
          .slice(0, 50)
          .map(
            (p) =>
              `<section class="template"><div class="template-top"><div><h3>${esc(p.snapshot.name)}</h3><p class="caption">${p.dueDate} · ${p.snapshot.type === 'income' ? '收入' : '支出'}</p></div><strong>${originalMoney(p.snapshot.amount, p.snapshot.currency)} ${p.snapshot.currency}</strong></div><div class="receipt-actions"><button class="secondary" data-action="pendingBook" data-id="${esc(p.id)}">确认入账</button><button class="text-button" data-action="pendingSkip" data-id="${esc(p.id)}">跳过本期</button></div></section>`,
          )
          .join(
            '',
          )}${state.pending.length > 50 ? '<p class="helper">先处理这 50 项，余下账单会继续显示。</p>' : ''}`
      : ''
  }<div class="section-head"><h2>周期模板</h2></div>${state.templates.map((t) => `<section class="template"><div class="template-top"><span class="txn-icon">${icon('repeat')}</span><div><h3>${esc(t.name)}</h3><p class="caption">${{ monthly: '每月', weekly: '每周', yearly: '每年' }[t.frequency]}${t.interval > 1 ? ' × ' + t.interval : ''} · ${t.type === 'income' ? '收入' : '支出'}</p></div><strong>${originalMoney(t.amount, t.currency)} ${t.currency}</strong></div><div class="template-bottom"><span>${t.paused ? '已暂停' : t.endDate && t.nextDate > t.endDate ? '已结束' : '下次 ' + t.nextDate} · ${t.mode === 'auto' ? '直接入账' : '待确认'}</span><button class="text-button" data-action="editTemplate" data-id="${t.id}">设置 ${icon('edit')}</button></div></section>`).join('') || '<div class="empty"><p>把房租、话费、工资交给模板。</p></div>'}<button class="secondary" style="width:100%;margin-top:20px" data-action="newTemplate">${icon('plus')} 新建固定收支</button><p class="helper">月末日期自动取该月最后一天。应用关闭期间不会运行后台定时任务；打开后补记。缺少有效外币汇率时转为待确认。编辑只影响未来账单。</p>`;
}
function render() {
  if (!state) return;
  bridge();
  T.apply(
    previewTheme || data.theme,
    data.displayMode === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : data.displayMode,
  );
  const c = context(),
    views = {
      home: () => V.home(c),
      ledger: () => V.ledger(c),
      settings: () => V.my(c),
      themes: () => V.themesPage(c),
      badges: () => V.badgesPage(c),
      report: () => V.report(c),
      poster: () => V.poster(c),
      assets,
      goals,
      recurring,
    };
  const banner = previewTheme
    ? `<div class="preview-banner"><span>正在预览：${F.themeById(previewTheme).name}</span><button data-action="stopPreview">退出预览</button></div>`
    : '';
  content.innerHTML =
    banner +
    (!navigator.onLine
      ? `<div class="offline-banner">${icon('cloudOff')} 当前离线 · 本机账目可照常保存</div>`
      : '') +
    (views[screen] || views.home)();
  if (
    screen === 'home' &&
    !data.transactions.length &&
    !matchMedia('(display-mode: standalone)').matches &&
    !navigator.standalone
  )
    content.insertAdjacentHTML(
      'beforeend',
      `<button class="mini-notice" data-action="install">${icon('phone')}<div><strong>先安装到主屏幕，再开始正式记账</strong><p>固定入口方便离线打开和长期保管账目</p></div>${icon('arrow')}</button>`,
    );
  if (screen === 'home' && state.pending.length)
    content.insertAdjacentHTML(
      'beforeend',
      `<button class="mini-notice" data-action="recurring">${icon('repeat')}<div><strong>${state.pending.length} 项固定收支待确认</strong><p>打开后补记的账单都在这里</p></div>${icon('arrow')}</button>`,
    );
  if (screen === 'home') {
    const previous = new Date(localDate() + 'T12:00:00');
    previous.setDate(0);
    const prefix = localDate(previous).slice(0, 7);
    if (data.transactions.some((t) => t.date.startsWith(prefix)))
      content.insertAdjacentHTML(
        'beforeend',
        `<button class="mini-notice" data-action="lastReport" data-date="${localDate(previous)}">${icon('chart')}<div><strong>${prefix} 的报告准备好了</strong><p>看看上个月，也可以保存成长图</p></div>${icon('arrow')}</button>`,
      );
  }
  const selected = ['report', 'assets', 'poster'].includes(screen)
    ? 'ledger'
    : ['badges', 'themes', 'recurring'].includes(screen)
      ? 'settings'
      : screen;
  nav.hidden = screen === 'poster';
  nav.innerHTML = [
    ['home', 'home', '今天'],
    ['ledger', 'book', '账本'],
    ['goals', 'leaf', '计划'],
    ['settings', 'user', '我的'],
  ]
    .map(
      ([name, ic, label], i) =>
        `${i === 2 ? `<button class="nav-add" data-action="record" aria-label="记一笔">${icon('plus')}</button>` : ''}<button data-action="${name}" ${selected === name ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`,
    )
    .join('');
  if (screen === 'poster') renderPoster();
}
function go(name) {
  close();
  if (posterCanvas) {
    posterCanvas.width = posterCanvas.height = 0;
    posterCanvas = null;
    posterBlob = null;
  }
  if (!['home', 'ledger', 'goals', 'settings'].includes(name) && screen !== name)
    returnScreen = screen;
  screen = name;
  render();
  window.scrollTo(0, 0);
}
async function commit(action, options = {}) {
  const badges = state.unlockedBadges.length;
  state = await DB.mutate(action, options);
  render();
  if (state.unlockedBadges.length > badges) toast('获得新徽章，去徽章中心看看。');
  return state;
}
function entryStart(mode = 'text', value = '') {
  revoke();
  quote = null;
  entry = { mode, raw: value, file: null, parsed: null, editing: null, pending: null };
  entryUI();
}
function tabs() {
  return `<div class="entry-tabs">${[
    ['text', '一句话'],
    ['ocr', '截图'],
    ['manual', '金额'],
  ]
    .map(
      ([v, l]) =>
        `<button data-action="entryMode" data-value="${v}" class="${entry.mode === v ? 'active' : ''}">${l}</button>`,
    )
    .join('')}</div>`;
}
function entryUI() {
  if (entry.mode === 'manual' || entry.parsed) {
    const p = entry.parsed || {
      date: selectedDay,
      currency: 'CNY',
      type: 'expense',
      title: '',
      amount: null,
    };
    const opts = Object.entries(CURRENCIES).map(([code, c]) => [code, code + ' · ' + c.name]);
    openSheet(
      `${tabs()}<form id="entry-form" class="confirm-grid">${entry.pending ? '<p class="helper">这是到期账单的确认副本，模板不会改变。</p>' : ''}${field('备注', 'title', p.title, 'text', 'required maxlength="100"')}<div class="field-grid">${select(
        '收支方向',
        'type',
        [
          ['expense', '支出'],
          ['income', '收入'],
        ],
        p.type,
      )}${select('币种', 'currency', opts, p.currency)}</div>${
        p.ambiguous
          ? select(
              '检测到多个金额，请选一个',
              'candidate',
              p.candidates.map((c) => [String(c.amount), c.label]),
              '',
            )
          : ''
      }${field('金额', 'amount', p.amount == null ? '' : p.amount / 100, 'text', 'required inputmode="decimal"')}${field('记账日期', 'date', p.date, 'date', `required max="${localDate()}"`)}<div id="quote-status" class="helper"></div><div id="settlement-field" ${p.currency === 'CNY' ? 'hidden' : ''}>${field('实际人民币结算（可选，覆盖参考价）', 'settlement', p.rateSource === 'settlement' ? p.baseAmount / 100 : '', 'text', 'inputmode="decimal" placeholder="外币银行卡实际扣款 / 到账金额"')}</div>${entry.file ? '<label class="toggle-row"><span>保留这张压缩截图到本机备份</span><input type="checkbox" name="retain"></label>' : ''}${submit(entry.editing ? '确认修改' : '确认并保存')}<p class="confirm-copy">确认后更新所选日期收支和资产余额。股票亏损计入支出。</p></form>`,
      '确认这一笔',
    );
    refreshQuote();
    return;
  }
  openSheet(
    `${tabs()}${entry.mode === 'ocr' ? `<button class="upload-area" data-action="uploadPhoto">${icon('photo')}<span>选择付款截图</span><small>微信 · 支付宝 · 银行付款凭证</small></button><input id="photo-input" type="file" accept="image/png,image/jpeg,image/webp" hidden><p class="helper">首次准备约 7.5 MiB 本机识别资源，完成后可离线使用。截图不会上传；保存附件由你选择。过长截图请先裁剪付款区域。</p><div id="ocr-progress" class="progress-status" hidden></div>` : '<p class="helper">点输入框，用 iPhone 键盘麦克风听写。这里在本机整理金额和日期。</p>'}<textarea id="entry-text" class="entry-text" aria-label="一句话记账" placeholder="今天股票亏了 1000 元">${esc(entry.raw)}</textarea><p class="helper">也可以粘贴截图文字。一句话中有多个金额时，需要你选择。</p><button class="primary" data-action="parseEntry">${icon('spark')} 整理成账目</button>`,
    '记一笔',
  );
}
async function refreshQuote() {
  const form = document.querySelector('#entry-form');
  if (!form) return;
  const seq = ++quoteSequence,
    currency = form.elements.currency.value,
    date = form.elements.date.value,
    node = document.querySelector('#quote-status');
  quote = null;
  document.querySelector('#settlement-field').hidden = currency === 'CNY';
  if (currency === 'CNY') {
    node.textContent = '按人民币原额入账。';
    return;
  }
  node.textContent = '正在获取记账日期的参考汇率…';
  try {
    const p = entry.parsed;
    if (p && p.currency === currency && p.date === date && p.rateSource === 'reference')
      quote = { rate: p.rate, rateDate: p.rateDate };
    else quote = await reference(currency, date);
    if (seq !== quoteSequence) return;
    quoteText();
  } catch (e) {
    if (seq === quoteSequence) {
      quote = null;
      node.textContent = e.message;
    }
  }
}
function quoteText() {
  const form = document.querySelector('#entry-form'),
    node = document.querySelector('#quote-status');
  if (!form || !node) return;
  if (form.elements.currency.value === 'CNY') return;
  let amount = 0;
  try {
    amount = parseAmount(form.elements.amount.value, form.elements.currency.value);
  } catch {}
  node.textContent = quote
    ? `1 ${form.elements.currency.value} = ¥ ${quote.rate} · 报价 ${quote.rateDate}${amount ? ' · 折合 ¥ ' + money(convertAmount(amount, quote.rate)) : ''}（记账后冻结）`
    : '暂无该日期参考价，联网更新或填写实际结算。';
}
async function entrySave(form) {
  const v = Object.fromEntries(new FormData(form)),
    p = entry.parsed || {},
    currency = v.currency,
    amt = parseAmount(v.amount, currency);
  const settlement =
    currency !== 'CNY' && v.settlement.trim() ? parseAmount(v.settlement) : undefined;
  if (currency !== 'CNY' && settlement === undefined && !quote)
    throw Error('参考汇率尚未取得，请等待或填写实际人民币结算。');
  const attachments = [];
  if (entry.file && v.retain) {
    const blob = await shrinkImage(entry.file, { max: 1600, pixels: 3000000 });
    if (blob.size > 2 * 1024 * 1024) throw Error('压缩截图仍过大，请裁剪后重试。');
    attachments.push({ id: L.id(), blob });
  }
  const input = {
    title: v.title,
    type: v.type,
    currency,
    amount: amt,
    date: v.date,
    settlement,
    ...quote,
    source: entry.pending
      ? 'fixed'
      : entry.mode === 'ocr'
        ? 'ocr'
        : entry.mode === 'manual'
          ? 'manual'
          : 'text',
    rawText: entry.raw || p.rawText || '',
    icon: p.icon || 'book',
    attachmentIds: entry.editing ? p.attachmentIds : attachments.map((a) => a.id),
  };
  const editing = entry.editing,
    pending = entry.pending;
  const t = editing ? null : L.transaction(input);
  await commit(
    (s) => {
      if (editing) L.editTransaction(s, editing, p.updatedAt, input);
      else if (pending) L.resolvePending(s, pending, t);
      else L.addTransaction(s, t, { offline: !navigator.onLine });
    },
    { attachments },
  );
  selectedDay = v.date;
  close();
  go('home');
  T.feedback('saved');
  toast('已保存到本机。');
}
async function photo(file) {
  if (!entry) return;
  const seq = ++ocrSequence,
    status = document.querySelector('#ocr-progress');
  status.hidden = false;
  status.textContent = '正在压缩截图…';
  document.querySelector('[data-action=parseEntry]').disabled = true;
  try {
    const image = await shrinkImage(file);
    if (seq !== ocrSequence) return;
    entry.file = image;
    const text = await recognize(image, (message) => {
      if (seq === ocrSequence && status.isConnected) status.textContent = message;
    });
    if (seq !== ocrSequence) return;
    entry.raw = text;
    document.querySelector('#entry-text').value = text;
    status.textContent = '识别完成，请核对文字后整理。';
    try {
      entry.parsed = parseEntry(text, { source: 'ocr' });
      entryUI();
    } catch (e) {
      error(e);
    }
  } catch (e) {
    if (seq === ocrSequence) error(e);
  } finally {
    const b = document.querySelector('[data-action=parseEntry]');
    if (b) b.disabled = false;
  }
}
async function detail(id) {
  const t = state.transactions.find((t) => t.id === id && !t.deletedAt);
  if (!t) return;
  openSheet(
    `<div class="report-number"><p class="eyebrow">${t.type === 'income' ? '收入' : '支出'}</p>${amount(t.baseAmount, 'money-large')}</div><div class="detail-line"><span>备注</span><strong>${esc(t.title)}</strong></div><div class="detail-line"><span>日期</span><strong>${t.date}</strong></div><div class="detail-line"><span>来源</span><strong>${sources[t.source]}</strong></div><div class="detail-line"><span>原币金额</span><strong>${originalMoney(t.amount, t.currency)} ${t.currency}</strong></div>${t.currency === 'CNY' ? '' : `<p class="helper">${t.rateSource === 'settlement' ? '采用实际人民币结算' : '参考汇率 ' + t.rate + ' · ' + t.rateDate}，后续刷新汇率不会改动这笔金额。</p>`}${t.rawText ? `<details class="helper"><summary>原始识别文字</summary><p class="long-text">${esc(t.rawText)}</p></details>` : ''}<div id="attachment-view"></div><div class="button-row"><button class="secondary" data-action="editTxn" data-id="${t.id}">修改这一笔</button><button class="text-button danger" data-action="deleteReview" data-id="${t.id}">删除</button></div>`,
    '账目详情',
  );
  const panel = document.querySelector('#attachment-view');
  for (const id of t.attachmentIds) {
    const a = await DB.getAttachment(id);
    if (!a || !panel.isConnected) continue;
    const url = URL.createObjectURL(a.blob);
    urls.push(url);
    panel.insertAdjacentHTML(
      'beforeend',
      `<img class="attachment-img" src="${url}" alt="本机保存的付款截图">`,
    );
  }
}
function opening() {
  openSheet(
    `<p class="helper">这是整个账本记录开始前的资产总额。期初资产不算收入；其后每笔收支都会累加。</p><form id="opening-form">${field('期初资产 · CNY', 'amount', state.opening.amount / 100, 'text', 'required inputmode="decimal"')}${submit('保存期初资产')}</form>`,
    '设置期初资产',
  );
}
function goalForm(id) {
  const g = state.goals.find((g) => g.id === id);
  openSheet(
    `<form id="goal-form" data-id="${g?.id || ''}" data-expected="${g?.updatedAt || ''}">${field('计划名称', 'name', g?.name || '', 'text', 'required maxlength="60"')}${field('目标金额 · CNY', 'target', g ? g.target / 100 : '', 'text', 'required inputmode="decimal"')}${field('目标日期', 'date', g?.date || addDays(localDate(), 180), 'date', 'required')}${submit(g ? '保存计划' : '创建计划')}</form>`,
    '存钱计划',
  );
}
function allocate(id) {
  const g = state.goals.find((g) => g.id === id);
  openSheet(
    `${goalCard(g)}<form id="allocate-form" data-id="${id}">${select(
      '方向',
      'direction',
      [
        ['add', '留存到计划'],
        ['withdraw', '取回到可分配资产'],
      ],
      'add',
    )}${field('金额 · CNY', 'amount', '', 'text', 'required inputmode="decimal"')}${submit('确认')}<p class="helper">取回和留存都不会产生收支记录。</p></form>`,
    '留存 / 取回',
  );
}
function goalDetail(id) {
  const g = state.goals.find((g) => g.id === id);
  openSheet(
    `${goalCard(g)}<div class="receipt-actions"><button class="secondary" data-action="allocate" data-id="${id}">留存 / 取回</button><button class="secondary" data-action="editGoal" data-id="${id}">编辑</button><button class="text-button" data-action="archiveGoal" data-id="${id}">归档并释放留存</button></div><p class="helper">最近的留存记录</p>${g.events
      .slice(-30)
      .reverse()
      .map(
        (e) =>
          `<div class="detail-line"><span>${e.date}</span><strong>${e.amount > 0 ? '+' : ''}${money(e.amount)}</strong></div>`,
      )
      .join('')}`,
    '计划详情',
  );
}
function templateForm(id) {
  const t = state.templates.find((t) => t.id === id);
  openSheet(
    `<p class="helper">开始日期之前不补记。修改模板只改变未来账单；已到期待确认项保留原金额。</p><form id="template-form" data-id="${t?.id || ''}" data-expected="${t?.updatedAt || ''}">${field('名称', 'name', t?.name || '', 'text', 'required maxlength="60"')}<div class="field-grid">${select(
      '方向',
      'type',
      [
        ['expense', '支出'],
        ['income', '收入'],
      ],
      t?.type || 'expense',
    )}${select(
      '币种',
      'currency',
      Object.entries(CURRENCIES).map(([k, v]) => [k, k + ' · ' + v.name]),
      t?.currency || 'CNY',
    )}</div>${field('金额', 'amount', t ? t.amount / 100 : '', 'text', 'required inputmode="decimal"')}<div class="field-grid">${select(
      '周期',
      'frequency',
      [
        ['monthly', '月'],
        ['weekly', '周'],
        ['yearly', '年'],
      ],
      t?.frequency || 'monthly',
    )}${field('每隔几个周期', 'interval', t?.interval || 1, 'number', 'required min="1" max="12"')}</div>${field('月 / 年周期记账日（29—31 日会取月末）', 'day', t?.day || Number(localDate().slice(8)), 'number', 'required min="1" max="31"')}${field('开始日期（周周期也以此日为锚点）', 'startDate', t?.startDate || localDate(), 'date', 'required')}${field('结束日期（可选）', 'endDate', t?.endDate || '', 'date')}${select(
      '到期入账方式',
      'mode',
      [
        ['confirm', '待我确认'],
        ['auto', '直接入账'],
      ],
      t?.mode || 'confirm',
    )}<label class="toggle-row"><span>暂停模板（暂停期间不补记）</span><input name="paused" type="checkbox" ${t?.paused ? 'checked' : ''}></label>${submit('保存模板')}</form>`,
    '固定收支模板',
  );
}
async function processDue() {
  const dueQuotes = {},
    requests = new Map();
  for (const t of state.templates) {
    if (t.paused || t.mode !== 'auto' || t.currency === 'CNY') continue;
    let date = t.nextDate;
    while (date <= localDate() && (!t.endDate || date <= t.endDate) && requests.size < 20) {
      requests.set(t.currency + ':' + date, [t.currency, date]);
      date = advanceOccurrence(t, date);
    }
  }
  const answers = await Promise.allSettled(
    [...requests.values()].map(([currency, date]) => reference(currency, date)),
  );
  [...requests.keys()].forEach((key, i) => {
    if (answers[i].status === 'fulfilled') dueQuotes[key] = answers[i].value;
  });
  let rounds = 0,
    more = true,
    total = 0;
  while (more && rounds++ < 5) {
    const result = {};
    await commit((s) => Object.assign(result, L.catchUp(s, localDate(), dueQuotes)));
    total += result.count;
    more = result.more;
  }
  if (total) toast(`已处理 ${total} 项到期账单。`);
  if (more) toast('还有历史账单，将在下次打开继续处理。');
}
function calendar(context = 'home') {
  const date = context === 'home' ? selectedDay : periodDate;
  cal = {
    context,
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    mode: context === 'home' ? 'day' : period,
    yearPage: Number(date.slice(0, 4)) - (Number(date.slice(0, 4)) % 12),
  };
  calendarUI();
}
function calendarUI() {
  openSheet(
    F.calendar(
      {
        ...cal,
        selected: cal.context === 'home' ? selectedDay : periodDate,
        period: cal.context === 'home' ? 'day' : period,
        today: localDate(),
        rows: data.transactions,
      },
      icon,
    ),
    '选择日期',
  );
}
function picked(date) {
  if (cal.context === 'home') selectedDay = date;
  else periodDate = date;
  close();
  render();
  T.feedback('date');
}
function palette() {
  const style = getComputedStyle(document.body),
    color = (n) => style.getPropertyValue('--' + n).trim();
  return {
    paper: color('paper'),
    ink: color('ink'),
    secondary: color('secondary'),
    sage: color('sage'),
    leaf: color('leaf'),
    clay: color('clay'),
    line: color('line'),
    family: previewTheme || data.theme,
    displayFont: style.getPropertyValue('--world-heading').trim() || undefined,
  };
}
async function renderPoster() {
  await document.fonts.ready;
  if (screen !== 'poster') return;
  const result = F.drawPoster(data, F.statistics(data, periodDate, period), {
    palette: palette(),
    includeDetails,
    includeBadge,
    pageIndex: posterIndex,
  });
  if (posterCanvas) posterCanvas.width = posterCanvas.height = 0;
  posterCanvas = result.canvas;
  posterPages = result.pages;
  posterBlob = null;
  document.querySelector('#poster-preview').replaceChildren(posterCanvas);
  const canvas = posterCanvas;
  const avatar = T.current().avatar;
  if (avatar) {
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = avatar;
      });
      if (canvas === posterCanvas) canvas.getContext('2d').drawImage(image, 830, 180, 150, 150);
    } catch {}
  }
  if (canvas !== posterCanvas) return;
  canvas.toBlob((blob) => {
    if (canvas === posterCanvas) posterBlob = blob;
  }, 'image/png');
  document.querySelector('#poster-pager').innerHTML =
    result.pages > 1
      ? `<div class="poster-pager"><button data-action="posterPage" data-step="-1" ${posterIndex === 0 ? 'disabled' : ''}>上一张</button><span>第 ${posterIndex + 1} / ${result.pages} 张</span><button data-action="posterPage" data-step="1" ${posterIndex === result.pages - 1 ? 'disabled' : ''}>下一张</button></div>`
      : '';
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function posterSave(share = false) {
  if (!posterBlob) throw Error('图片还在生成，请稍后点击。');
  const name = `余记-${F.periodInfo(periodDate, period).prefix}-${posterIndex + 1}.png`,
    file = new File([posterBlob], name, { type: 'image/png' });
  if (share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: '余记 · 收支报告' });
  } else download(posterBlob, name);
  await commit((s) => {
    s.activity.reportExports++;
    L.award(s);
  });
  toast('已生成 PNG；iPhone 分享面板可存到照片或文件。');
}
function backupUI() {
  openSheet(
    `<p class="helper">完整备份包含收支、期初资产、截图、计划、固定模板、徽章和主题。请存到你保管的位置，换手机时导入这个文件。</p><form id="backup-form">${field('备份密码（可选，至少 8 个字符）', 'password', '', 'password', 'autocomplete="new-password"')}<p class="safety-note">设置密码后无法找回；截图较多时加密备份上限 32 MiB。留空可导出不加密完整备份。</p>${submit('生成并下载 .yuji 备份')}</form>`,
    '导出完整备份',
  );
}
async function backupSave(password = '') {
  const snapshot = await DB.snapshot(),
    copy = structuredClone(snapshot.state);
  copy.lastBackup = new Date().toISOString();
  L.award(copy);
  const blob = await exportBackup(copy, snapshot.attachments, password);
  download(blob, `余记-${localDate()}-${Date.now()}.yuji`);
  await commit((s) => {
    s.lastBackup = copy.lastBackup;
    L.award(s);
  });
  close();
  toast('备份已生成。请确认文件已保存到你选择的位置。');
}
function importUI() {
  imported = null;
  openSheet(
    `<p class="helper">先在本机校验文件，预览后再决定合并或恢复。支持正式 .yuji 完整备份。</p><button class="upload-area" data-action="pickBackup">${icon('upload')}<span>选择备份文件</span><small>文件和密码都不会上传</small></button><input id="backup-input" type="file" accept=".yuji,application/octet-stream" hidden><div id="import-preview"></div>`,
    '导入完整备份',
  );
}
async function readBackup(file, password = '') {
  const incoming = await importBackup(file, password);
  imported = incoming;
  state = await DB.readLedger();
  importRevision = state.revision;
  const summary = L.importSummary(state, incoming.state);
  openSheet(
    `<p class="helper">校验通过：${incoming.state.transactions.length} 笔收支，${incoming.attachments.length} 张截图，${incoming.state.goals.length} 个计划，${incoming.state.templates.length} 个模板。</p><p class="formula">合并新增 ${summary.transactions} 笔收支 / ${summary.goals} 个计划 / ${summary.templates} 个模板。<br>共有 ${summary.conflicts} 项同标识内容冲突。</p><form id="import-form">${select(
      '导入方式',
      'mode',
      [
        ['merge', '合并到本机账本'],
        ['restore', '完整恢复为该备份'],
      ],
      'merge',
    )}${select(
      '合并时的冲突与期初资产 / 偏好',
      'prefer',
      [
        ['local', '保留本机同标识内容、期初资产和偏好'],
        ['imported', '采用备份同标识内容、期初资产和偏好'],
      ],
      'local',
    )}<p class="safety-note">同标识计划按完整计划处理，避免重复留存。合并会带入徽章、主题和截图。完整恢复会先下载当前账本的安全备份，再替换本机全部内容；取消导入不会改变账目。</p>${submit('确认导入')}</form>`,
    '备份预览',
  );
}
async function performImport(mode, prefer) {
  if (!imported) throw Error('请先选择有效备份。');
  const current = await DB.snapshot();
  if (current.state.revision !== importRevision)
    throw Error('本机账本已更新，请重新选择文件预览。');
  const incoming = imported,
    merged =
      mode === 'restore'
        ? structuredClone(incoming.state)
        : L.mergeLedger(current.state, incoming.state, prefer);
  if (mode === 'restore') {
    const safety = await exportBackup(current.state, current.attachments);
    download(safety, `余记-恢复前-${Date.now()}.yuji`);
  } else {
    const existing = new Map(current.attachments.map((a) => [a.id, a]));
    for (const a of incoming.attachments)
      if (existing.has(a.id) && (await sha(existing.get(a.id).blob)) !== a.sha256)
        throw Error('同标识截图内容冲突，请选择完整恢复。');
  }
  await commit(() => merged, {
    attachments: incoming.attachments,
    replaceAttachments: mode === 'restore',
    expectedRevision: importRevision,
  });
  close();
  await processDue();
  toast('完整备份已导入到本机。');
}
async function ratesUI(force = false) {
  openSheet('<div class="progress-status">正在读取参考汇率…</div>', '自动汇率');
  try {
    fxInfo = await latestRates(force);
    ratesPanel();
  } catch (e) {
    if (sheet.open)
      openSheet(
        `<p class="helper">${esc(e.message)}</p><button class="primary" data-action="refreshFx">重试获取</button>`,
        '自动汇率',
      );
  }
}
function ratesPanel() {
  if (!sheet.open) return;
  openSheet(
    `<div class="fx-status">${icon('globe')} 自动检查最新日参考价</div>${Object.entries(
      fxInfo?.entries || {},
    )
      .map(
        ([c, q]) =>
          `<div class="detail-line"><span>1 ${c}<small>报价 ${q.rateDate}</small></span><strong>¥ ${q.rate.toFixed(6)}</strong></div>`,
      )
      .join(
        '',
      )}<p class="helper">最近获取：${new Date(fxInfo.fetchedAt).toLocaleString('zh-CN')}<br>来源：<a href="https://frankfurter.dev/" target="_blank" rel="noreferrer">Frankfurter</a>。通常按日更新，非盘中实时行情。每次打开和恢复联网会检查；离线使用缓存。历史账目保持原汇率。请求只含币种和日期。</p><button class="primary" data-action="refreshFx">刷新参考汇率</button>`,
    '自动汇率',
  );
}
async function storageUI() {
  const estimate = await navigator.storage?.estimate?.(),
    ready = await ocrReady().catch(() => false);
  openSheet(
    `<p class="formula">本机使用约 ${estimate?.usage ? (estimate.usage / 1024 / 1024).toFixed(1) + ' MiB' : '暂无法统计'}<br>${L.active(state).length} 笔收支 · ${state.transactions.filter((t) => t.deletedAt).length} 笔可恢复删除记录<br>离线截图识别：${ready ? '已准备' : '尚未下载'}</p><p class="helper">应用外壳自动缓存。特殊主题打开后缓存图片；像素字体按需加载。清理识别资源只影响截图 OCR，账目和备份不受影响。</p><button class="primary" data-action="prepareOcr">准备离线识别（约 7.5 MiB）</button><button class="secondary" style="width:100%;margin-top:12px" data-action="clearOcr">清理识别资源缓存</button><button class="secondary" style="width:100%;margin-top:12px" data-action="persistent">请求浏览器持久储存</button><button class="secondary" style="width:100%;margin-top:12px" data-action="trash">查看已删除记录</button><div id="ocr-progress" class="progress-status" hidden></div><p class="safety-note">浏览器可能清理本机网站数据。持久储存由系统决定，不能代替 .yuji 文件备份。每次换机、清除浏览数据前先导出。</p>`,
    '本机储存',
  );
}
function install() {
  openSheet(
    `<p class="formula">Safari 打开此地址 → 分享 → 添加到主屏幕 → 打开为网页 App。建议先安装，再从固定入口开始正式记账。首次联网打开后，等待外壳缓存完成即可离线记账。Safari 与主屏幕入口的数据由 iOS 管理；切换入口前可导出备份。</p><p class="helper">Web Clip 也可作为安装入口：下载下面的描述文件 → 设置 → 已下载描述文件 → 安装。它包含一个可移除的全屏网页图标。</p><a class="primary" href="Yujournal.mobileconfig" download="Yujournal.mobileconfig">下载 .mobileconfig</a><p class="safety-note">无需 App Store、付费开发者账号或重新签名。描述文件只提供网页入口，不包含账本数据。固定 HTTPS 地址部署后可安装，localhost 仅用于开发。</p>`,
    '安装余记',
  );
}
function shortcuts() {
  openSheet(
    `<p class="formula">可在 Apple「快捷指令」中组合：<br>听写文本 → URL 编码 → 打开 URL：<br><code>${esc(new URL('./#entry=text&text=', document.baseURI).href)}【编码结果】</code><br><br>把快捷指令放到桌面小组件，点一下开始记账。复制付款凭证文字后也可用同一路径带入。</p><p class="helper">带入的文字只在本机页面解析，并会立即从浏览器地址中清除。保存前仍需确认。纯 PWA 不能提供自动刷新余额的原生 WidgetKit 小组件，也无法读取微信、支付宝或银行 App 的交易记录。键盘听写由 iOS 处理，是否离线及隐私设置取决于系统。</p>`,
    '快捷指令入口',
  );
}
async function execute(action, el) {
  const id = el.dataset.id,
    value = el.dataset.value;
  switch (action) {
    case 'close':
      close();
      break;
    case 'home':
    case 'ledger':
    case 'goals':
    case 'settings':
    case 'assets':
    case 'themes':
    case 'badges':
    case 'report':
    case 'recurring':
      go(action);
      break;
    case 'back':
      go(returnScreen);
      break;
    case 'record':
      entryStart();
      break;
    case 'photo':
      entryStart('ocr');
      break;
    case 'entryMode':
      entryStart(value);
      break;
    case 'parseEntry':
      entry.raw = document.querySelector('#entry-text').value;
      entry.parsed = parseEntry(entry.raw, { source: entry.mode === 'ocr' ? 'ocr' : 'text' });
      entryUI();
      break;
    case 'uploadPhoto':
      document.querySelector('#photo-input').click();
      break;
    case 'detail':
      await detail(id);
      break;
    case 'editTxn': {
      const t = state.transactions.find((t) => t.id === id);
      entryStart('manual');
      entry.parsed = structuredClone(t);
      entry.editing = id;
      entryUI();
      break;
    }
    case 'deleteReview': {
      const t = state.transactions.find((t) => t.id === id);
      openSheet(
        `<p class="formula">删除“${esc(t.title)}” ${money(t.baseAmount)} 元？<br>从统计中移除后，可以在本机储存的已删除记录中恢复。</p><button class="primary" data-action="deleteTxn" data-id="${id}" data-expected="${esc(t.updatedAt)}">确认删除这一笔</button>`,
        '删除账目',
      );
      break;
    }
    case 'deleteTxn':
      await commit((s) => L.deleteTransaction(s, id, el.dataset.expected));
      undoId = id;
      close();
      toast('已删除这一笔。', true);
      break;
    case 'undoDelete':
    case 'restoreTxn':
      await commit((s) => L.restoreTransaction(s, id || undoId));
      close();
      toast('已恢复记录。');
      break;
    case 'trash':
      openSheet(
        state.transactions
          .filter((t) => t.deletedAt)
          .slice(-50)
          .reverse()
          .map(
            (t) =>
              `<div class="detail-line"><span>${esc(t.title)} · ${t.date}</span><button class="text-button" data-action="restoreTxn" data-id="${t.id}">恢复 ${money(t.baseAmount)}</button></div>`,
          )
          .join('') || '<p class="helper">没有已删除记录。</p>',
        '已删除记录',
      );
      break;
    case 'opening':
      opening();
      break;
    case 'newGoal':
      goalForm();
      break;
    case 'editGoal':
      goalForm(id);
      break;
    case 'allocate':
      allocate(id);
      break;
    case 'goalDetail':
      goalDetail(id);
      break;
    case 'restoreGoal':
      await commit((s) => L.restoreGoal(s, id));
      close();
      break;
    case 'archiveGoal':
      await commit((s) => L.archiveGoal(s, id));
      close();
      toast('计划已归档，留存已释放到可分配资产。');
      break;
    case 'newTemplate':
      templateForm();
      break;
    case 'editTemplate':
      templateForm(id);
      break;
    case 'pendingBook': {
      const p = state.pending.find((p) => p.id === id);
      entryStart('manual');
      entry.pending = id;
      entry.parsed = {
        title: p.snapshot.name,
        type: p.snapshot.type,
        amount: p.snapshot.amount,
        currency: p.snapshot.currency,
        date: p.dueDate,
        icon: 'repeat',
      };
      entryUI();
      break;
    }
    case 'pendingSkip':
      await commit((s) => L.resolvePending(s, id));
      break;
    case 'calendar':
      calendar(el.dataset.context);
      break;
    case 'calendarMode':
      cal.mode = el.dataset.mode;
      calendarUI();
      break;
    case 'calendarPrev':
    case 'calendarNext': {
      const step = action === 'calendarPrev' ? -1 : 1;
      if (cal.mode === 'year') {
        cal.yearPage += step * 12;
        cal.yearPage = Math.max(1900, Math.min(2089, cal.yearPage));
      } else if (cal.mode === 'month') cal.year = Math.max(1900, Math.min(2100, cal.year + step));
      else {
        let m = cal.month + step;
        if (m < 1) {
          cal.year--;
          m = 12;
        }
        if (m > 12) {
          cal.year++;
          m = 1;
        }
        cal.month = m;
      }
      calendarUI();
      break;
    }
    case 'pickYear':
      cal.year = Number(el.dataset.year);
      if (cal.context !== 'home' && period === 'year') picked(`${cal.year}-01-01`);
      else {
        cal.mode = 'month';
        calendarUI();
      }
      break;
    case 'pickMonth':
      cal.month = Number(el.dataset.month);
      if (cal.context !== 'home' && period === 'month') picked(monthDay(cal.year, cal.month, 1));
      else {
        cal.mode = 'day';
        calendarUI();
      }
      break;
    case 'pickDate':
      picked(el.dataset.date);
      break;
    case 'dayQuick':
      selectedDay = el.dataset.date;
      render();
      T.feedback('date');
      break;
    case 'setPeriod':
      period = value;
      ledgerLimit = 50;
      render();
      break;
    case 'dailyFilter':
      dailyFilter = value;
      render();
      break;
    case 'filter':
      filter = value;
      ledgerLimit = 50;
      render();
      break;
    case 'loadMore':
      ledgerLimit += 50;
      render();
      break;
    case 'badgeFilter':
      badgeFilter = value;
      render();
      break;
    case 'wearBadge':
      await commit((s) => {
        if (!s.unlockedBadges.includes(id)) throw Error('徽章尚未获得。');
        s.wornBadge = s.wornBadge === id ? null : id;
      });
      break;
    case 'setMode':
      await commit((s) => (s.preferences.displayMode = value));
      break;
    case 'previewTheme':
      previewTheme = id;
      render();
      toast('预览主题不会改变你的解锁记录。');
      break;
    case 'stopPreview':
      previewTheme = null;
      render();
      break;
    case 'useTheme':
      await commit((s) => {
        if (!s.unlockedThemes.includes(id)) throw Error('主题尚未解锁。');
        s.preferences.theme = id;
      });
      previewTheme = null;
      render();
      break;
    case 'lastReport':
      period = 'month';
      periodDate = el.dataset.date;
      go('report');
      break;
    case 'reportDetails':
      go('ledger');
      break;
    case 'reportCard':
      posterIndex = 0;
      go('poster');
      break;
    case 'posterPage':
      posterIndex = Math.max(0, Math.min(posterPages - 1, posterIndex + Number(el.dataset.step)));
      renderPoster();
      break;
    case 'savePoster':
      await posterSave();
      break;
    case 'sharePoster':
      await posterSave(true);
      break;
    case 'backup':
      backupUI();
      break;
    case 'import':
      importUI();
      break;
    case 'pickBackup':
      document.querySelector('#backup-input').click();
      break;
    case 'rates':
      await ratesUI();
      break;
    case 'refreshFx':
      await ratesUI(true);
      break;
    case 'storage':
      await storageUI();
      break;
    case 'prepareOcr': {
      const node = document.querySelector('#ocr-progress');
      node.hidden = false;
      await prepareOCR((message) => (node.textContent = message));
      toast('离线截图识别资源已准备。');
      break;
    }
    case 'clearOcr':
      await releaseOCR();
      await caches.delete(OCR_CACHE);
      await storageUI();
      toast('已清理识别缓存，账目仍保存在本机。');
      break;
    case 'persistent':
      toast(
        (await navigator.storage?.persist?.())
          ? '浏览器已允许持久储存。'
          : '系统未授予持久储存，请保留文件备份。',
      );
      break;
    case 'install':
      install();
      break;
    case 'shortcuts':
      shortcuts();
      break;
  }
}
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  e.preventDefault();
  if (busy) return;
  busy = true;
  try {
    await execute(el.dataset.action, el);
  } catch (err) {
    if (err.name !== 'AbortError') error(err);
  } finally {
    busy = false;
  }
});
document.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  busy = true;
  document.body.setAttribute('aria-busy', 'true');
  const form = e.target,
    v = Object.fromEntries(new FormData(form));
  try {
    switch (form.id) {
      case 'entry-form':
        await entrySave(form);
        break;
      case 'opening-form':
        await commit(
          (s) =>
            (s.opening = {
              ...s.opening,
              amount: parseAmount(v.amount, 'CNY', { zero: true }),
              configured: true,
            }),
        );
        close();
        break;
      case 'goal-form': {
        const target = parseAmount(v.target),
          id = form.dataset.id;
        await commit((s) => {
          if (!v.name.trim()) throw Error('请填写计划名称。');
          const g = s.goals.find((g) => g.id === id);
          if (g) {
            if (g.updatedAt !== form.dataset.expected) throw Error('计划已被其他窗口更新。');
            Object.assign(g, {
              name: v.name,
              target,
              date: v.date,
              updatedAt: L.changedAt(g.updatedAt),
            });
          } else
            s.goals.push({
              id: L.id(),
              name: v.name,
              target,
              date: v.date,
              events: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          L.award(s);
        });
        close();
        break;
      }
      case 'allocate-form':
        await commit((s) =>
          L.allocateGoal(
            s,
            form.dataset.id,
            parseAmount(v.amount) * (v.direction === 'withdraw' ? -1 : 1),
          ),
        );
        close();
        break;
      case 'template-form':
        await commit((s) =>
          L.saveTemplate(s, {
            ...v,
            id: form.dataset.id,
            expected: form.dataset.expected,
            amount: parseAmount(v.amount, v.currency),
            paused: !!v.paused,
          }),
        );
        close();
        await processDue();
        break;
      case 'backup-form':
        await backupSave(v.password);
        break;
      case 'decrypt-form':
        await readBackup(importFile, v.password);
        break;
      case 'import-form':
        await performImport(v.mode, v.prefer);
        break;
      case 'year-jump-form':
        cal.year = Math.max(1900, Math.min(2100, Number(v.year)));
        cal.yearPage = cal.year - (cal.year % 12);
        calendarUI();
        break;
    }
  } catch (err) {
    error(err);
  } finally {
    busy = false;
    document.body.removeAttribute('aria-busy');
  }
});
document.addEventListener('change', async (e) => {
  try {
    if (e.target.id === 'photo-input') {
      const file = e.target.files[0];
      if (file) await photo(file);
    }
    if (e.target.id === 'backup-input') {
      importFile = e.target.files[0];
      if (!importFile) return;
      if (await backupEncrypted(importFile))
        openSheet(
          `<form id="decrypt-form">${field('备份密码', 'password', '', 'password', 'required autocomplete="current-password"')}${submit('解密并校验')}</form>`,
          '加密备份',
        );
      else await readBackup(importFile);
    }
    if (e.target.closest('#entry-form')) {
      if (e.target.name === 'candidate')
        document.querySelector('#entry-form').elements.amount.value = Number(e.target.value) / 100;
      if (['currency', 'date'].includes(e.target.name)) refreshQuote();
      else quoteText();
    }
    if (e.target.id === 'poster-details' || e.target.id === 'poster-badge') {
      includeDetails = document.querySelector('#poster-details').checked;
      includeBadge = document.querySelector('#poster-badge').checked;
      posterIndex = 0;
      renderPoster();
    }
  } catch (err) {
    error(err);
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'ledger-search') {
    query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = document.querySelector('#ledger-search');
    input.focus();
    if (input.type === 'text') input.setSelectionRange(pos, pos);
  }
  if (e.target.name === 'amount' && e.target.closest('#entry-form')) quoteText();
});
sheet.addEventListener('cancel', (e) => {
  e.preventDefault();
  close();
});
DB.updates.addEventListener('change', async () => {
  if (!state) return;
  try {
    const latest = await DB.readLedger();
    if (latest.revision > state.revision) {
      state = latest;
      render();
      if (sheet.open) toast('其他窗口已更新账本，提交时会检查冲突。');
    }
  } catch (e) {
    error(e);
  }
});
DB.updates.addEventListener('upgrade', () => toast('数据版本已更新，请关闭并重新打开余记。'));
async function refreshRates() {
  try {
    fxInfo = await latestRates();
    if (screen === 'settings' && !sheet.open) render();
  } catch {}
}
window.addEventListener('online', () => {
  render();
  refreshRates();
});
window.addEventListener('offline', render);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('page-hidden', document.hidden);
  if (!document.hidden) {
    refreshRates();
    if (state && !busy && !sheet.open) processDue().catch(error);
  }
});
try {
  if (!globalThis.crypto?.subtle) throw Error('请使用 HTTPS 或本机 localhost 打开余记。');
  state = await DB.readLedger();
  T.setup();
  render();
  if ('serviceWorker' in navigator)
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => toast('离线账本已准备。'))
      .catch(() =>
        toast(
          navigator.serviceWorker.controller
            ? '正在使用已准备的本机缓存。'
            : '离线外壳暂未准备，请检查网络后重新打开。',
        ),
      );
  await processDue();
  refreshRates();
  const params = new URLSearchParams(location.hash.slice(1) || location.search),
    entryMode = params.get('entry'),
    text = params.get('text');
  if (entryMode) {
    history.replaceState({}, '', location.pathname);
    entryStart(entryMode === 'ocr' ? 'ocr' : 'text', text?.slice(0, 12000) || '');
  }
} catch (e) {
  content.innerHTML = `<div class="empty"><p>${esc(e.message)}</p><p class="helper">未删除任何历史内容。请重新打开后重试。</p></div>`;
}
