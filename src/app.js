import * as L from './lib/ledger.js';
import * as DB from './lib/database.js';
import { money, parseAmount, CURRENCIES, originalMoney, convertAmount } from './lib/money.js';
import { localDate, addDays, monthDay, advanceOccurrence } from './lib/dates.js';
import { parseEntry, parseBatch } from './lib/parser.js';
import { exportBackup, importBackup, backupEncrypted, sha } from './lib/backup.js';
import { reference, latestRates } from './lib/exchange.js';
import { recognize, releaseOCR, shrinkImage, prepareOCR, ocrReady, OCR_CACHE } from './lib/ocr.js';
import {
  VoiceCapture,
  voiceReady,
  prepareVoice,
  voiceManifest,
  releaseVoice,
  VOICE_CACHE,
} from './lib/voice.js';
import { quickText, shortcutURL } from './lib/quick-input.js';
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
let voiceCapture = null,
  voicePointer = null,
  voiceStartY = 0,
  voiceCancelled = false,
  voiceDownload = null,
  voiceCheckSequence = 0;
function voiceState(message) {
  const node = document.querySelector('#voice-status');
  if (node) node.textContent = message;
  const button = document.querySelector('[data-voice-control]');
  if (button && /录音已结束|正在本机|载入本机|载入模型/.test(message)) button.disabled = true;
}

function voiceUI() {
  openSheet(
    `${tabs()}<p class="helper">录音和识别都在本机。一次可以说多笔：午饭 36 元、咖啡 28 元、工资到账 20000 元。识别后核对清单，一次确认。</p><button class="voice-hold" data-voice-control type="button" aria-label="按住说话">${icon('mic')}<strong>按住说话</strong><span>松开整理 · 上滑取消</span></button><p id="voice-status" class="voice-status" role="status">正在检查本机语音包…</p><progress id="voice-progress" class="voice-progress" max="100" value="0" aria-label="语音包下载进度" hidden></progress><p id="voice-download-detail" class="helper" hidden></p><button id="prepare-voice" class="primary" data-action="prepareVoice" hidden>准备本机语音包（约 98 MiB）</button><p class="helper">首次需要联网准备约 98 MiB 的中文语音包，之后离线使用。下载时可切换录入方式；关闭后保留已完成文件，下次继续。本机识别不会保存或上传原始录音。</p><div class="entry-fallback"><button class="text-button" data-action="entryMode" data-value="text">改用文本 / 键盘听写</button></div>`,
    '长按语音记账',
  );
  const button = document.querySelector('[data-voice-control]');
  const check = ++voiceCheckSequence;
  button.disabled = true;
  voiceReady()
    .then((ready) => {
      if (!button.isConnected || check !== voiceCheckSequence) return;
      button.disabled = !ready;
      document.querySelector('#prepare-voice').hidden = ready;
      voiceState(
        ready
          ? '语音包已准备，可离线使用。按住说话，松开后自动整理。'
          : '首次需要准备语音包，下载后无需再联网识别。',
      );
    })
    .catch(() => {
      if (button.isConnected && check === voiceCheckSequence) {
        document.querySelector('#prepare-voice').hidden = false;
        voiceState('需要联网准备本机语音包。');
      }
    });
  voiceCapture = new VoiceCapture({
    onState: (message) => {
      if (button.isConnected) voiceState(message);
    },
    onError: (e) => {
      if (!button.isConnected) return;
      button.classList.remove('recording');
      button.disabled = false;
      voiceState(e.name === 'NotAllowedError' ? '麦克风未获授权，请允许后再按住说话。' : e.message);
    },
    onResult: (text) => {
      button.classList.remove('recording');
      if (!entry || entry.mode !== 'voice') return;
      entry.raw = text;
      try {
        prepareBatch(text, { source: 'voice' });
      } catch (e) {
        entry.mode = 'text';
        entryUI();
        error('语音结果需要补充：' + e.message);
      }
    },
  });
}
async function prepareVoiceUI() {
  if (voiceDownload) return;
  const download = new AbortController(),
    owner = entry;
  voiceCheckSequence++;
  voiceDownload = download;
  const button = document.querySelector('#prepare-voice');
  if (button) button.disabled = true;
  try {
    await prepareVoice((p) => {
      if (voiceDownload !== download || entry !== owner || download.signal.aborted) return;
      const bar = document.querySelector('#voice-progress'),
        detail = document.querySelector('#voice-download-detail');
      if (bar) {
        bar.hidden = false;
        bar.value = p.percent;
      }
      if (detail) {
        detail.hidden = false;
        detail.textContent = p.total
          ? `${(p.loaded / 1024 / 1024).toFixed(1)} / ${(p.total / 1024 / 1024).toFixed(1)} MiB · 已完成 ${p.completed} / ${p.files} 个资源`
          : '正在检查离线服务；可随时关闭或切换入口。';
      }
      voiceState(
        p.phase === 'checking'
          ? '正在检查已有语音资源…'
          : p.phase === 'connecting'
            ? `正在连接下载 ${p.percent}%…`
            : p.phase === 'saving'
              ? `正在保存到本机 ${p.percent}%…`
              : `下载语音包 ${p.percent}%`,
      );
    }, download.signal);
    if (voiceDownload !== download || download.signal.aborted || entry !== owner) return;
    voiceDownload = null;
    if (entry?.mode === 'voice') voiceUI();
  } catch (e) {
    if (voiceDownload !== download || download.signal.aborted) return;
    const message =
      e.name === 'TimeoutError'
        ? '连接或保存超时，已完成文件保留，请重试下载。'
        : e.name === 'QuotaExceededError'
          ? '本机可用空间不足，请腾出空间后重试。'
          : e.message;
    voiceState('语音包未准备完成。');
    error(message);
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = '重试下载（保留已完成文件）';
    }
  } finally {
    if (voiceDownload === download) voiceDownload = null;
  }
}
let profilePictureURL = null,
  profilePictureId = null,
  profilePictureSequence = 0;
