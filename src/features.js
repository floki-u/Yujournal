/* Pure date, achievement and local report helpers. All account values stay local. */
window.Yujournal = (() => {
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const money = (c) =>
    (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const months = [
    '一月',
    '二月',
    '三月',
    '四月',
    '五月',
    '六月',
    '七月',
    '八月',
    '九月',
    '十月',
    '十一月',
    '十二月',
  ];
  function periodInfo(date, period) {
    const [year, month] = date.split('-').map(Number);
    return {
      prefix: period === 'year' ? date.slice(0, 4) : period === 'month' ? date.slice(0, 7) : date,
      label:
        period === 'year'
          ? `${year} 年`
          : period === 'month'
            ? `${year} 年 ${month} 月`
            : `${year} 年 ${month} 月 ${Number(date.slice(8))} 日`,
      start:
        period === 'year'
          ? `${year}-01-01`
          : period === 'month'
            ? `${year}-${pad(month)}-01`
            : date,
      end:
        period === 'year'
          ? `${year}-12-31`
          : period === 'month'
            ? `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`
            : date,
    };
  }
  function statistics(data, date, period) {
    const info = periodInfo(date, period),
      rows = data.transactions
        .filter((t) => t.date.startsWith(info.prefix))
        .sort((a, b) => b.date.localeCompare(a.date));
    const sum = (type) =>
      rows
        .filter((t) => t.type === type)
        .reduce((n, t) => n + (t.baseAmount ?? Math.round(t.amount * t.rate)), 0);
    const assetBefore = (day) =>
      data.opening +
      data.transactions
        .filter((t) => t.date < day)
        .reduce(
          (n, t) =>
            n + (t.type === 'income' ? 1 : -1) * (t.baseAmount ?? Math.round(t.amount * t.rate)),
          0,
        );
    const inc = sum('income'),
      exp = sum('expense');
    return {
      ...info,
      rows,
      income: inc,
      expense: exp,
      net: inc - exp,
      days: new Set(rows.map((t) => t.date)).size,
      startBalance: info.start < data.openingDate ? null : assetBefore(info.start),
      endBalance:
        info.end < data.openingDate
          ? null
          : (info.start < data.openingDate ? data.opening : assetBefore(info.start)) + inc - exp,
      largest: rows
        .filter((t) => t.type === 'expense')
        .sort(
          (a, b) => (b.baseAmount ?? b.amount * b.rate) - (a.baseAmount ?? a.amount * a.rate),
        )[0],
    };
  }
  const badges = [
    {
      id: 'first',
      name: '第一笔',
      category: '记录',
      icon: 'book',
      description: '留下第一笔收入或支出',
      target: 1,
      progress: (d) => d.transactions.length,
      reward: '薄荷小岛主题',
    },
    {
      id: 'threeDays',
      name: '日子有迹',
      category: '记录',
      icon: 'leaf',
      description: '累计记录 3 个自然日',
      target: 3,
      progress: (d) => new Set(d.transactions.map((t) => t.date)).size,
    },
    {
      id: 'sevenDays',
      name: '一周拾光',
      category: '记录',
      icon: 'spark',
      description: '累计记录 7 个自然日',
      target: 7,
      progress: (d) => new Set(d.transactions.map((t) => t.date)).size,
    },
    {
      id: 'thirtyDays',
      name: '生活收藏家',
      category: '记录',
      icon: 'award',
      description: '累计记录 30 个自然日',
      target: 30,
      progress: (d) => new Set(d.transactions.map((t) => t.date)).size,
      reward: '星夜漫游主题',
    },
    {
      id: 'voice',
      name: '一句就好',
      category: '记录',
      icon: 'mic',
      description: '完成 5 笔一句话记录',
      target: 5,
      progress: (d) => d.transactions.filter((t) => /一句话|语音/.test(t.source)).length,
    },
    {
      id: 'backup',
      name: '安心守护',
      category: '守护',
      icon: 'shield',
      description: '导出一次完整的本机备份',
      target: 1,
      progress: (d) => (d.lastBackup ? 1 : 0),
      reward: '黄昏邮局主题',
    },
    {
      id: 'offline',
      name: '离线也从容',
      category: '守护',
      icon: 'cloudOff',
      description: '离线保存一笔记录',
      target: 1,
      progress: (d) => d.offlineRecords || 0,
    },
    {
      id: 'report',
      name: '月末来信',
      category: '守护',
      icon: 'chart',
      description: '保存一张收支报告长图',
      target: 1,
      progress: (d) => d.reportExports || 0,
      reward: '像素时光主题',
    },
    {
      id: 'goalStart',
      name: '小小起点',
      category: '存钱',
      icon: 'leaf',
      description: '为一个计划留存第一笔',
      target: 1,
      progress: (d) => (d.goals.some((g) => g.saved > 0) ? 1 : 0),
    },
    {
      id: 'goalHalf',
      name: '走到一半',
      category: '存钱',
      icon: 'plane',
      description: '一个存钱计划进度达到 50%',
      target: 50,
      progress: (d) => Math.floor(Math.max(0, ...d.goals.map((g) => (g.saved / g.target) * 100))),
    },
    {
      id: 'goalDone',
      name: '心愿有回声',
      category: '存钱',
      icon: 'award',
      description: '完成一个存钱计划',
      target: 1,
      progress: (d) => d.goals.filter((g) => g.saved >= g.target).length,
    },
    {
      id: 'twenty',
      name: '二十个瞬间',
      category: '记录',
      icon: 'edit',
      description: '累计留下 20 笔记录',
      target: 20,
      progress: (d) => d.transactions.length,
    },
  ];
  const themes = [
    {
      id: 'classic',
      name: '苔绿手账',
      kind: '安静手账',
      description: '暖白纸面与苔绿色，数字清晰。',
      badge: null,
      colors: ['#f8f8f2', '#e5eedf', '#43694c'],
    },
    {
      id: 'mint',
      name: '薄荷小岛',
      kind: '卡通陪伴',
      description: '小角色陪你记下日常，圆润而轻快。',
      badge: 'first',
      colors: ['#fff9ed', '#d8ead7', '#4b7b68'],
    },
    {
      id: 'postcard',
      name: '黄昏邮局',
      kind: '复古纸品',
      description: '像一张寄给未来自己的明信片。',
      badge: 'backup',
      colors: ['#f8eee2', '#e7cdc2', '#916450'],
    },
    {
      id: 'starlight',
      name: '星夜漫游',
      kind: '星空探索',
      description: '冷蓝与星光，给每一笔留一片天空。',
      badge: 'thirtyDays',
      colors: ['#edf2fa', '#cfdfed', '#426c8d'],
    },
    {
      id: 'pixel',
      name: '像素时光',
      kind: '复古游戏',
      description: '像素边角、等宽数字，收藏小成就。',
      badge: 'report',
      colors: ['#faf2dc', '#e5d6a4', '#726139'],
    },
  ];
  function awards(data) {
    data.unlockedBadges ??= [];
    data.unlockedThemes ??= ['classic'];
    let changed = false;
    for (const b of badges) {
      if (b.progress(data) >= b.target && !data.unlockedBadges.includes(b.id)) {
        data.unlockedBadges.push(b.id);
        changed = true;
      }
    }
    for (const t of themes) {
      if (
        (!t.badge || data.unlockedBadges.includes(t.badge)) &&
        !data.unlockedThemes.includes(t.id)
      ) {
        data.unlockedThemes.push(t.id);
        changed = true;
      }
    }
    return changed;
  }
  function calendar({ year, month, mode, selected, period, today, rows, yearPage }, icon) {
    const days = new Date(year, month, 0).getDate(),
      first = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const dateStats = new Map();
    for (const t of rows) {
      const flags = dateStats.get(t.date) || new Set();
      flags.add(t.type);
      dateStats.set(t.date, flags);
    }
    let grid = '';
    if (mode === 'day') {
      grid = `<div class="calendar-weekdays">${['一', '二', '三', '四', '五', '六', '日'].map((x) => `<span>${x}</span>`).join('')}</div><div class="calendar-days">${Array.from({ length: first }, () => '<span></span>').join('')}${Array.from(
        { length: days },
        (_, i) => {
          const key = `${year}-${pad(month)}-${pad(i + 1)}`,
            flags = dateStats.get(key);
          return `<button class="calendar-day ${key === selected ? 'selected' : ''} ${key === today ? 'is-today' : ''}" data-action="pickDate" data-date="${key}" aria-label="选择 ${year} 年 ${month} 月 ${i + 1} 日"><span>${i + 1}</span><i>${flags?.has('income') ? '<b class="income-dot"></b>' : ''}${flags?.has('expense') ? '<b class="expense-dot"></b>' : ''}</i></button>`;
        },
      ).join(
        '',
      )}</div><div class="calendar-legend"><span><i class="income-dot"></i>有收入</span><span><i class="expense-dot"></i>有支出</span><button data-action="pickDate" data-date="${today}">回到今天</button></div>`;
    }
    if (mode === 'month') {
      grid = `<div class="calendar-months">${Array.from({ length: 12 }, (_, i) => `<button data-action="pickMonth" data-month="${i + 1}" class="${i + 1 === month ? 'selected' : ''}">${i + 1} 月</button>`).join('')}</div>`;
    }
    if (mode === 'year') {
      grid = `<p class="helper">${yearPage}—${yearPage + 11} 年 · 可以直接输入年份跳转</p><form id="year-jump-form" class="year-jump"><input aria-label="直接输入年份" name="year" inputmode="numeric" type="number" min="1900" max="2100" value="${year}"><button class="secondary" type="submit">跳转</button></form><div class="calendar-years">${Array.from({ length: 12 }, (_, i) => `<button data-action="pickYear" data-year="${yearPage + i}" class="${yearPage + i === year ? 'selected' : ''}">${yearPage + i}</button>`).join('')}</div>`;
    }
    return `<div class="calendar-header"><button class="icon-button" data-action="calendarPrev" aria-label="上一页">${icon('left')}</button><div><button data-action="calendarMode" data-mode="year">${year} 年 ${icon('down')}</button>${mode !== 'year' ? `<button data-action="calendarMode" data-mode="month">${month} 月 ${icon('down')}</button>` : ''}</div><button class="icon-button" data-action="calendarNext" aria-label="下一页">${icon('arrow')}</button></div><div class="calendar-view-label">${mode === 'day' ? '选一天' : mode === 'month' ? '选月份' : '选年份'} · ${period === 'day' ? '按日查看' : period === 'month' ? '按月查看' : '按年查看'}</div>${grid}`;
  }
  function badgeById(id) {
    return badges.find((b) => b.id === id);
  }
  function themeById(id) {
    return themes.find((t) => t.id === id) || themes[0];
  }
  function drawPoster(data, stats, { palette, includeDetails, includeBadge, pageIndex = 0 }) {
    const rows = includeDetails ? stats.rows : [],
      pages = Math.max(1, Math.ceil(rows.length / 60)),
      slice = rows.slice(pageIndex * 60, (pageIndex + 1) * 60);
    const width = 1080,
      height = 1800 + (slice.length ? 150 + slice.length * 72 : 0),
      canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const { paper, ink, secondary, sage, leaf, clay, line } = palette;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);
    const font =
      palette.displayFont || '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const text = (value, x, y, size = 28, color = ink, weight = 400) => {
      ctx.fillStyle = color;
      ctx.font = `${weight >= 500 ? 600 : 400} ${size}px ${font}`;
      ctx.fillText(String(value), x, y);
    };
    const hr = (y) => {
      ctx.strokeStyle = line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(76, y);
      ctx.lineTo(1004, y);
      ctx.stroke();
    };
    const rounded = (x, y, w, h, r, fill) => {
      if (palette.family === 'pixel') r = 4;
      if (palette.family === 'postcard') r = 10;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    };
    const shorten = (v, size, maxWidth) => {
      ctx.font = `400 ${size}px ${font}`;
      let s = String(v);
      while (s.length && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
      return s === String(v) ? s : s + '…';
    };
    text('余记 / 日子的账本', 76, 110, 26, leaf, 550);
    text('RECEIPTS OF LIFE', 700, 110, 20, secondary);
    hr(148);
    const month = Number(stats.prefix.slice(5, 7)),
      year = stats.prefix.slice(0, 4);
    const headline =
      stats.prefix.length === 4
        ? `${year}，这一年。`
        : stats.prefix.length === 7
          ? `${months[month - 1]}，日子有迹可循。`
          : '这一天，记得清楚。';
    text(headline, 76, 260, 61, ink, 550);
    text(`${stats.label} · 收支报告`, 80, 328, 27, secondary);
    text('本期结余', 80, 434, 27, secondary);
    text('¥ ' + money(stats.net), 76, 540, 94, leaf, 550);
    text('收入减支出，每一笔都留下了记录。', 80, 603, 26, secondary);
    rounded(76, 660, 928, 232, 30, sage);
    text('收入', 114, 718, 24, secondary);
    text('¥ ' + money(stats.income), 112, 780, 47, ink, 500);
    text('支出', 590, 718, 24, secondary);
    text('¥ ' + money(stats.expense), 588, 780, 47, ink, 500);
    const max = Math.max(stats.income, stats.expense, 1);
    rounded(114, 831, 400, 8, 4, line);
    rounded(114, 831, Math.max(8, (400 * stats.income) / max), 8, 4, leaf);
    rounded(590, 831, 372, 8, 4, line);
    rounded(590, 831, Math.max(8, (372 * stats.expense) / max), 8, 4, clay);
    text('那些被记下的日常', 80, 996, 39, ink, 550);
    text(`${stats.rows.length}`, 80, 1082, 57, ink, 500);
    text('笔收支', 80, 1125, 24, secondary);
    text(`${stats.days}`, 398, 1082, 57, ink, 500);
    text('个有记录的日子', 398, 1125, 24, secondary);
    const average = stats.days ? Math.round(stats.expense / stats.days) : 0;
    text('¥ ' + money(average), 710, 1082, 42, ink, 500);
    text('记录日平均支出', 710, 1125, 24, secondary);
    hr(1179);
    text('余额也有来处', 80, 1260, 39, ink, 550);
    text('期初已记录余额', 80, 1336, 25, secondary);
    text(
      stats.startBalance === null ? '尚无期初记录' : '¥ ' + money(stats.startBalance),
      650,
      1336,
      stats.startBalance === null ? 25 : 35,
      ink,
      500,
    );
    text('期末已记录余额', 80, 1398, 25, secondary);
    text(
      stats.endBalance === null ? '尚未建立资产记录' : '¥ ' + money(stats.endBalance),
      650,
      1398,
      stats.endBalance === null ? 25 : 35,
      leaf,
      500,
    );
    text(
      stats.largest
        ? `本期最大一笔 · ${shorten(stats.largest.title, 27, 440)}`
        : '本期没有记录支出',
      80,
      1488,
      27,
      secondary,
    );
    if (stats.largest)
      text(
        '¥ ' +
          money(stats.largest.baseAmount ?? Math.round(stats.largest.amount * stats.largest.rate)),
        720,
        1488,
        30,
        ink,
        500,
      );
    const worn = includeBadge ? badgeById(data.wornBadge) : null;
    if (worn) {
      rounded(76, 1540, 928, 92, 24, sage);
      text('佩戴徽章 / ' + worn.name, 112, 1597, 29, leaf, 500);
      text('记录生活的小纪念', 630, 1597, 24, secondary);
    }
    let y = 1715;
    if (slice.length) {
      hr(y - 35);
      text('账目明细', 80, y + 24, 38, ink, 550);
      text(`第 ${pageIndex + 1} / ${pages} 张`, 796, y + 24, 23, secondary);
      y += 100;
      for (const t of slice) {
        text(t.date.slice(5).replace('-', '/'), 80, y, 25, secondary);
        text(shorten(t.title, 28, 440), 246, y, 28, ink);
        ctx.textAlign = 'right';
        text(
          `${t.type === 'income' ? '+' : '−'}${money(t.baseAmount ?? Math.round(t.amount * t.rate))}`,
          996,
          y,
          30,
          t.type === 'income' ? leaf : ink,
          500,
        );
        ctx.textAlign = 'left';
        ctx.strokeStyle = line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(80, y + 24);
        ctx.lineTo(1000, y + 24);
        ctx.stroke();
        y += 72;
      }
    }
    hr(height - 102);
    text('账目留在本机 · 股票亏损计入普通支出', 80, height - 54, 22, secondary);
    ctx.textAlign = 'right';
    text(
      '本机账本 / ' + dateKey(new Date()).replaceAll('-', '.'),
      1000,
      height - 54,
      20,
      secondary,
    );
    ctx.textAlign = 'left';
    return { canvas, pages };
  }
  return {
    dateKey,
    periodInfo,
    statistics,
    badges,
    themes,
    awards,
    calendar,
    badgeById,
    themeById,
    drawPoster,
    money,
  };
})();
