/* 开放书库 · Android 导航壳
 * 独立 classic script（ES5 语法），不依赖 ES module、不依赖业务代码。
 * 即使 bundle.js 因 WebView 太老而加载失败，顶栏 / 底栏 / 抽屉依然可见可用。
 * 与业务层的唯一契约：window.__orBootOK（bundle 启动成功）、window.__orSetMenu。
 */
(function () {
  'use strict';

  /* 运行时补丁统一放在 compat.js（在 shell.js 之前加载）；这里只留一道保险，
     万一 compat.js 被某台机器的 WebView 拦掉，导航壳本身仍能工作。 */
  if (typeof globalThis === 'undefined') { window.globalThis = window; }

  function $(id) { return document.getElementById(id); }
  function closest(node, sel) {
    while (node && node.nodeType === 1) {
      if (node.matches && node.matches(sel)) return node;
      node = node.parentNode;
    }
    return null;
  }

  var body = document.body;
  var top = $('or-topbar');
  if (!top) return;

  /* ---------- 1. 菜单 / 抽屉 ---------- */
  function setMenu(open) {
    if (open) body.classList.add('menu-open');
    else body.classList.remove('menu-open');
    var app = document.querySelector('.app');
    if (app) {
      if (open) app.classList.add('menu-open');
      else app.classList.remove('menu-open');
    }
  }
  window.__orSetMenu = setMenu;
  window.__orCloseMenu = function () { setMenu(false); };
  function isMenuOpen() { return body.classList.contains('menu-open'); }

  function bind(id, fn) { var n = $(id); if (n) n.addEventListener('click', fn); }

  bind('or-menu-btn', function () { setMenu(!isMenuOpen()); });
  bind('or-mask', function () { setMenu(false); });
  bind('or-drawer-close', function () { setMenu(false); });

  bind('or-search-btn', function () {
    setMenu(true);
    setTimeout(function () {
      var s = $('search');
      if (s) {
        s.focus();
        if (s.scrollIntoView) s.scrollIntoView({ block: 'center' });
      }
    }, 230);
  });

  bind('or-import-btn', function () {
    setMenu(false);
    var b = $('btn-import');
    if (b) b.click();
  });

  /* ---------- 2. 底部标签栏 ---------- */
  var NAV = {
    shelf: 'all', bookmarks: 'bookmarks', shuku: 'shuku', request: 'request'
  };
  var tabs = $('or-tabbar');
  if (tabs) {
    tabs.addEventListener('click', function (e) {
      var b = closest(e.target, '.or-tab');
      if (!b) return;
      setMenu(false);
      var key = b.getAttribute('data-or');
      if (key === 'settings') {
        var s = $('btn-settings');
        if (s) s.click();
        return;
      }
      var v = NAV[key];
      var item = v ? document.querySelector('.nav-item[data-view="' + v + '"]') : null;
      if (item) item.click();
    });
  }

  // 抽屉里任何会切换视图的点击都收起抽屉。
  document.addEventListener('click', function (e) {
    if (closest(e.target, '.nav-item, #collections .collection-item, .foot-btn, .btn-import')) {
      setMenu(false);
    }
  }, true);

  /* ---------- 3. 标题 / 高亮 / 阅读态同步 ---------- */
  var title = $('or-title');
  function labelOf(nav) {
    var clone = nav.cloneNode(true);
    var junk = clone.querySelectorAll('em, i');
    for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
    return clone.textContent.replace(/^\s+|\s+$/g, '');
  }
  function syncChrome() {
    var reader = $('view-reader');
    var reading = !!(reader && !reader.classList.contains('hidden'));
    if (reading) body.classList.add('in-reader');
    else body.classList.remove('in-reader');

    var active = document.querySelector('.nav-item.active');
    if (title) {
      if (reading) {
        var rt = document.querySelector('.reader-title');
        title.textContent = (rt && rt.textContent.replace(/^\s+|\s+$/g, '')) || '阅读中';
      } else {
        title.textContent = active ? labelOf(active) : '开放书库';
      }
    }
    var key = 'shelf';
    if (active) {
      var v = active.getAttribute('data-view');
      if (v === 'bookmarks') key = 'bookmarks';
      else if (v === 'shuku') key = 'shuku';
      else if (v === 'request') key = 'request';
    }
    if (tabs) {
      var bs = tabs.querySelectorAll('.or-tab');
      for (var j = 0; j < bs.length; j++) {
        var on = bs[j].getAttribute('data-or') === key && !reading;
        if (on) bs[j].classList.add('active');
        else bs[j].classList.remove('active');
      }
    }
  }
  var pending = false;
  function scheduleSync() {
    if (pending) return;
    pending = true;
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { pending = false; syncChrome(); });
    } else {
      setTimeout(function () { pending = false; syncChrome(); }, 16);
    }
  }
  if (window.MutationObserver) {
    var mo = new MutationObserver(scheduleSync);
    function watch(node) {
      if (node) mo.observe(node, { attributes: true, attributeFilter: ['class'], subtree: true });
    }
    watch(document.querySelector('.main'));
    watch($('nav'));
    mo.observe(body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  }
  syncChrome();

  /* ---------- 4. 系统状态栏跟随阅读主题 ---------- */
  function applyTheme() {
    if (window.AndroidNative && window.AndroidNative.setTheme) {
      window.AndroidNative.setTheme(body.getAttribute('data-theme') || 'light');
    }
  }
  if (window.MutationObserver) {
    new MutationObserver(applyTheme).observe(body, {
      attributes: true, attributeFilter: ['data-theme']
    });
  }
  applyTheme();

  /* ---------- 5. 安卓返回键（业务未加载时也能关抽屉 / 退阅读） ---------- */
  window.__orBack = function () {
    if (isMenuOpen()) { setMenu(false); return true; }
    if (body.classList.contains('immersive')) {
      var ex = document.querySelector('.immersive-exit');
      if (ex) { ex.click(); return true; }
    }
    var rd = $('view-reader');
    if (rd && !rd.classList.contains('hidden')) {
      var back = $('btn-back');
      if (back) { back.click(); return true; }
    }
    var mask = $('modal-mask');
    if (mask && !mask.classList.contains('hidden')) {
      var close = $('m-close');
      if (close) { close.click(); return true; }
    }
    var act = document.querySelector('.nav-item.active');
    if (act && act.getAttribute('data-view') !== 'all') {
      var home = document.querySelector('.nav-item[data-view="all"]');
      if (home) { home.click(); return true; }
    }
    return false;
  };

  /* ---------- 6. 启动自检：业务脚本没起来时给出可截图的原因 ---------- */
  window.__orErrors = [];
  window.onerror = function (msg, src, line, col) {
    window.__orErrors.push(String(msg) + ' @' + String(src).split('/').pop() + ':' + line);
    return false;
  };
  window.addEventListener('unhandledrejection', function (e) {
    window.__orErrors.push('Promise: ' + String(e.reason && e.reason.message || e.reason));
  });

  function supports(code) {
    try { new Function(code); return true; } catch (e) { return false; }
  }
  function showDiag() {
    var box = $('or-diag');
    if (!box) return;
    var ua = navigator.userAgent || '';
    var m = /Chrome\/(\d+)/.exec(ua);
    var chrome = m ? m[1] : '?';
    var dev = '未知';
    try {
      if (window.AndroidNative && window.AndroidNative.deviceInfo) dev = window.AndroidNative.deviceInfo();
    } catch (e) { dev = 'deviceInfo 不可用'; }
    var bits = [
      '引擎未启动 · 请截图发给维护者',
      'WebView: Chrome ' + chrome + ' / Android ' + (/Android ([\d.]+)/.exec(ua) || ['', '?'])[1],
      '设备: ' + dev,
      '视口: ' + window.innerWidth + '×' + window.innerHeight + ' @dpr' + (window.devicePixelRatio || 1),
      '可选链语法: ' + (supports('var a={};return a?.b') ? '支持' : '不支持'),
      'ES module: ' + (('noModule' in document.createElement('script')) ? '支持' : '不支持'),
      'deflate-raw: ' + (function () {
        try { new DecompressionStream('deflate-raw'); return '支持'; } catch (e) { return '不支持（已内置兼容层）'; }
      })(),
      'SHA-256: ' + (window.__orCompat && window.__orCompat.sha256Polyfill ? '内置补丁' : '原生'),
      '100dvh: ' + (window.CSS && CSS.supports && CSS.supports('height', '100dvh') ? '支持' : '不支持（已回退 100vh）'),
      '错误: ' + (window.__orErrors.length ? window.__orErrors.slice(0, 3).join(' | ') : '无（脚本可能被拦截或未请求）'),
      'UA: ' + ua.slice(0, 160)
    ];
    if (window.AndroidNative && window.AndroidNative.log) {
      window.AndroidNative.log(bits.join(' || '));
    }
    box.innerHTML = '';
    var h = document.createElement('b');
    // 版本由 sync-web.mjs 注入到 <meta name="or-version">，这里不再硬编码。
    var verMeta = document.querySelector('meta[name="or-version"]');
    var ver = verMeta ? (verMeta.getAttribute('content') || '?') : '?';
    h.textContent = '开放书库 v' + ver;
    box.appendChild(h);
    for (var i = 0; i < bits.length; i++) {
      var p = document.createElement('div');
      p.textContent = bits[i];
      box.appendChild(p);
    }
    box.classList.remove('hidden');
    box.addEventListener('click', function () { box.classList.add('hidden'); }, { once: true });
  }
  // bundle.js 成功启动会置 __orBootOK；老 WebView 解析失败时这里兜底报警。
  setTimeout(function () {
    if (!window.__orBootOK) showDiag();
  }, 4500);
})();
