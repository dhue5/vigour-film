/* ============================================================
   VIGOUR FILM · app.js
   纯静态 · 无依赖 · 双击 index.html 即可运行
   数据来自 data/works-data.js（由「导入新作品.bat」生成）
   ============================================================ */
(function () {
  'use strict';

  var DATA = window.PORTFOLIO || { site: {}, works: [] };
  var WORKS = Array.isArray(DATA.works) ? DATA.works.filter(function (w) { return w && w.id; }) : [];
  var SITE = DATA.site || {};

  // 作品按名称排序（自然数序：广告片 2 排在 广告片 10 之前）
  function byName(a, b) {
    var ta = String((a && a.title) || '');
    var tb = String((b && b.title) || '');
    if (ta === tb) return 0;
    try {
      return ta.localeCompare(tb, 'zh-CN', { numeric: true, sensitivity: 'base' });
    } catch (e) {
      return ta < tb ? -1 : 1;
    }
  }
  WORKS.sort(byName);

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtTime(sec) {
    sec = Number(sec);
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.floor(sec);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  var state = {
    filter: '全部',
    list: WORKS.slice(),
    index: -1,
    open: false,
    lastFocus: null,
    scrub: false // 拖动进度条期间不把 timeupdate 的播放位置写回滑块
  };

  var els = {};

  /* ============================== 渲染 ============================== */

  function renderSite() {
    document.title = SITE.title || '广告片展示网站';

    // 首屏背景：第一支作品的封面，压暗后做氛围底图
    var first = WORKS[0];
    if (first && els.heroBg) {
      var bg = first.poster || first.thumb || '';
      if (bg) els.heroBg.style.backgroundImage = 'url("' + bg.replace(/"/g, '%22') + '")';
    }
  }

  function renderFilters() {
    var cats = ['全部'];
    WORKS.forEach(function (w) {
      var c = w.category || '作品';
      if (cats.indexOf(c) === -1) cats.push(c);
    });

    var frag = document.createDocumentFragment();
    cats.forEach(function (cat) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (cat === '全部' ? ' is-active' : '');
      b.dataset.cat = cat;
      b.textContent = cat;
      b.setAttribute('aria-pressed', cat === '全部' ? 'true' : 'false');
      b.addEventListener('click', function () { applyFilter(cat); });
      frag.appendChild(b);
    });
    els.filters.appendChild(frag);

    // 只有一种分类时隐藏筛选条，避免无意义的一颗按钮
    if (cats.length <= 2) els.filters.hidden = true;
  }

  function workCard(w, i) {
    var card = document.createElement('article');
    card.className = 'work';
    card.dataset.id = w.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', (w.video ? '播放' : '查看') + '《' + (w.title || '未命名') + '》');
    card.style.setProperty('--delay', Math.min(i * 45, 450) + 'ms');
    card.__work = w;

    var poster = w.thumb || w.poster || '';
    var dur = w.duration > 0 ? fmtTime(w.duration) : '';
    var preview = FINE && !REDUCED && w.preview ? ' data-has-preview="1"' : '';

    card.innerHTML =
      '<div class="work__frame">' +
        '<img class="work__poster" src="' + esc(poster) + '" alt="《' + esc(w.title) + '》封面"' +
          (w.width ? ' width="' + w.width + '" height="' + w.height + '"' : '') +
          ' loading="lazy" decoding="async">' +
        '<video class="work__preview" muted loop playsinline preload="none" aria-hidden="true"></video>' +
        '<span class="work__shade" aria-hidden="true"></span>' +
        '<span class="work__index" aria-hidden="true">' + pad2(i + 1) + '</span>' +
        (dur ? '<span class="work__dur" aria-hidden="true">' + dur + '</span>' : '') +
        '<span class="work__play" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>' +
        '</span>' +
      '</div>' +
      '<div class="work__meta">' +
        '<h3 class="work__title">' + esc(w.title || '未命名作品') + '</h3>' +
        '<p class="work__sub">' + esc(w.category || '作品') +
          (w.year ? '<span>·</span>' + esc(w.year) : '') + '</p>' +
      '</div>';

    attachCardFx(card, w);
    return card;
  }

  function renderWorks() {
    var grid = els.grid;
    grid.innerHTML = '';

    if (!WORKS.length) {
      els.empty.hidden = false;
      els.empty.textContent = '还没有作品。请把视频放进「待导入」文件夹，运行「导入新作品.bat」。';
      return;
    }

    var frag = document.createDocumentFragment();
    WORKS.forEach(function (w, i) { frag.appendChild(workCard(w, i)); });
    grid.appendChild(frag);

    // 键盘 / 点击打开
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.work');
      if (card) openWork(card.dataset.id);
    });
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var card = e.target.closest('.work');
      if (!card) return;
      e.preventDefault();
      openWork(card.dataset.id);
    });

    applyFilter('全部');
  }

  /* 悬停预览 + 倾斜 */
  function attachCardFx(card, w) {
    var frame = $('.work__frame', card);
    var preview = $('.work__preview', card);
    var previewSrc = w.preview || '';
    var timer = 0;

    if (FINE && !REDUCED && previewSrc) {
      frame.addEventListener('pointerenter', function () {
        timer = window.setTimeout(function () {
          if (!preview.src) preview.src = previewSrc;
          var p = preview.play();
          card.classList.add('is-previewing');
          // 预览文件缺失/损坏时 play() 会 reject：退回封面，不留黑块
          if (p && p.catch) p.catch(function () { card.classList.remove('is-previewing'); });
        }, 380);
      });
      frame.addEventListener('pointerleave', function () {
        window.clearTimeout(timer);
        card.classList.remove('is-previewing');
        if (preview.src) {
          preview.pause();
          try { preview.currentTime = 0; } catch (e) {}
        }
      });
    }

    if (FINE && !REDUCED) {
      frame.addEventListener('pointermove', function (e) {
        var r = frame.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--ry', (px * 5).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-py * 4).toFixed(2) + 'deg');
        card.style.setProperty('--mx', (px * 100 + 50).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100 + 50).toFixed(1) + '%');
      });
      frame.addEventListener('pointerleave', function () {
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--mx', '50%');
        card.style.setProperty('--my', '50%');
      });
    }
  }

  /* ============================== 筛选 ============================== */

  function applyFilter(cat) {
    state.filter = cat;
    $$('.chip', els.filters).forEach(function (b) {
      var on = b.dataset.cat === cat;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var visible = 0;
    $$('.work', els.grid).forEach(function (card) {
      var w = card.__work;
      var show = cat === '全部' || (w.category || '作品') === cat;
      card.hidden = !show;
      if (show) visible++;
    });

    els.empty.hidden = visible > 0;
    state.list = visibleWorks();

    // 切换后确保视口内的卡片直接出现
    window.setTimeout(function () {
      $$('.work').forEach(function (c) {
        if (c.hidden || c.classList.contains('is-in')) return;
        var r = c.getBoundingClientRect();
        if (r.top < window.innerHeight + 120) c.classList.add('is-in');
      });
    }, 40);
  }

  function visibleWorks() {
    return WORKS.filter(function (w) {
      return state.filter === '全部' || (w.category || '作品') === state.filter;
    });
  }

  /* ============================== 滚动出现 ============================== */

  function initReveal() {
    var items = $$('.reveal').concat($$('.work'));
    if (!('IntersectionObserver' in window) || REDUCED) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    items.forEach(function (el) { io.observe(el); });

    // 兜底：锚点跳转 / 拖动滚动条 / 深链接会在一帧内跨过视口，
    // IntersectionObserver 可能收不到这些元素的交叉记录，卡片会永远停在 opacity:0。
    // 滚动时把「已进入视口」和「已经滚到视口上方」的元素直接标记为已出现。
    var ticking = false;
    function sweep() {
      ticking = false;
      var vh = window.innerHeight;
      for (var k = 0; k < items.length; k++) {
        var el = items[k];
        if (el.classList.contains('is-in')) continue;
        var r = el.getBoundingClientRect();
        if (r.bottom <= 0 || (r.top < vh && r.bottom > 0)) {
          el.classList.add('is-in');
          io.unobserve(el);
        }
      }
    }
    function queueSweep() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(sweep);
    }
    window.addEventListener('scroll', queueSweep, { passive: true });
    window.addEventListener('resize', queueSweep);
  }

  /* ============================== 顶栏 ============================== */

  function initHeader() {
    var head = els.head;

    function onScroll() {
      head.classList.toggle('is-scrolled', window.scrollY > 16);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (els.menuBtn) {
      // 统一的开合入口：类名 + 展开态 + 标签始终同步
      function setMenu(open) {
        head.classList.toggle('is-open', open);
        els.menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        els.menuBtn.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
      }
      els.menuBtn.addEventListener('click', function () {
        setMenu(!head.classList.contains('is-open'));
      });
      $$('.nav__link').forEach(function (a) {
        a.addEventListener('click', function () { setMenu(false); });
      });
      // Esc 关闭移动端菜单
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && head.classList.contains('is-open') && !state.open) {
          setMenu(false);
          els.menuBtn.focus({ preventScroll: true });
        }
      });
    }

    // 当前区块高亮
    var sections = ['works'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var links = $$('.nav__link');
    if ('IntersectionObserver' in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          links.forEach(function (a) {
            a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id);
          });
        });
      }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
      sections.forEach(function (s) { spy.observe(s); });
    }
  }

  /* ============================== 放映层 ============================== */

  var PLAY_ICONS = {};
  var timers = {};

  function initTheater() {
    els.theater = $('#theater');
    els.shell = $('.theater__shell', els.theater);
    els.closeBtn = $('#theaterClose');
    els.prevBtn = $('#prevBtn');
    els.nextBtn = $('#nextBtn');
    els.player = $('#player');
    els.playerWrap = $('#playerWrap');
    els.playerImage = $('#playerImage');
    els.bigPlay = $('#bigPlay');
    els.playBtn = $('#playBtn');
    els.seek = $('#seek');
    els.curTime = $('#curTime');
    els.durTime = $('#durTime');
    els.muteBtn = $('#muteBtn');
    els.fsBtn = $('#fsBtn');
    els.theaterTitle = $('#theaterTitle');
    els.theaterSub = $('#theaterSub');
    els.theaterDesc = $('#theaterDesc');
    els.theaterCount = $('#theaterCount');
    els.live = $('#liveAnnounce');

    PLAY_ICONS.play = $('#playBtn .ico-play');
    PLAY_ICONS.pause = $('#playBtn .ico-pause');

    els.closeBtn.addEventListener('click', requestClose);
    els.prevBtn.addEventListener('click', function () { step(-1); });
    els.nextBtn.addEventListener('click', function () { step(1); });
    $('[data-close]', els.theater).addEventListener('click', requestClose);

    // 点击放映层空白处（背景 / 视频周围）关闭
    els.theater.addEventListener('click', function (e) {
      if (!state.open) return;
      var t = e.target;
      if (!t || t === els.theater) return;
      if (t.closest('.player, .theater__top, .theater__meta, [data-close], button')) return;
      requestClose();
    });

    els.bigPlay.addEventListener('click', togglePlay);
    els.playBtn.addEventListener('click', togglePlay);
    els.muteBtn.addEventListener('click', toggleMute);
    els.fsBtn.addEventListener('click', toggleFullscreen);
    els.player.addEventListener('click', togglePlay);

    els.player.addEventListener('timeupdate', onTimeUpdate);
    els.player.addEventListener('loadedmetadata', onMeta);
    els.player.addEventListener('play', function () {
      els.playerWrap.classList.add('is-playing');
      syncPlayLabel();
    });
    els.player.addEventListener('pause', function () {
      els.playerWrap.classList.remove('is-playing');
      syncPlayLabel();
    });
    els.player.addEventListener('volumechange', syncMute);
    els.player.addEventListener('error', onVideoError);

    // 拖动进度条：拖动期间不提交 currentTime（保持手感），松开后再定位
    els.seek.addEventListener('input', function () {
      var d = els.player.duration;
      if (!isFinite(d) || d <= 0) return;
      state.scrub = true;
      var pct = Number(els.seek.value) / 1000;
      els.seek.style.setProperty('--p', (pct * 100).toFixed(2) + '%');
      paintTime(pct * d);
      updateSeekAria(pct * d, d);
    });
    els.seek.addEventListener('change', function () {
      var d = els.player.duration;
      if (state.scrub && isFinite(d) && d > 0) {
        els.player.currentTime = (Number(els.seek.value) / 1000) * d;
      }
      state.scrub = false;
      paintProgress();
    });

    // 进度条键盘：←/→ 5 秒粗跳，PageUp/PageDown 10 秒，Home/End 到首尾
    els.seek.addEventListener('keydown', function (e) {
      var d = els.player.duration;
      if (!isFinite(d) || d <= 0) return;
      var jump;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') jump = 5;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') jump = -5;
      else if (e.key === 'PageUp') jump = 10;
      else if (e.key === 'PageDown') jump = -10;
      else if (e.key === 'Home') jump = -d;
      else if (e.key === 'End') jump = d;
      else return;
      e.preventDefault();
      els.player.currentTime = Math.min(d, Math.max(0, els.player.currentTime + jump));
      paintProgress();
    });

    // 全屏状态（含 webkit）与按钮名称
    function syncFs() {
      var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
      els.playerWrap.classList.toggle('is-fullscreen', on);
      els.fsBtn.setAttribute('aria-label', on ? '退出全屏' : '全屏');
    }
    document.addEventListener('fullscreenchange', syncFs);
    if (typeof document.addEventListener === 'function') {
      try { document.addEventListener('webkitfullscreenchange', syncFs); } catch (e) {}
    }
    if (!canFullscreen()) els.fsBtn.hidden = true;

    // 焦点不允许逃出放映层
    document.addEventListener('focusin', function (e) {
      if (!state.open) return;
      var t = e.target;
      if (!t || t === document.body) return;
      if (!els.shell || els.shell.contains(t)) return;
      var first = focusables()[0];
      if (first && first !== t) first.focus({ preventScroll: true });
    });

    document.addEventListener('keydown', onKey);

    // 深链接：index.html#w=<id>（畸形百分号编码必须 try/catch，否则 init 中途抛错，
    // 后续 popstate 监听注册不上，浏览器后退将无法关闭放映层）
    if (location.hash.indexOf('#w=') === 0) {
      var deepId = null;
      try { deepId = decodeURIComponent(location.hash.slice(3)); } catch (e) {}
      if (deepId !== null && WORKS.some(function (w) { return w.id === deepId; })) {
        timers.deep = window.setTimeout(function () { openWork(deepId, { mode: 'replace' }); }, 240);
      }
    }
    window.addEventListener('popstate', onPopState);
  }

  function currentWork() {
    return state.list[state.index] || null;
  }

  function openWork(id, opts) {
    opts = opts || {};
    // 用户在深链接 240ms 定时器到点前手动打开作品时，取消定时器，防止被抢开
    if (timers.deep) { window.clearTimeout(timers.deep); timers.deep = 0; }
    var mode = opts.mode || 'push';
    var list = visibleWorks();
    var idx = list.findIndex(function (w) { return w.id === id; });

    if (idx < 0) {
      // 被筛选掉的作品：先回到「全部」再打开
      applyFilter('全部');
      list = visibleWorks();
      idx = list.findIndex(function (w) { return w.id === id; });
    }
    if (idx < 0) return;

    state.list = list;
    state.index = idx;
    if (!state.open) state.lastFocus = document.activeElement;
    state.open = true;

    renderCurrentWork();
    showTheater();

    setHash(mode, id);

    // 焦点从标题开始（非交互元素），保证空格播放 / M 静音 / F 全屏立即可用
    window.setTimeout(function () {
      if (state.open && els.theaterTitle) els.theaterTitle.focus({ preventScroll: true });
    }, 60);
  }

  // 写入历史状态；file:// 下部分浏览器（Safari/WebKit）会抛 SecurityError，忽略即可
  function setHash(mode, id) {
    if (id == null) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      return;
    }
    try {
      if (mode === 'push') history.pushState({ work: id }, '', '#w=' + encodeURIComponent(id));
      else history.replaceState({ work: id }, '', '#w=' + encodeURIComponent(id));
    } catch (e) {}
  }

  function renderCurrentWork() {
    var w = currentWork();
    if (!w) return;

    els.theaterTitle.textContent = w.title || '未命名作品';
    els.theaterSub.textContent = [
      w.category,
      w.year,
      w.duration > 0 ? fmtTime(w.duration) : '',
      w.width && w.height ? w.width + ' × ' + w.height : ''
    ].filter(Boolean).join('  ·  ');
    els.theaterDesc.textContent = w.description || '';
    els.theaterDesc.classList.remove('is-error');
    els.theaterCount.textContent = pad2(state.index + 1) + ' / ' + pad2(state.list.length);

    var many = state.list.length > 1;
    els.prevBtn.disabled = !many;
    els.nextBtn.disabled = !many;

    window.clearTimeout(timers.hide);
    els.playerWrap.classList.remove('is-image');

    if (w.video) {
      els.player.hidden = false;
      els.playerImage.hidden = true;
      els.playerImage.removeAttribute('src');
      els.player.setAttribute('aria-label', '《' + (w.title || '未命名作品') + '》视频');
      // 不重置 muted：首次打开默认非静音（元素默认值），用户静音后切作品保留偏好
      els.player.poster = w.poster || '';
      els.player.src = w.video;
      els.player.load();
      els.curTime.textContent = '0:00';
      els.durTime.textContent = fmtTime(w.duration);
      els.seek.value = 0;
      els.seek.style.setProperty('--p', '0%');
      updateSeekAria(0, w.duration);

      // 用户偏好减少动效时不自动播放（避免打开即大声播放 + 全屏画面跳动）
      if (!REDUCED) {
        var p = els.player.play();
        if (p && p.catch) {
          p.catch(function () {
            els.playerWrap.classList.remove('is-playing');
          });
        }
      } else {
        els.playerWrap.classList.remove('is-playing');
      }
    } else {
      els.player.pause();
      els.player.removeAttribute('src');
      els.player.load();
      els.player.removeAttribute('aria-label');
      els.player.hidden = true;
      els.playerWrap.classList.add('is-image');
      els.playerWrap.classList.remove('is-playing');
      els.playerImage.src = w.image || w.poster || '';
      els.playerImage.alt = '《' + (w.title || '未命名') + '》';
      els.playerImage.hidden = false;
      els.curTime.textContent = '0:00';
      els.durTime.textContent = '0:00';
    }
  }

  function showTheater() {
    // 关闭动画（360ms is-closing）期间重新打开：取消遗留的隐藏定时器，
    // 并确保滚动锁重新生效（此窗口内 hideTheater 已 unlock，不能漏）。
    window.clearTimeout(timers.hide);
    if (!els.theater.hidden) {
      els.theater.classList.remove('is-closing');
      els.theater.classList.add('is-open');
      lockScroll(true);
      return;
    }
    els.theater.hidden = false;
    els.theater.classList.remove('is-closing');
    lockScroll(true);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (state.open) els.theater.classList.add('is-open');
      });
    });
  }

  function hideTheater() {
    if (els.theater.hidden) return;
    state.open = false;
    els.theater.classList.remove('is-open');
    // 关闭动画期间不拦截鼠标：淡出过程把命中测试让给页面，避免吞掉下一次点击
    els.theater.classList.add('is-closing');
    els.player.pause();
    els.player.removeAttribute('src');
    els.player.load();
    els.playerWrap.classList.remove('is-playing');
    lockScroll(false);

    window.clearTimeout(timers.hide);
    timers.hide = window.setTimeout(function () {
      if (!state.open) {
        els.theater.hidden = true;
        els.theater.classList.remove('is-closing');
      }
    }, 360);

    if (state.lastFocus && state.lastFocus.isConnected) {
      state.lastFocus.focus({ preventScroll: true });
    }
    state.index = -1;
  }

  function requestClose() {
    if (!state.open) return;
    // 先关放映层再清 URL；history 失败（如 file:// 下某些浏览器）绝不能卡住关闭
    hideTheater();
    setHash('replace', null);
  }

  function onPopState() {
    var m = location.hash.match(/^#w=(.+)$/);
    if (m) {
      var id = null;
      try { id = decodeURIComponent(m[1]); } catch (e) {}
      if (id !== null && WORKS.some(function (w) { return w.id === id; })) {
        if (!state.open || !currentWork() || currentWork().id !== id) openWork(id, { mode: 'none' });
        return;
      }
    }
    hideTheater();
  }

  function step(delta) {
    if (!state.open || state.list.length < 2) return;
    state.index = (state.index + delta + state.list.length) % state.list.length;
    renderCurrentWork();
    var w = currentWork();
    setHash('replace', w.id);
    announce('已切换到《' + (w.title || '未命名作品') + '》' + pad2(state.index + 1) + ' / ' + pad2(state.list.length));
  }

  // 无障碍播报：切换作品 / 加载失败等动态变化
  function announce(msg) {
    var live = els.live;
    if (!live) return;
    if (live.textContent) live.textContent = '';
    window.setTimeout(function () { live.textContent = msg; }, 30);
  }

  /* ---------- 播放控制 ---------- */

  function togglePlay() {
    if (!state.open) return;
    var w = currentWork();
    if (!w || !w.video) return;
    if (els.player.paused) {
      var p = els.player.play();
      if (p && p.catch) p.catch(function () {});
    } else {
      els.player.pause();
    }
    syncPlayLabel();
  }

  // 播放/暂停按钮的可访问名称随状态切换
  function syncPlayLabel() {
    var playing = !els.player.paused;
    if (els.playBtn) els.playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
    if (els.bigPlay) els.bigPlay.setAttribute('aria-label', playing ? '暂停' : '播放');
  }

  function toggleMute() {
    els.player.muted = !els.player.muted;
    syncMute();
  }

  function syncMute() {
    els.playerWrap.classList.toggle('is-muted', els.player.muted);
    if (els.muteBtn) els.muteBtn.setAttribute('aria-label', els.player.muted ? '取消静音' : '静音');
  }

  function canFullscreen() {
    var el = els.playerWrap;
    if (!el) return false;
    if (el.requestFullscreen || el.webkitRequestFullscreen) return true;
    // iPhone Safari：非视频元素无全屏 API，退化到视频自带的 webkitEnterFullscreen
    if (els.player && els.player.webkitEnterFullscreen) return true;
    return false;
  }

  function toggleFullscreen() {
    var on = !!document.fullscreenElement;
    if (on) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }
    var el = els.playerWrap;
    if (el.requestFullscreen) {
      var p = el.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (els.player && els.player.webkitEnterFullscreen) {
      els.player.webkitEnterFullscreen();
    }
  }

  function paintProgress() {
    // 拖动中由 input 事件控制滑块，timeupdate 不得把位置写回（否则滑块会自己漂移）
    if (state.scrub) return;
    var p = els.player;
    var d = p.duration;
    if (!isFinite(d) || d <= 0) return;
    var pct = Math.min(1, Math.max(0, p.currentTime / d));
    els.seek.value = Math.round(pct * 1000);
    els.seek.style.setProperty('--p', (pct * 100).toFixed(2) + '%');
    paintTime(p.currentTime);
    updateSeekAria(p.currentTime, d);
  }

  // 进度条对读屏软件播报"当前/总时长"而非原始 0–1000 值
  function updateSeekAria(cur, dur) {
    if (!els.seek) return;
    els.seek.setAttribute('aria-valuemax', '1000');
    els.seek.setAttribute('aria-valuetext', fmtTime(cur) + ' / ' + fmtTime(dur));
  }

  function onTimeUpdate() {
    paintProgress();
  }

  function paintTime(t) { els.curTime.textContent = fmtTime(t); }

  function onMeta() {
    var d = els.player.duration;
    els.durTime.textContent = isFinite(d) ? fmtTime(d) : '0:00';
    els.seek.value = 0;
    els.seek.style.setProperty('--p', '0%');
    if (isFinite(d) && d > 0) updateSeekAria(0, d);
  }

  function onVideoError() {
    if (!els.player.currentSrc) return;
    if (state.open) {
      els.theaterDesc.textContent = '视频加载失败：请检查 media/video 下的文件是否存在，或重新运行「导入新作品.bat」。';
      els.theaterDesc.classList.add('is-error');
      announce('视频加载失败，请检查 media 目录下的文件。');
    }
  }

  /* ---------- 键盘 ---------- */

  function isInteractive(el) {
    return !!(el && el.closest && el.closest('button, a, input, select, textarea, [contenteditable="true"]'));
  }

  function onKey(e) {
    if (!state.open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      requestClose();
      return;
    }

    if (e.key === 'Tab') {
      trapFocus(e);
      return;
    }

    // 进度条上 ←/→ 让位给拖动
    if (e.target === els.seek) return;

    // 方向键切换作品——即使焦点在上一张/下一张按钮上也生效
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }

    if (isInteractive(e.target)) return;

    switch (e.key) {
      case ' ':
      case 'Spacebar':
        e.preventDefault();
        togglePlay();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'm':
      case 'M':
        toggleMute();
        break;
      default:
        break;
    }
  }

  // 放映层内可聚焦元素（可见的按钮/链接/输入框）
  function focusables() {
    return $$('button:not(:disabled), [href], input, [tabindex]:not([tabindex="-1"])', els.shell)
      .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }

  function trapFocus(e) {
    var set = focusables();
    if (!set.length) return;

    var first = set[0];
    var last = set[set.length - 1];

    // 焦点在放映层外（如点击了视频/标题后落到 body）时，Tab/Shift+Tab 拉回层内
    if (!els.shell.contains(document.activeElement)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function lockScroll(on) {
    if (on) {
      var sbw = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.setProperty('--sbw', Math.max(0, sbw) + 'px');
      document.body.classList.add('is-locked');
    } else {
      document.body.classList.remove('is-locked');
      document.documentElement.style.removeProperty('--sbw');
    }
  }

  /* ============================== 添加作品 ============================== */

  var UPLOAD_EXTS = {
    '.mp4': 1, '.mov': 1, '.m4v': 1, '.webm': 1, '.mkv': 1, '.avi': 1,
    '.mts': 1, '.m2ts': 1, '.wmv': 1, '.flv': 1, '.ts': 1,
    '.png': 1, '.jpg': 1, '.jpeg': 1, '.gif': 1, '.webp': 1, '.bmp': 1
  };

  function initUpload() {
    var dialog = els.uploadDialog = $('#uploadDialog');
    if (!dialog) return;

    var drop = $('#uploadDrop');
    var input = $('#uploadInput');
    var list = $('#uploadList');
    var actions = $('#uploadActions');
    var saveBtn = $('#uploadSave');
    var statusEl = $('#uploadStatus');
    var fallback = $('#uploadFallback');

    var files = []; // 待写入的文件
    var lastFocus = null;

    function hasFS() {
      return typeof window.showDirectoryPicker === 'function';
    }

    function fmtSize(n) {
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1048576).toFixed(1) + ' MB';
    }

    // Windows 非法文件名字符清理：<>:"/\|?* 及控制字符
    function safeName(name) {
      return String(name)
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .replace(/[. ]+$/g, '')
        .slice(0, 120) || 'file';
    }

    function setStatus(msg, kind) {
      statusEl.textContent = msg;
      statusEl.className = 'upload__status' + (kind ? ' is-' + kind : '');
    }

    function renderList() {
      list.textContent = '';
      files.forEach(function (f, i) {
        var li = document.createElement('li');
        li.className = 'upload__item';
        var name = document.createElement('span');
        name.className = 'upload__item-name';
        name.textContent = f.name;
        name.title = f.name;
        var size = document.createElement('span');
        size.className = 'upload__item-size';
        size.textContent = fmtSize(f.size);
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'upload__item-remove';
        rm.textContent = '×';
        rm.setAttribute('aria-label', '移除 ' + f.name);
        rm.addEventListener('click', function () {
          files.splice(i, 1);
          renderList();
        });
        li.appendChild(name);
        li.appendChild(size);
        li.appendChild(rm);
        list.appendChild(li);
      });
      list.hidden = files.length === 0;
      actions.hidden = files.length === 0;
    }

    function addFiles(fileList) {
      var arr = Array.prototype.slice.call(fileList || []);
      arr.forEach(function (f) {
        var ext = (('.' + f.name).match(/\.[^.]+$/) || [''])[0].toLowerCase();
        if (!UPLOAD_EXTS[ext]) return;
        // 同名同大小视为重复
        var dup = files.some(function (g) { return g.name === f.name && g.size === f.size; });
        if (!dup) files.push(f);
      });
      renderList();
    }

    function openUpload() {
      lastFocus = document.activeElement;
      files = [];
      renderList();
      setStatus('', '');
      fallback.hidden = hasFS();
      dialog.hidden = false;
      requestAnimationFrame(function () { dialog.classList.add('is-open'); });
      drop.focus({ preventScroll: true });
    }

    function closeUpload() {
      dialog.classList.remove('is-open');
      setTimeout(function () { dialog.hidden = true; }, 330);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    // 打开入口
    var openers = []; // #navAddBtn（导航）、#openUploadBtn（作品区标题旁）
    ['navAddBtn', 'openUploadBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) openers.push(el);
    });
    // 导航入口在移动端还在折叠菜单里：交给 initHeader 的 .nav__link 关闭菜单后打开
    openers.forEach(function (b) {
      b.addEventListener('click', openUpload);
    });

    // 关闭入口
    $('#uploadClose').addEventListener('click', closeUpload);
    var backdrop = dialog.querySelector('[data-upload-close]');
    if (backdrop) backdrop.addEventListener('click', closeUpload);

    // 文件选择 / 拖拽
    drop.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      addFiles(input.files);
      input.value = '';
    });
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.remove('is-over');
      });
    });
    drop.addEventListener('drop', function (e) {
      addFiles(e.dataTransfer.files);
    });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });

    // 保存到「待导入」文件夹
    saveBtn.addEventListener('click', async function () {
      if (!files.length) return;
      if (!window.showDirectoryPicker) {
        setStatus('当前浏览器不支持直接保存，请使用 Chrome / Edge 或手动放入「待导入」文件夹。', 'err');
        return;
      }
      var dir;
      try {
        dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (e) {
        if (e && e.name === 'AbortError') return; // 用户取消
        setStatus('无法打开文件夹选择器：' + ((e && e.message) || e), 'err');
        return;
      }
      saveBtn.disabled = true;
      var ok = 0;
      var failed = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        try {
          var handle = await dir.getFileHandle(safeName(f.name), { create: true });
          var writable = await handle.createWritable();
          await writable.write(f);
          await writable.close();
          ok++;
        } catch (e) {
          failed.push(f.name);
        }
      }
      saveBtn.disabled = false;
      if (ok === files.length) {
        setStatus('已保存 ' + ok + ' 个文件到「待导入」文件夹。现在双击「导入新作品.bat」完成转码，刷新页面即可看到新作品。', 'ok');
        files = [];
        renderList();
      } else if (ok > 0) {
        setStatus('保存完成 ' + ok + ' / ' + files.length + ' 个，失败：' + failed.join('、') + '。可重试。', 'err');
      } else {
        setStatus('保存失败：' + failed.join('、') + '。请检查「待导入」文件夹是否可写。', 'err');
      }
    });

    // Esc 关闭
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || dialog.hidden) return;
      if (state.open) return; // 放映层优先
      closeUpload();
    });
  }

  /* ============================== 启动 ============================== */

  function init() {
    els.head = $('#siteHead');
    els.menuBtn = $('#menuBtn');
    els.heroBg = $('#heroBg');
    els.filters = $('#filters');
    els.grid = $('#worksGrid');
    els.empty = $('#worksEmpty');

    renderSite();
    renderFilters();
    renderWorks();
    initReveal();
    initHeader();
    initTheater();
    initUpload();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