async function loadProfilePicture() {
  const id = state.profile?.avatarId || null;
  if (id === profilePictureId) return;
  const seq = ++profilePictureSequence;
  const image = id ? await DB.getAttachment(id) : null;
  if (seq !== profilePictureSequence) return;
  if (profilePictureURL) URL.revokeObjectURL(profilePictureURL);
  profilePictureId = id;
  profilePictureURL = image ? URL.createObjectURL(image.blob) : null;
}
function profileAvatar() {
  const profile = state.profile || {},
    preset = profile.avatarPreset || 'theme';
  if (profile.avatarId && profilePictureId === profile.avatarId && profilePictureURL)
    return `<img class="personal-avatar" src="${profilePictureURL}" alt="我的头像">`;
  if (preset === 'initials')
    return `<span class="avatar-initial">${esc(Array.from(profile.name || '余记')[0])}</span>`;
  if (T.worlds[preset]?.avatar)
    return `<img class="world-avatar" src="${T.worlds[preset].avatar}" alt="我的头像">`;
  return T.avatar(icon('user'));
}
function profileUI() {
  const profile = state.profile || { name: '我的本机账本', avatarPreset: 'theme', avatarId: null };
  openSheet(
    `<div class="profile-edit-avatar">${profileAvatar()}</div><form id="profile-form">${field('账本名称 / 昵称', 'name', profile.name, 'text', 'required maxlength="40"')}${submit('保存名称')}</form><p class="helper">头像和名称只保存在本机，随完整备份迁移。</p><div class="avatar-picker">${['theme', 'initials', 'mint', 'postcard', 'starlight', 'pixel'].map((id) => `<button data-action="avatarPreset" data-id="${id}" aria-label="${id === 'theme' ? '跟随主题' : id === 'initials' ? '名字首字' : T.worlds[id].name}头像">${id === 'theme' ? T.avatar(icon('user')) : id === 'initials' ? '<span>余</span>' : `<img src="${T.worlds[id].avatar}" alt="">`}</button>`).join('')}</div><button class="secondary" style="width:100%" data-action="pickAvatar">从照片选择头像</button><input type="file" id="avatar-input" accept="image/*" hidden>`,
    '编辑我的资料',
  );
}
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
    profileName: state.profile?.name || '我的本机账本',
  };
}
function toast(message, undo = false) {
  const el = document.querySelector('#toast');
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button class="toast-action" data-action="undoDelete">撤销</button>' : ''}<button class="toast-close" data-action="dismissToast" aria-label="关闭提示">×</button>`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), undo ? 12000 : 2800);
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
  voiceCapture?.cancel();
  voiceCapture = null;
  voiceDownload?.abort();
  voiceDownload = null;
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
  sheet.scrollTop = 0;
  document.querySelector('#sheet-content').scrollTop = 0;
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
  return `<header class="page-head"><${back ? 'button' : 'div'} class="${back ? 'icon-button' : 'brand v3-brand'}" ${back ? 'data-action="back" aria-label="返回"' : ''}>${back ? icon('left') : icon('book') + esc(title)}</${back ? 'button' : 'div'}>${back ? `<span class="eyebrow">${esc(title)}</span>` : ''}<div class="head-right">${screen === 'home' ? `<button class="calendar-trigger" data-action="calendar" data-context="home" aria-label="打开日期日历">${icon('clock')}${selectedDay.slice(5).replace('-', ' 月 ')} 日 ${icon('down')}</button>` : ''}<button class="icon-button" data-action="settings" aria-label="我的与设置">${profileAvatar()}${worn ? icon(worn.icon).replace('<svg ', '<svg class="worn-mini" ') : ''}</button></div></header>`;
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
    profileAvatar,
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
  if (screen === 'home' && state.preferences.shortcutsEnabled)
    content.insertAdjacentHTML(
      'beforeend',
      `<button class="mini-notice" data-action="receiveQuickInput">${icon('upload')}<div><strong>接收快捷输入</strong><p>截图分享后，把识别结果带回这个账本</p></div>${icon('arrow')}</button>`,
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
  content.scrollTop = 0;
  content.scrollLeft = 0;
  content.scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
  globalThis.requestAnimationFrame?.(() => {
    content.scrollTop = 0;
  });
}
async function commit(action, options = {}) {
  const badges = state.unlockedBadges.length;
  state = await DB.mutate(action, options);
  await loadProfilePicture();
  render();
  if (state.unlockedBadges.length > badges) toast('获得新徽章，去徽章中心看看。');
  return state;
}
function entryStart(mode = 'voice', value = '') {
  voiceDownload?.abort();
  voiceDownload = null;
  voiceCapture?.cancel();
  voiceCapture = null;
  revoke();
  quote = null;
  entry = { mode, raw: value, file: null, parsed: null, editing: null, pending: null };
  entryUI();
}
function tabs() {
  return `<div class="entry-tabs">${[
    ['voice', '语音'],
    ['text', '文本'],
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
  if (entry.mode === 'voice') {
    voiceUI();
    return;
  }
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
function prepareBatch(raw, { source = 'text', receipt = false } = {}) {
  const parsed = parseBatch(raw, { source, receipt });
  entry.raw = raw;
  entry.batch = parsed;
  entry.parsed = null;
  entry.batchSource = source;
  batchUI();
}
function batchUI() {
  const batch = entry.batch;
  openSheet(
    `<p class="helper">共整理 ${batch.items.length} 笔。核对金额、方向和日期，再一次确认入账。</p>${entry.file ? `<img class="photo-preview" src="${entry.previewURL}" alt="付款截图，供核对">` : ''}<details class="helper"><summary>查看 / 修改原始识别文字</summary><textarea id="batch-raw" class="entry-text" aria-label="原始识别文字">${esc(entry.raw)}</textarea><button class="secondary" data-action="reparseBatch">重新整理</button></details>${batch.warnings.length ? `<p class="batch-warning">${batch.warnings.map(esc).join('<br>')}</p>` : ''}<form id="batch-form">${batch.items
      .map(
        (t, i) =>
          `<section class="batch-item" data-index="${i}"><label class="toggle-row"><input type="checkbox" name="include-${i}" checked><strong>第 ${i + 1} 笔</strong></label>${field('备注', `title-${i}`, t.title, 'text', 'required maxlength="100"')}<div class="field-grid">${select(
            '收支',
            `type-${i}`,
            [
              ['expense', '支出'],
              ['income', '收入'],
            ],
            t.type,
          )}${select(
            '币种',
            `currency-${i}`,
            Object.entries(CURRENCIES).map(([k, v]) => [k, k + ' · ' + v.name]),
            t.currency,
          )}</div>${t.ambiguous ? select('有多个候选金额', `candidate-${i}`, [['', '请选择'], ...t.candidates.map((c) => [String(c.amount), c.label])], '') : ''}${field('金额', `amount-${i}`, t.amount == null ? '' : t.amount / 100, 'text', 'required inputmode="decimal"')}${field('日期', `date-${i}`, t.date, 'date', `required max="${localDate()}"`)}${field('外币实际人民币结算（可选）', `settlement-${i}`, '', 'text', 'inputmode="decimal"')}<p class="helper">${t.currency === 'CNY' ? '人民币按原额记录。' : '参考价会在确认时检查，有缓存可离线；无报价时填实际人民币结算。'}</p></section>`,
      )
      .join(
        '',
      )}${entry.file ? '<label class="toggle-row"><span>在本机保留压缩截图，随完整备份迁移</span><input type="checkbox" name="retain"></label>' : ''}${submit('全部确认入账')}<p class="confirm-copy">取消勾选可跳过某笔。不会把汇总重复算一笔。</p></form>`,
    '核对收支清单',
  );
}
async function batchSave(form) {
  const current = entry,
    values = Object.fromEntries(new FormData(form)),
    drafts = [],
    images = [];
  if (current.file && values.retain) {
    const blob = await shrinkImage(current.file, { max: 1600, pixels: 3000000 });
    if (blob.size > 2 * 1024 * 1024) throw Error('截图附件过大，请缩小付款区域。');
    images.push({ id: L.id(), blob });
  }
  for (let i = 0; i < current.batch.items.length; i++) {
    if (!values[`include-${i}`]) continue;
    const original = current.batch.items[i],
      currency = values[`currency-${i}`],
      amt = parseAmount(values[`amount-${i}`], currency),
      date = values[`date-${i}`];
    const settlement =
      currency !== 'CNY' && values[`settlement-${i}`]?.trim()
        ? parseAmount(values[`settlement-${i}`])
        : undefined;
    const q = currency === 'CNY' || settlement !== undefined ? {} : await reference(currency, date);
    drafts.push(
      L.transaction({
        title: values[`title-${i}`],
        type: values[`type-${i}`],
        currency,
        amount: amt,
        date,
        settlement,
        ...q,
        source: current.batchSource || 'text',
        rawText: original.rawText,
        icon: original.icon,
        attachmentIds: images.map((a) => a.id),
      }),
    );
  }
  if (entry !== current) throw new DOMException('已取消入账。', 'AbortError');
  if (!drafts.length) throw Error('至少选择一笔收支。');
  await commit(
    (s) => {
      for (const t of drafts) L.addTransaction(s, t, { offline: !navigator.onLine });
    },
    { attachments: images },
  );
  selectedDay = drafts.at(-1).date;
  close();
  go('home');
  T.feedback('saved');
  toast(`已一次保存 ${drafts.length} 笔到本机。`);
}
function photoReview(file) {
  if (!entry) return;
  revoke();
  entry.originalFile = file;
  entry.file = null;
  entry.cropTop = 0;
  entry.cropBottom = 100;
  const url = URL.createObjectURL(file);
  urls.push(url);
  entry.previewURL = url;
  openSheet(
    `<p class="helper">保留原图清晰度；如金额识别不准，先把范围缩到付款金额与商户区域。</p><div class="crop-preview"><div class="crop-surface"><img src="${url}" alt="待识别付款截图"><div id="crop-mask-top"></div><div id="crop-mask-bottom"></div></div></div><label class="field"><span>开始位置</span><input id="crop-top" type="range" min="0" max="85" value="0"></label><label class="field"><span>结束位置</span><input id="crop-bottom" type="range" min="15" max="100" value="100"></label><label class="field"><span>截图内容</span><select id="ocr-layout"><option value="receipt">单张付款凭证</option><option value="list">多条交易记录（清单核对）</option></select></label><div id="ocr-progress" class="progress-status" hidden></div><button class="primary" data-action="recognizePhoto">识别所选区域</button>`,
    '选择付款区域',
  );
}
async function recognizePhoto() {
  const seq = ++ocrSequence,
    status = document.querySelector('#ocr-progress');
  status.hidden = false;
  const crop = {
    x: 0,
    y: entry.cropTop / 100,
    width: 1,
    height: (entry.cropBottom - entry.cropTop) / 100,
  };
  const image = await shrinkImage(entry.originalFile, { crop, format: 'image/png' });
  if (seq !== ocrSequence || !entry) return;
  entry.file = image;
  const receipt = document.querySelector('#ocr-layout').value === 'receipt';
  entry.receipt = receipt;
  const result = await recognize(image, (message) => {
    if (status.isConnected) status.textContent = message;
  });
  if (seq !== ocrSequence) return;
  entry.raw = result.text;
  try {
    prepareBatch(result.text, { source: 'ocr', receipt });
    if (result.confidence < 60)
      entry.batch.warnings.unshift('文字识别置信度较低，请对照截图核对关键金额。');
    batchUI();
  } catch (e) {
    openSheet(
      `<img class="photo-preview" src="${entry.previewURL}" alt="待核对截图"><textarea id="entry-text" class="entry-text" aria-label="一句话记账">${esc(result.text)}</textarea><p class="helper">尚未找到明确金额，可修改上面的文字再整理。</p><button class="primary" data-action="parseEntry">整理成账目</button>`,
      '核对识别文字',
    );
    error(e);
  }
}
async function photo(file) {
  photoReview(file);
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
async function posterSave(share = true) {
  if (!posterBlob) throw Error('图片还在生成，请稍后点击。');
  const name = `余记-${F.periodInfo(periodDate, period).prefix}-${posterIndex + 1}.png`,
    file = new File([posterBlob], name, { type: 'image/png' });
  if (share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '余记 · 收支报告' });
    } catch (e) {
      if (e.name === 'AbortError') return;
      posterImagePreview();
      return;
    }
  } else if (share) {
    posterImagePreview();
    return;
  } else download(posterBlob, name);
  await commit((s) => {
    s.activity.reportExports++;
    L.award(s);
  });
  toast(share ? '系统分享已完成。' : '报告图片已下载。');
}
function posterImagePreview() {
  const url = URL.createObjectURL(posterBlob);
  urls.push(url);
  openSheet(
    `<p class="helper">长按下面的图片，选择“存储到照片”。图片在本机生成，不会上传。</p><img class="poster-save-image" src="${url}" alt="当前收支报告长图"><button class="secondary" data-action="downloadPoster">下载到文件</button>`,
    '保存报告图片',
  );
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
    `<p class="formula">本机使用约 ${estimate?.usage ? (estimate.usage / 1024 / 1024).toFixed(1) + ' MiB' : '暂无法统计'}<br>${L.active(state).length} 笔收支 · ${state.transactions.filter((t) => t.deletedAt).length} 笔可恢复删除记录<br>离线截图识别：${ready ? '已准备' : '尚未下载'}</p><p class="helper">应用外壳自动缓存。特殊主题打开后缓存图片；像素字体按需加载。清理识别资源只影响截图 OCR，账目和备份不受影响。</p><button class="primary" data-action="prepareOcr">准备离线识别（约 7.5 MiB）</button><button class="secondary" style="width:100%;margin-top:12px" data-action="clearOcr">清理识别资源缓存</button><button class="secondary" style="width:100%;margin-top:12px" data-action="clearVoice">清理本机语音包缓存</button><button class="secondary" style="width:100%;margin-top:12px" data-action="persistent">请求浏览器持久储存</button><button class="secondary" style="width:100%;margin-top:12px" data-action="trash">查看已删除记录</button><div id="ocr-progress" class="progress-status" hidden></div><p class="safety-note">浏览器可能清理本机网站数据。持久储存由系统决定，不能代替 .yuji 文件备份。每次换机、清除浏览数据前先导出。</p>`,
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
    `<p class="helper">不是另外记一遍账：一次添加快捷指令，以后在截图分享菜单触发识别，回到余记一次确认。</p><label class="toggle-row"><span>在首页显示“接收快捷输入”</span><input id="quick-input-enabled" type="checkbox" ${state.preferences.shortcutsEnabled ? 'checked' : ''}></label><a class="primary" href="${shortcutURL('screenshot', document.baseURI)}">添加截图记账快捷指令</a><a class="secondary shortcut-link" href="${shortcutURL('voice', document.baseURI)}">添加本机语音入口</a><p class="helper">iOS 会打开或下载已签名的 .shortcut 文件，点“添加快捷指令”完成一次配置。若只保存到“文件”，在那里打开即可。开关只管理余记的接收按钮，网页不能静默修改系统配置或检测安装状态。</p><div class="formula">付款截图 → 分享 → “余记 · 截图记账” → 本机提取文字 → 核对清单 → 全部确认入账。<br><br>如果打开的是 Safari，而你的账本在主屏幕余记，请回到余记点“接收快捷输入”，无需再手输金额。</div><button class="secondary" style="width:100%" data-action="receiveQuickInput">接收快捷输入</button><p class="helper">本机语音入口可放进苹果快捷指令小组件，进入余记后按住说话。PWA 无法后台监听每次截图；未确认前不会偷偷入账。</p>`,
    '快捷输入',
  );
}
function quickInputUI() {
  openSheet(
    `<p class="helper">点读取，接收“余记 · 截图记账”处理的本机文字。首次可能需要点系统的“粘贴”。如历史账本在主屏幕图标中，请在那里完成这一步。</p><button class="primary" data-action="readQuickClipboard">读取快捷输入</button><p class="helper">也可以长按下面的框粘贴，不需要重输金额。</p><textarea id="quick-text" class="entry-text" aria-label="快捷识别文字"></textarea><label class="field"><span>截图内容</span><select id="quick-layout"><option value="receipt">单张付款凭证</option><option value="list">多条交易记录</option></select></label><button class="secondary" style="width:100%" data-action="parseQuickInput">整理为清单</button>`,
    '接收快捷输入',
  );
}
async function readQuickClipboard() {
  if (!navigator.clipboard?.readText) throw Error('当前入口无法读取剪贴板，请长按输入框粘贴。');
  const text = await navigator.clipboard.readText();
  document.querySelector('#quick-text').value = quickText(text);
}
function parseQuickInput() {
  const text = document.querySelector('#quick-text').value,
    receipt = document.querySelector('#quick-layout').value === 'receipt';
  const raw = text.startsWith('YUJOURNAL-INBOX/1\n') ? quickText(text) : text;
  entry = { mode: 'ocr', raw, file: null, parsed: null, editing: null, pending: null, receipt };
  prepareBatch(raw, { source: 'ocr', receipt });
}
async function execute(action, el) {
  const id = el.dataset.id,
    value = el.dataset.value;
  switch (action) {
    case 'profile':
      profileUI();
      break;
    case 'pickAvatar':
      document.querySelector('#avatar-input').click();
      break;
    case 'avatarPreset':
      await commit((s) => L.setProfile(s, { avatarPreset: id, avatarId: null }));
      profileUI();
      break;
    case 'dismissToast':
      document.querySelector('#toast').hidden = true;
      clearTimeout(toast.timer);
      break;
    case 'downloadPoster':
      await posterSave(false);
      break;
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
      prepareBatch(entry.raw, {
        source: entry.mode === 'ocr' ? 'ocr' : 'text',
        receipt: entry.mode === 'ocr' && entry.receipt !== false,
      });
      break;
    case 'receiveQuickInput':
      quickInputUI();
      break;
    case 'readQuickClipboard':
      await readQuickClipboard();
      break;
    case 'parseQuickInput':
      parseQuickInput();
      break;
    case 'prepareVoice':
      // A resource download is not a ledger mutation: do not hold the global action lock.
      void prepareVoiceUI();
      break;
    case 'clearVoice':
      voiceCapture?.cancel();
      releaseVoice();
      await caches.delete(VOICE_CACHE);
      await storageUI();
      toast('已清理语音包，账目仍保存在本机。');
      break;
    case 'recognizePhoto':
      await recognizePhoto();
      break;
    case 'reparseBatch':
      prepareBatch(document.querySelector('#batch-raw').value, {
        source: entry.batchSource,
        receipt: entry.receipt === true,
      });
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
document.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('[data-voice-control]');
  if (!button || button.disabled || !voiceCapture) return;
  event.preventDefault();
  voicePointer = event.pointerId;
  voiceStartY = event.clientY;
  voiceCancelled = false;
  button.setPointerCapture?.(event.pointerId);
  button.classList.add('recording');
  voiceCapture.start();
});
document.addEventListener('pointermove', (event) => {
  if (event.pointerId !== voicePointer) return;
  voiceCancelled = event.clientY < voiceStartY - 60;
  if (voiceCancelled) voiceState('松开即可取消，不会入账。');
});
document.addEventListener('pointerup', (event) => {
  if (event.pointerId !== voicePointer) return;
  voicePointer = null;
  event.target.closest('[data-voice-control]')?.classList.remove('recording');
  voiceCapture?.stop(voiceCancelled);
});
document.addEventListener('pointercancel', (event) => {
  if (event.pointerId === voicePointer) {
    voicePointer = null;
    voiceCapture?.stop(true);
    event.target.closest('[data-voice-control]')?.classList.remove('recording');
  }
});
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-voice-control]');
  if (button && !button.disabled && event.detail === 0 && voiceCapture) {
    if (voiceCapture.stream) voiceCapture.stop();
    else voiceCapture.start();
  }
});
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  e.preventDefault();
  if (el.dataset.action === 'close') {
    close();
    return;
  }
  if (el.dataset.action === 'dismissToast') {
    document.querySelector('#toast').hidden = true;
    return;
  }
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
      case 'profile-form':
        await commit((s) => L.setProfile(s, { name: v.name.trim() }));
        close();
        toast('名称已保存。');
        break;
      case 'batch-form':
        await batchSave(form);
        break;
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
    if (err.name !== 'AbortError') error(err);
  } finally {
    busy = false;
    document.body.removeAttribute('aria-busy');
  }
});
document.addEventListener('change', async (e) => {
  try {
    if (e.target.id === 'quick-input-enabled') {
      await commit((s) => (s.preferences.shortcutsEnabled = e.target.checked));
    }
    if (e.target.id === 'avatar-input') {
      const file = e.target.files[0];
      if (file) {
        const blob = await shrinkImage(file, { max: 400, pixels: 160000, quality: 0.9 });
        const id = L.id();
        await commit((s) => L.setProfile(s, { avatarId: id }), { attachments: [{ id, blob }] });
        profileUI();
      }
    }
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
    if (e.target.closest('#batch-form')) {
      const name = e.target.name,
        index = Number(name.split('-').at(-1));
      if (name.startsWith('candidate-'))
        document.querySelector('#batch-form').elements[`amount-${index}`].value = e.target.value
          ? Number(e.target.value) / 100
          : '';
      if (name.startsWith('include-')) {
        const section = e.target.closest('.batch-item');
        for (const input of section.querySelectorAll('input,select'))
          if (input !== e.target) input.disabled = !e.target.checked;
      }
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
  if (e.target.id === 'crop-top' || e.target.id === 'crop-bottom') {
    let top = Number(document.querySelector('#crop-top').value),
      bottom = Number(document.querySelector('#crop-bottom').value);
    if (bottom - top < 15) {
      if (e.target.id === 'crop-top') top = bottom - 15;
      else bottom = top + 15;
    }
    entry.cropTop = top;
    entry.cropBottom = bottom;
    document.querySelector('#crop-top').value = top;
    document.querySelector('#crop-bottom').value = bottom;
    document.querySelector('#crop-mask-top').style.height = top + '%';
    document.querySelector('#crop-mask-bottom').style.height = 100 - bottom + '%';
  }
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
      await loadProfilePicture();
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
  if (document.hidden) voiceCapture?.cancel();
  if (!document.hidden) {
    refreshRates();
    if (state && !busy && !sheet.open) processDue().catch(error);
  }
});
try {
  if (!globalThis.crypto?.subtle) throw Error('请使用 HTTPS 或本机 localhost 打开余记。');
  state = await DB.readLedger();
  await loadProfilePicture();
  T.setup();
  render();
  if ('serviceWorker' in navigator)
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .catch(() => {
        if (!navigator.serviceWorker.controller)
          toast('离线缓存暂不可用，联网后重新打开即可重试。');
      });
  await processDue();
  refreshRates();
  const params = new URLSearchParams(location.hash.slice(1) || location.search),
    entryMode = params.get('entry'),
    text = params.get('text');
  if (entryMode) {
    history.replaceState({}, '', location.pathname);
    if (entryMode === 'clipboard') quickInputUI();
    else
      entryStart(
        entryMode === 'ocr' ? 'ocr' : entryMode === 'voice' ? 'voice' : 'text',
        text?.slice(0, 12000) || '',
      );
  }
} catch (e) {
  content.innerHTML = `<div class="empty"><p>${esc(e.message)}</p><p class="helper">未删除任何历史内容。请重新打开后重试。</p></div>`;
}
