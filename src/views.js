/* Presentation helpers. Accounting state and commands live in app.js. */
window.YujournalViews = (() => {
  const F = window.Yujournal,
    T = window.YujournalThemes;
  function periodBar({ period, periodDate, icon }, context) {
    return `<div class="period-bar"><div class="period-switch">${[
      ['day', '日'],
      ['month', '月'],
      ['year', '年'],
    ]
      .map(
        ([p, label]) =>
          `<button data-action="setPeriod" data-value="${p}" class="${period === p ? 'active' : ''}">${label}</button>`,
      )
      .join(
        '',
      )}</div><button class="period-date" data-action="calendar" data-context="${context}" aria-label="选择${context === 'report' ? '报告' : '账本'}日期">${F.periodInfo(periodDate, period).label}${icon('down')}</button></div>`;
  }
  function home(c) {
    const { head, data, selectedDay, icon, esc, transactionRow, dailyFilter, theme } = c,
      s = F.statistics(data, selectedDay, 'day'),
      d = new Date(`${selectedDay}T12:00:00`),
      monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const rows = s.rows.filter((t) => dailyFilter === 'all' || t.type === dailyFilter);
    return `${head()}${T.masthead({ selectedDay, stats: s, dayName: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()], icon, esc, data })}<section class="daily-pair"><div class="daily-tile"><p class="eyebrow">当日支出</p><p class="daily-money" style="font-size:${Math.min(33, 240 / F.money(s.expense).length)}px"><small>¥</small>${F.money(s.expense)}</p><p class="caption">${s.rows.filter((t) => t.type === 'expense').length} 笔支出记录</p></div><div class="daily-tile income"><p class="eyebrow">当日收入</p><p class="daily-money" style="font-size:${Math.min(33, 210 / F.money(s.income).length)}px"><small>¥</small>${F.money(s.income)}</p><p class="caption">${s.rows.filter((t) => t.type === 'income').length} 笔收入记录</p></div></section><div class="quick-entry"><button data-action="record">${icon('mic')} 语音记账</button><button data-action="photo">${icon('photo')} 识别付款截图</button></div><div class="week-strip">${Array.from(
      { length: 7 },
      (_, i) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + i);
        const key = F.dateKey(day);
        return `<button class="week-day ${key === selectedDay ? 'active' : ''}" data-action="dayQuick" data-date="${key}" aria-label="查看 ${key} 收支"><span>${['一', '二', '三', '四', '五', '六', '日'][i]}</span><strong>${day.getDate()}</strong>${data.transactions.some((t) => t.date === key) ? '<i></i>' : '<i style="opacity:0"></i>'}</button>`;
      },
    ).join(
      '',
    )}</div><div class="section-head"><h2>${selectedDay === F.dateKey(new Date()) ? '今天' : '当天'}的记录</h2><div class="filter-row small">${[
      ['all', '全部'],
      ['expense', '支出'],
      ['income', '收入'],
    ]
      .map(
        ([v, label]) =>
          `<button class="filter-chip ${dailyFilter === v ? 'active' : ''}" data-action="dailyFilter" data-value="${v}">${label}</button>`,
      )
      .join(
        '',
      )}</div></div><div class="today-list">${rows.length ? rows.map(transactionRow).join('') : `<div class="empty">${icon('book')}<p>这一天还没有${dailyFilter === 'income' ? '收入' : dailyFilter === 'expense' ? '支出' : '收支'}记录。<br>记一笔，或者用日历看看其他日期。</p></div>`}</div><div class="daily-bottom"><span>只看这一天，记录更专心。</span><span class="pill">${icon('shield')} 本机账本</span></div>`;
  }
  function ledger(c) {
    const {
        head,
        data,
        icon,
        amount,
        period,
        periodDate,
        filter,
        query,
        esc,
        transactionRow,
        balance,
      } = c,
      s = F.statistics(data, periodDate, period);
    let last = '';
    const matches = s.rows.filter(
      (t) => (filter === 'all' || t.type === filter) && (!query || t.title.includes(query)),
    );
    const rows = matches.slice(0, c.ledgerLimit);
    return `${head('账本')}${periodBar(c, 'ledger')}<section class="ledger-summary"><p class="eyebrow">${period === 'year' ? '本年' : period === 'month' ? '本月' : '当日'}结余</p>${amount(s.net, 'money-large')}<div class="monthly-split"><div><p class="metric-label">收入</p><p class="metric-number">¥ ${F.money(s.income)}</p></div><div><p class="metric-label">支出</p><p class="metric-number">¥ ${F.money(s.expense)}</p></div></div></section><button class="asset-inline" data-action="assets">${icon('wallet')}<div><strong>我的资产余额</strong><p>期初资产 + 累计收入 − 累计支出</p></div><span>¥ ${F.money(balance())}</span>${icon('arrow')}</button><div class="section-head"><h2>这段时间的明细</h2><button class="text-button" data-action="report">收支报告 ${icon('arrow')}</button></div><div class="filter-row">${[
      ['all', '全部'],
      ['expense', '支出'],
      ['income', '收入'],
    ]
      .map(
        ([v, label]) =>
          `<button class="filter-chip ${filter === v ? 'active' : ''}" data-action="filter" data-value="${v}">${label}</button>`,
      )
      .join(
        '',
      )}</div><input class="search" id="ledger-search" type="search" aria-label="搜索账目" placeholder="搜索备注，如房租、工资" value="${esc(query)}">${
      rows
        .map((t) => {
          const label =
            t.date === last
              ? ''
              : `<div class="ledger-date" style="margin-top:16px"><span>${t.date}</span></div>`;
          last = t.date;
          return label + transactionRow(t);
        })
        .join('') || `<div class="empty">${icon('search')}<p>所选期间没有符合条件的账目。</p></div>`
    }${matches.length > rows.length ? `<button class="secondary" style="width:100%;margin-top:20px" data-action="loadMore">再显示 50 笔</button>` : ''}<p class="ledger-page-info">已显示 ${rows.length} / ${matches.length} 笔</p>`;
  }
  function my(c) {
    const { head, data, icon, settingsRow } = c,
      worn = F.badgeById(data.wornBadge),
      theme = F.themeById(data.theme);
    return `${head('我的')}<div class="profile-card"><button class="profile-avatar" data-action="profile" aria-label="编辑头像">${c.profileAvatar()}${worn ? `<span class="worn-badge">${icon(worn.icon)}</span>` : ''}</button><div><button class="profile-name-button" data-action="profile"><strong>${c.esc(data.profileName)}</strong><span>编辑资料</span></button><p>${worn ? '正在佩戴 · ' + worn.name : '还没有佩戴徽章'}</p></div><button class="text-button" data-action="badges">换一枚 ${icon('arrow')}</button></div><div class="settings-group">${settingsRow('award', '徽章中心', `${data.unlockedBadges.length} / ${F.badges.length} 枚已获得 · 佩戴与收藏`, 'badges')}${settingsRow('spark', '主题衣橱', `${theme.name} · ${data.unlockedThemes.length} 套已解锁`, 'themes')}${settingsRow('globe', '自动汇率', data.fxInfo?.fetchedAt ? '最新参考汇率已缓存' : '联网自动获取，离线继续用缓存', 'rates')}${settingsRow('repeat', '固定收支', '每个模板单独选择入账方式', 'recurring')}</div><div class="settings-group">${settingsRow('chart', '收支报告', '日、月、年 · 可保存到照片', 'report')}${settingsRow('backup', '导出完整备份', data.lastBackup ? '已备份 · 安心守护徽章已获得' : '给历史留底，还能解锁风物来信主题', 'backup')}${settingsRow('upload', '导入完整备份', '校验、预览、合并或恢复', 'import')}${settingsRow('phone', '安装与 Web Clip', 'Safari 主屏幕 · 描述文件安装', 'install')}</div><div class="settings-group">${settingsRow('phone', '本机储存与离线识别', '查看容量，管理识别资源', 'storage')}${settingsRow('mic', '快捷指令与小组件入口', '截图分享、语音入口与安装说明', 'shortcuts')}</div><p class="version">Yujournal v0.2.2 · 余记<br>账目、截图不上传 · 定期导出完整备份<br>离线识别模型按需下载</p>`;
  }
  function badgesPage(c) {
    const { head, data, icon, badgeFilter } = c;
    const badges = F.badges.filter((b) => badgeFilter === 'all' || b.category === badgeFilter);
    return `${head('徽章中心', true)}<div class="page-intro"><h1 class="page-title">生活的小纪念。</h1><p class="subline">获得之后永久收藏，选一枚戴在你的账本上。</p></div><div class="badge-count"><span><strong>${data.unlockedBadges.length}</strong> / ${F.badges.length} 枚已获得</span><span>${F.badgeById(data.wornBadge)?.name || '尚未佩戴'}</span></div><div class="filter-row">${['all', '记录', '存钱', '守护'].map((cat) => `<button class="filter-chip ${badgeFilter === cat ? 'active' : ''}" data-action="badgeFilter" data-value="${cat}">${cat === 'all' ? '全部' : cat}</button>`).join('')}</div><div class="badges-grid">${badges
      .map((b) => {
        const unlocked = data.unlockedBadges.includes(b.id),
          wearing = data.wornBadge === b.id,
          progress = Math.min(b.target, b.progress(data));
        return `<article class="badge-card"><div class="badge-medal ${unlocked ? '' : 'locked'}">${icon(b.icon)}</div><h3>${b.name}</h3><p>${b.description}</p><div class="progress-track"><span style="width:${Math.min(100, (progress / b.target) * 100)}%"></span></div><span class="badge-progress">${unlocked ? '已永久获得' : `${progress} / ${b.target}`}</span><span class="badge-reward">${b.reward ? '解锁 ' + b.reward : ''}</span><button data-action="wearBadge" data-id="${b.id}" class="${wearing ? 'wearing' : ''}" ${unlocked ? '' : 'disabled'}>${wearing ? '佩戴中 · 点击取下' : unlocked ? '佩戴这枚' : '尚未获得'}</button></article>`;
      })
      .join(
        '',
      )}</div><p class="helper" style="margin-top:20px">徽章与主题随完整备份一起迁移。玩法奖励记录习惯、备份和目标进度。</p>`;
  }
  function themesPage(c) {
    const { head, data, icon, previewTheme } = c;
    return `${head('主题衣橱', true)}<div class="page-intro"><h1 class="page-title">换个样子，继续记。</h1><p class="subline">默认主题跟随系统。特殊主题各有完整的场景、材质与交互。</p></div>${
      T.current().mode
        ? `<div class="world-mode-note">当前主题：${T.current().name} · ${T.current().mood}<br>这套主题使用专属氛围。默认主题可跟随系统切换深浅。</div>`
        : `<div class="mode-chooser">${[
            ['system', '跟随系统'],
            ['light', '浅色'],
            ['dark', '深色'],
          ]
            .map(
              ([mode, name]) =>
                `<button class="${data.displayMode === mode ? 'active' : ''}" data-action="setMode" data-value="${mode}">${name}</button>`,
            )
            .join('')}</div>`
    }${F.themes
      .map((t) => {
        const unlocked = data.unlockedThemes.includes(t.id),
          current = data.theme === t.id,
          badge = F.badgeById(t.badge);
        return `<article class="theme-card">${T.themeCardMini(t.id)}<div><h3>${t.name}</h3><p class="theme-type">${t.kind} · ${T.worlds[t.id].mood}</p><p>${t.description}</p><div class="world-features">${t.features.map((feature) => `<span>${feature}</span>`).join('')}</div><p style="margin-top:4px;color:var(--leaf)">${unlocked ? '已永久解锁' : `获得“${badge.name}”后解锁`}</p><div class="theme-actions"><button data-action="previewTheme" data-id="${t.id}">看看效果</button><button class="theme-use" data-action="useTheme" data-id="${t.id}" ${unlocked ? '' : 'disabled'}>${current ? '正在使用' : unlocked ? '穿上这套' : '待解锁'}</button></div></div></article>`;
      })
      .join(
        '',
      )}<p class="helper">默认主题与系统深浅模式一直可用。特殊主题保持各自完整的氛围，未解锁也能预览。</p>`;
  }
  function report(c) {
    const { head, data, periodDate, period, icon, amount } = c,
      s = F.statistics(data, periodDate, period),
      label =
        period === 'year'
          ? `${periodDate.slice(0, 4)}，这一年。`
          : period === 'month'
            ? `${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][Number(periodDate.slice(5, 7)) - 1]}月，日子有迹可循。`
            : '这一天，记得清楚。';
    const values =
      period === 'year'
        ? Array.from({ length: 12 }, (_, i) =>
            s.rows
              .filter((t) => t.type === 'expense' && Number(t.date.slice(5, 7)) === i + 1)
              .reduce((n, t) => n + t.baseAmount, 0),
          )
        : period === 'month'
          ? Array.from({ length: 5 }, (_, i) =>
              s.rows
                .filter(
                  (t) => t.type === 'expense' && Math.ceil(Number(t.date.slice(8)) / 7) === i + 1,
                )
                .reduce((n, t) => n + t.baseAmount, 0),
            )
          : s.rows.filter((t) => t.type === 'expense').map((t) => t.baseAmount);
    const max = Math.max(...values, 1);
    return `${head('收支报告', true)}${periodBar(c, 'report')}<section class="report-hero"><p class="eyebrow">YUJI / RECEIPTS OF LIFE</p><h1>${label}</h1><p style="margin-top:12px">${s.label} · 每一笔日常，都值得被记下。</p><div class="report-ribbon"></div><p>本期结余</p>${amount(s.net, 'money-large')}<p>收入减支出，余额与明细都有来处。</p></section><div class="report-split"><div><p class="eyebrow">收入</p><strong class="positive">${F.money(s.income)}</strong></div><div><p class="eyebrow">支出</p><strong>${F.money(s.expense)}</strong></div></div><div class="report-mini-stats"><div><strong>${s.rows.length}</strong><span>笔收支</span></div><div><strong>${s.days}</strong><span>个有记录的日子</span></div><div><strong>${s.days ? Math.round(s.expense / s.days / 100) : 0}</strong><span>元 / 记录日平均支出</span></div></div><div class="section-head"><h2>消费的节奏</h2><span class="caption">${period === 'year' ? '每月' : period === 'month' ? '每周' : '逐笔'}</span></div><div class="bar-chart">${values.map((v, i) => `<div class="bar-column"><div class="bar ${v === max ? 'selected' : ''}" style="height:${Math.max(2, (v / max) * 98)}px"></div><small>${period === 'year' ? i + 1 + '月' : period === 'month' ? '第' + (i + 1) + '周' : i + 1}</small></div>`).join('')}</div><div class="section-head"><h2>余额的来处</h2><button class="text-button" data-action="assets">资产 ${icon('arrow')}</button></div><div class="detail-line"><span>期初已记录余额</span><strong>${s.startBalance === null ? '尚无期初记录' : '¥ ' + F.money(s.startBalance)}</strong></div><div class="detail-line"><span>期末已记录余额</span><strong>${s.endBalance === null ? '尚未建立资产记录' : '¥ ' + F.money(s.endBalance)}</strong></div><p class="report-note">股票亏损按普通支出记录，外币按记账时的汇率折算。<br>长图默认保留摘要，你可以选择是否附上全部明细和佩戴徽章。</p><button class="primary" data-action="reportCard">${icon('photo')} 制作我的报告长图</button><button class="secondary" style="width:100%;margin-top:12px" data-action="reportDetails">${icon('book')} 查看这段时间的明细</button>`;
  }
  function poster(c) {
    return `${c.head('报告长图', true)}<h1 class="page-title">把这段日子，留下来。</h1><p class="subline">整张长图本机生成，保存为 PNG。</p><div class="report-controls"><label class="toggle-row"><span>附上全部账目明细</span><input type="checkbox" id="poster-details" ${c.includeDetails ? 'checked' : ''}></label><label class="toggle-row"><span>展示我佩戴的徽章</span><input type="checkbox" id="poster-badge" ${c.includeBadge ? 'checked' : ''}></label></div><div id="poster-preview" class="report-preview-wrap"></div><div id="poster-pager"></div><p class="poster-caption">默认精美摘要。明细很多时自动分张，避免截断。<br>点保存后，在系统分享面板选择“存储图像”；不支持分享时可长按图片保存。</p><div class="report-save-bar"><button class="primary" data-action="savePoster">${c.icon('backup')} 保存到照片</button><button class="secondary" data-action="sharePoster" aria-label="分享或存储报告长图">${c.icon('upload')}</button></div>`;
  }
  return { home, ledger, my, badgesPage, themesPage, report, poster, periodBar };
})();
