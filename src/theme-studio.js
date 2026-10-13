/* Four themed worlds around the same ledger. Artwork is local and optional;
   motion runs only on deliberate interaction and respects reduced motion. */
window.YujournalThemes = (() => {
  const worlds = {
    classic: {
      name: '余记 · 原生',
      kind: '默认主题',
      mood: '自适应',
      mode: null,
      description: '暖白日间、石墨夜间；清晰安静的日常账本。',
      features: ['系统深浅', '原生图标', '轻触反馈'],
    },
    mint: {
      name: '薄荷小岛',
      kind: '角色与花园',
      mood: '明亮晨光',
      mode: 'light',
      background: 'assets/mint-bg.webp',
      avatar: 'assets/mint-avatar.png',
      title: '今天的小账本',
      kicker: 'MINT ISLAND / 日常花园',
      description: '角色住进花园，纸卡、叶片图标和轻快反馈组成同一个小世界。',
      features: ['手作场景', '角色头像', '叶片反馈', '柔软纸卡'],
    },
    postcard: {
      name: '风物来信',
      kind: '纸品与邮局',
      mood: '温暖日光',
      mode: 'light',
      background: 'assets/postcard-bg.webp',
      avatar: 'assets/postcard-avatar.png',
      title: '今天的账页',
      kicker: 'LETTER NO. / 把日子寄给未来',
      description: '邮政插画、纸纹、猫头鹰信使、邮戳日期与收据式明细。',
      features: ['纸纹背景', '邮戳日期', '宋体标题', '翻页反馈'],
    },
    starlight: {
      name: '月海玻璃',
      kind: '月海与观测站',
      mood: '深蓝夜间',
      mode: 'dark',
      background: 'assets/starlight-bg.webp',
      avatar: 'assets/starlight-avatar.png',
      title: '今日观测日志',
      kicker: 'LUNAR OBSERVATORY / 本机记录',
      description: '月海夜景中漂浮的玻璃面板，兔子观察员与触摸光晕。',
      features: ['月海壁纸', '玻璃材质', '轨道图标', '触摸高光'],
    },
    pixel: {
      name: '像素冒险',
      kind: '像素与村庄',
      mood: '紫暮夜间',
      mode: 'dark',
      background: 'assets/pixel-bg.webp',
      avatar: 'assets/pixel-avatar.png',
      title: '今天的存档',
      kicker: 'LOCAL SAVE / 日常冒险',
      description: '16 位村庄、狐狸伙伴、像素字体与图标，记录成功时亮起存档反馈。',
      features: ['像素场景', '狐狸头像', '像素字形', '存档动画'],
    },
  };
  const pixelPaths = {
    home: 'M7 1h2v2h2v2h2v2h2v2h-2v6H3V9H1V7h2V5h2V3h2V1Zm-2 7v5h2V9h2v4h2V8H9V6H7v2H5Z',
    book: 'M3 1h10v2h1v12H3v-1H1V3h2V1Zm2 2v8h7V3H5Zm-2 9v1h9v-1H3Zm4-7h4v1H7V5Zm0 3h3v1H7V8Z',
    wallet: 'M3 2h10v2H3v1h11v2h1v6h-1v1H3v-1H1V4h1V3h1V2Zm0 5v5h8V9h2V7H3Zm9 3v1h1v-1h-1Z',
    plus: 'M6 1h4v5h5v4h-5v5H6v-5H1V6h5V1Z',
    leaf: 'M9 1h6v6h-2v2h-2v2H7v2H5v2H2v-2h1v-2h2V9H3V5h2V3h4V1Zm0 3v2H7v2h2V6h2V4H9Z',
    user: 'M5 1h6v2h2v6h-2v1h3v2h1v3H1v-3h1v-2h3V9H3V3h2V1Zm1 2v4h4V3H6Zm-2 9v1h8v-1H4Z',
    mic: 'M6 1h4v1h1v7h-1v1H6V9H5V2h1V1ZM3 6h1v4h2v2h4v-2h2V6h1v5h-1v1h-2v1H9v2H7v-2H6v-1H4v-1H3V6Z',
    photo: 'M1 2h14v12H1V2Zm2 2v8h2v-2h2V8h2V6h2v2h2V4H3Zm2 1h2v2H5V5Z',
    food: 'M2 1h1v4h1V1h1v4h1V1h1v6H5v8H3V7H1V1h1Zm10 0h2v14h-2V8h-2V3h1V2h1V1Z',
    coffee: 'M2 5h9v1h3v1h1v3h-1v1h-3v3H2V5Zm9 3v1h2V8h-2ZM3 1h1v2H3V1Zm4 0h1v2H7V1Z',
    chart: 'M1 1h2v12h12v2H1V1Zm4 7h2v3H5V8Zm4-4h2v7H9V4Zm4-2h2v9h-2V2Z',
    shield:
      'M7 1h2v1h3v1h3v7h-2v2h-2v2H9v1H7v-1H5v-2H3v-2H1V3h3V2h3V1Zm-3 5v2h2v2h2V8h2V6h2V4h-2v2H8v2H6V6H4Z',
    award: 'M5 1h6v1h2v2h1v5h-2v2h-1v4H9v-2H7v2H5v-4H4V9H2V4h1V2h2V1Zm1 3v4h4V4H6Z',
    spark: 'M7 1h2v4h2v2h4v2h-4v2H9v4H7v-4H5V9H1V7h4V5h2V1Z',
    trend: 'M1 2h2v2h2v2h2v2h2V6h2v4h2V8h2v7H8v-2h3v-1H9v-2H7V8H5V6H3V4H1V2Z',
    bag: 'M5 1h6v1h1v3h3v10H1V5h3V2h1V1Zm1 2v2h4V3H6Zm-3 4v6h10V7H3Z',
    edit: 'M11 1h2v1h1v1h1v2h-2V3h-2V1ZM9 3h2v2H9V3ZM7 5h2v2H7V5ZM5 7h2v2H5V7ZM3 9h2v2H3V9ZM1 11h2v2h2v2H1v-4Z',
    clock:
      'M5 1h6v1h2v2h1v2h1v4h-1v2h-1v2h-2v1H5v-1H3v-2H2v-2H1V6h1V4h1V2h2V1Zm1 2v1H4v2H3v4h1v2h2v1h4v-1h2v-2h1V6h-1V4h-2V3H6Zm1 2h2v3h2v2H7V5Z',
    down: 'M3 5h10v2h-2v2H9v2H7V9H5V7H3V5Z',
    arrow: 'M6 2h2v2h2v2h2v4h-2v2H8v2H6v-2h2v-2h2V6H8V4H6V2Z',
    left: 'M8 2h2v2H8v2H6v4h2v2h2v2H8v-2H6v-2H4V6h2V4h2V2Z',
    close: 'M2 2h3v2h2v2h2V4h2V2h3v3h-2v2h-2v2h2v2h2v3h-3v-2H9v-2H7v2H5v2H2v-3h2V9h2V7H4V5H2V2Z',
    check: 'M1 7h2v2h2v2h2V9h2V7h2V5h2V3h2v4h-2v2h-2v2H9v2H7v2H5v-2H3v-2H1V7Z',
    backup: 'M7 1h2v7h4v2h-2v2H9v2H7v-2H5v-2H3V8h4V1ZM1 12h2v2h10v-2h2v4H1v-4Z',
    upload: 'M7 1h2v2h2v2h2v2H9v7H7V7H3V5h2V3h2V1ZM1 12h2v2h10v-2h2v4H1v-4Z',
    globe:
      'M5 1h6v1h2v2h1v2h1v4h-1v2h-1v2h-2v1H5v-1H3v-2H2v-2H1V6h1V4h1V2h2V1Zm2 2V2H5v2H4v3h3V3Zm2 0v4h3V4h-1V2H9v1ZM3 9v3h2v1h2V9H3Zm6 0v4h2v-1h2V9H9Z',
  };
  const postal = {
    book: '<path d="M3 5h18v14H3z"></path><path d="m3 5 9 8 9-8M3 19l6-7M21 19l-6-7"></path>',
    home: '<path d="M4 10 12 3l8 7v11H4zM9 21v-7h6v7"></path><path d="M16 3v3"></path>',
    leaf: '<path d="M12 21V8M12 14c-7 0-9-5-8-9 6-1 8 3 8 9ZM12 17c7 0 9-5 8-9-6-1-8 3-8 9Z"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path><circle cx="12" cy="12" r="10" stroke-dasharray="1 2"></circle>',
  };
  const lunar = {
    home: '<path d="M4 11 12 4l8 7v9H4zM9 20v-6h6v6"></path><circle cx="19" cy="4" r="1"></circle>',
    book: '<circle cx="12" cy="12" r="7"></circle><ellipse cx="12" cy="12" rx="11" ry="4" transform="rotate(-32 12 12)"></ellipse><path d="M12 8v8M8 12h8"></path>',
    leaf: '<circle cx="12" cy="12" r="8"></circle><path d="M8 4c7 3 8 10 5 16M4 12h16"></path>',
    user: '<circle cx="12" cy="10" r="6"></circle><path d="M9 17v4M15 17v4M8 21h8M7 11h10M8 9h8"></path>',
    plus: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v10M7 12h10"></path>',
    spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"></path>',
  };
  function current() {
    return worlds[document.body.dataset.theme] || worlds.classic;
  }
  function icon(name, fallback) {
    const id = document.body.dataset.theme || 'classic';
    if (id === 'pixel' && pixelPaths[name])
      return `<svg class="themed-icon pixel-icon" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" stroke="none"><path d="${pixelPaths[name]}"></path></svg>`;
    if (id === 'postcard' && postal[name])
      return `<svg class="themed-icon postal-icon" viewBox="0 0 24 24" aria-hidden="true">${postal[name]}</svg>`;
    if (id === 'starlight' && lunar[name])
      return `<svg class="themed-icon lunar-icon" viewBox="0 0 24 24" aria-hidden="true">${lunar[name]}</svg>`;
    return fallback.replace('<svg ', '<svg class="themed-icon" ');
  }
  function avatar(fallback, hero = false) {
    const w = current();
    return w.avatar
      ? `<img class="world-avatar ${hero ? 'hero-avatar' : ''}" src="${w.avatar}" alt="${w.name}主题头像">`
      : fallback;
  }
  function masthead({ selectedDay, stats, dayName, icon, esc, data }) {
    const w = current();
    if (!w.mode)
      return `<section class="day-intro"><div><h1>${selectedDay === window.Yujournal.dateKey(new Date()) ? '今天，记下来。' : `${Number(selectedDay.slice(5, 7))} 月 ${Number(selectedDay.slice(8))} 日`}</h1><p>${dayName} · ${stats.rows.length} 笔收支记录</p></div><span class="today-label">${selectedDay === window.Yujournal.dateKey(new Date()) ? 'TODAY' : '那一天'}</span></section>`;
    const heading =
      selectedDay === window.Yujournal.dateKey(new Date())
        ? w.title
        : `${Number(selectedDay.slice(5, 7))} 月 ${Number(selectedDay.slice(8))} 日`;
    const side =
      document.body.dataset.theme === 'postcard'
        ? `<button class="postal-date" data-action="calendar" data-context="home" aria-label="打开邮戳日期日历"><small>YUJI / ${selectedDay.slice(0, 4)}</small><strong>${selectedDay.slice(5).replace('-', '·')}</strong><span>LOCAL LETTER</span></button>`
        : document.body.dataset.theme === 'pixel'
          ? `<div class="pixel-level"><span>LV.${Math.max(1, Math.floor(data.unlockedBadges.length / 3) + 1)}</span>${avatar(icon('user'), true)}</div>`
          : `<button class="world-portrait" data-action="settings" aria-label="打开主题个人账本">${avatar(icon('user'), true)}</button>`;
    return `<section class="world-hero"><div class="world-title"><p class="world-kicker">${document.body.dataset.theme === 'pixel' ? `SAVE / ${selectedDay.replaceAll('-', '.')}` : w.kicker}</p><h1>${esc(heading)}</h1><p class="world-date">${dayName} · ${stats.rows.length} 笔收支记录</p></div>${side}</section>`;
  }
  function themeCardMini(id) {
    const w = worlds[id];
    return w.background
      ? `<div class="theme-scene-mini" style="background-image:url('${w.background.replace('-bg.webp', '-thumb.webp')}')">${w.avatar ? `<img src="${w.avatar}" alt="${w.name}头像">` : ''}</div>`
      : '<div class="theme-scene-mini classic-mini"><span>余</span><i></i></div>';
  }
  function apply(id, mode) {
    const w = worlds[id] || worlds.classic;
    document.body.dataset.theme = id;
    document.body.dataset.mode = w.mode || mode;
    const app = document.getElementById('app');
    app.style.setProperty('--world-image', w.background ? `url("${w.background}")` : 'none');
    if (!document.getElementById('theme-world')) {
      const world = document.createElement('div');
      world.id = 'theme-world';
      world.setAttribute('aria-hidden', 'true');
      app.prepend(world);
      const feedback = document.createElement('div');
      feedback.id = 'world-feedback';
      feedback.hidden = true;
      feedback.setAttribute('aria-hidden', 'true');
      app.append(feedback);
    }
    document.documentElement.dataset.motion = matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'reduced'
      : 'full';
  }
  function feedback(kind) {
    const w = current();
    if (!w.mode) return;
    const app = document.getElementById('app');
    app.classList.remove('world-saved', 'world-page-turn');
    void app.offsetWidth;
    app.classList.add(kind === 'date' ? 'world-page-turn' : 'world-saved');
    const el = document.getElementById('world-feedback');
    if (kind === 'saved' && el) {
      el.innerHTML =
        document.body.dataset.theme === 'mint'
          ? '<span>又记清楚一笔</span><b>✦</b>'
          : document.body.dataset.theme === 'pixel'
            ? '<span>SAVED +1</span><b>+</b>'
            : document.body.dataset.theme === 'postcard'
              ? '<span>已收进账页</span>'
              : '<span>记录已归档</span><b>✧</b>';
      el.hidden = false;
      clearTimeout(feedback.timer);
      feedback.timer = setTimeout(() => {
        el.hidden = true;
        app.classList.remove('world-saved', 'world-page-turn');
      }, 950);
    } else setTimeout(() => app.classList.remove('world-page-turn'), 300);
  }
  let frame = 0;
  function setup() {
    document.addEventListener('pointerdown', (event) => {
      const card = event.target.closest(
        '.daily-tile,.week-day,.primary,.quick-entry button,.nav-add,.goal-card,.calendar-day',
      );
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--touch-x', `${event.clientX - r.left}px`);
      card.style.setProperty('--touch-y', `${event.clientY - r.top}px`);
      card.classList.add('world-touch');
      setTimeout(() => card.classList.remove('world-touch'), 350);
    });
    document.addEventListener(
      'pointermove',
      (event) => {
        if (document.body.dataset.theme !== 'starlight' || event.pointerType === 'touch') return;
        const card = event.target.closest('.daily-tile,.quick-entry button,.goal-card');
        if (!card) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const r = card.getBoundingClientRect();
          card.style.setProperty('--touch-x', `${event.clientX - r.left}px`);
          card.style.setProperty('--touch-y', `${event.clientY - r.top}px`);
        });
      },
      { passive: true },
    );
    document.addEventListener('visibilitychange', () =>
      document.body.classList.toggle('world-paused', document.hidden),
    );
  }
  return { worlds, current, icon, avatar, masthead, themeCardMini, apply, feedback, setup };
})();
