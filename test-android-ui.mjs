/* Render the Android assets in a real Chromium at phone width via CDP and
   verify the mobile shell actually boots. Writes two PNGs next to this file:
     _ui-check.png         home screen
     _ui-check-drawer.png  sidebar drawer opened
   Optional check: needs a local Chrome / Edge. Usage: node test-android-ui.mjs
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, 'app', 'src', 'main', 'assets');
const V = JSON.parse(fs.readFileSync(path.join(HERE, 'version.json'), 'utf8'));

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const CHROME = BROWSERS.find((p) => fs.existsSync(p));
if (!CHROME) {
  console.log('SKIP: no local Chrome/Edge found, UI render check skipped.');
  process.exit(0);
}
if (typeof WebSocket === 'undefined') {
  console.log('SKIP: Node has no global WebSocket (need Node 22+), UI check skipped.');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ASSETS, rel.replace(/^\/+/, ''));
  if (!file.startsWith(ASSETS) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(file).pipe(res);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK   ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + '  ' + extra); }
};

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'or-ui-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--no-default-browser-check', '--disable-dev-shm-usage',
  '--remote-debugging-port=0', '--remote-allow-origins=*',
  `--user-data-dir=${profile}`,
  '--window-size=390,844', '--force-device-scale-factor=1',
  'about:blank',
], { stdio: 'ignore' });

let ws = null;
try {
  console.log('=== Android UI render @ 390x844 (real Chromium / CDP) ===');
  console.log('  browser:', path.basename(CHROME));

  // Chrome writes the chosen debugging port into DevToolsActivePort.
  const portFile = path.join(profile, 'DevToolsActivePort');
  let port = 0;
  for (let i = 0; i < 120 && !port; i++) {
    if (fs.existsSync(portFile)) port = Number(fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/)[0]);
    if (!port) await sleep(100);
  }
  if (!port) throw new Error('DevToolsActivePort 未生成');

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('找不到 page target');

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('CDP WebSocket 连接失败'));
  });
  let nextId = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    } else if (m.method) events.push(m.method);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url });
  for (let i = 0; i < 150 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
  await sleep(1800);   // let initBridge / IndexedDB / app.js finish

  const info = await evaluate(`(() => {
    const q = (s) => !!document.querySelector(s);
    const rect = (s) => { const e=document.querySelector(s); if(!e) return null;
      const r=e.getBoundingClientRect(); return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]; };
    return {
      fatal: document.body.innerText.includes('开放书库启动失败'),
      innerWidth: window.innerWidth,
      topbar: q('#or-topbar'), topbarRect: rect('#or-topbar'),
      tabbar: q('#or-tabbar'), tabbarRect: rect('#or-tabbar'),
      tabs: document.querySelectorAll('.or-tab').length,
      mask: q('#or-mask'), close: q('#or-drawer-close'),
      title: (document.getElementById('or-title')||{}).textContent || '',
      sidebar: q('.sidebar'), sidebarRect: rect('.sidebar'),
      settings: q('#btn-settings'), collections: q('#collections'),
      batch: document.body.innerText.includes('批量导入'),
      webkitdir: !!document.querySelector('[webkitdirectory]'),
      theme: document.body.dataset.theme,
      countAll: (document.getElementById('count-all')||{}).textContent || '',
      books: document.querySelectorAll('.book-card, .shelf-card').length,
      drawerOpen: document.body.classList.contains('menu-open'),
      maskVisible: (()=>{const e=document.getElementById('or-mask'); return e?getComputedStyle(e).display:'none';})(),
    };
  })()`);
  ok('页面无启动失败', !info.fatal);
  ok('手机视口宽度 390', info.innerWidth === 390, '实际 ' + info.innerWidth);
  ok('顶部应用栏可见', info.topbar && info.topbarRect[3] >= 44, JSON.stringify(info.topbarRect));
  ok('底部标签栏可见 5 项', info.tabbar && info.tabs === 5, 'tabs=' + info.tabs + ' ' + JSON.stringify(info.tabbarRect));
  ok('遮罩/关闭按钮存在', info.mask && info.close);
  ok('桌面侧栏仍在 DOM', info.sidebar && info.settings && info.collections);
  ok('批量导入替换了文件夹', info.batch && !info.webkitdir);
  ok('标题已同步', info.title.length > 0, '「' + info.title + '」');
  ok('书库数据已加载', /\d/.test(info.countAll), 'count-all=' + info.countAll);

  // ---- v1.4.0 启动链兼容：真机老 WebView 上不再依赖 ES module ----------
  const boot = await evaluate(`(() => ({
    bootOK: window.__orBootOK === true,
    moduleScript: !!document.querySelector('script[type="module"]'),
    shellBridge: typeof window.__orSetMenu === 'function',
    diagHidden: document.getElementById('or-diag').classList.contains('hidden'),
    version: (document.querySelector('.brand-text small')||{}).textContent || '',
    compatLoaded: !!(window.__orCompat && window.__orCompat.es5),
  }))()`);
  ok('业务 bundle 已启动', boot.bootOK);
  ok('页面无 ES module 脚本', !boot.moduleScript);
  ok('导航壳独立于业务启动', boot.shellBridge);
  ok('自检条未误报', boot.diagHidden);
  ok('版本号与 version.json 一致（v' + V.name + '）',
    boot.version.indexOf(V.name) >= 0, boot.version);
  ok('compat.js 运行时补丁已加载', boot.compatLoaded);

  const bundleCode = fs.readFileSync(path.join(ASSETS, 'bundle.js'), 'utf8');
  ok('bundle 已降级到 ES2016', !/\?\.|\?\?|import\(|async function|\bawait\b/.test(bundleCode),
    bundleCode.length + ' B');
  const htmlCode = fs.readFileSync(path.join(ASSETS, 'index.html'), 'utf8');
  ok('导航 DOM 写在 HTML 里（JS 全挂也可见）',
    htmlCode.indexOf('id="or-topbar"') >= 0 && htmlCode.indexOf('id="or-tabbar"') >= 0
    && htmlCode.indexOf('/compat.js') >= 0 && htmlCode.indexOf('/shell.js') >= 0
    && htmlCode.indexOf('/bundle.js') >= 0);
  ok('常驻图标为 SVG（不依赖 ROM 符号字体）',
    (htmlCode.match(/class="or-ic"/g) || []).length >= 8);

  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const out = path.join(HERE, name);
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    return [out, fs.statSync(out).size];
  };
  const [p1, s1] = await shot('_ui-check.png');
  ok('首页截图', s1 > 3000, s1 + ' B -> ' + path.basename(p1));

  // Open the drawer and verify the mask bug is really fixed.
  await evaluate(`document.getElementById('or-menu-btn').click(); true`);
  await sleep(400);
  const drawer = await evaluate(`(() => {
    const sb=document.querySelector('.sidebar').getBoundingClientRect();
    return { open: document.body.classList.contains('menu-open'),
             mask: getComputedStyle(document.getElementById('or-mask')).display,
             x: Math.round(sb.x), w: Math.round(sb.width),
             visibleItems: [...document.querySelectorAll('.nav-item')].filter(e=>e.getBoundingClientRect().width>0).length };
  })()`);
  ok('抽屉能滑出', drawer.open && drawer.x === 0, JSON.stringify(drawer));
  ok('遮罩选择器已修复', drawer.mask === 'block', 'display=' + drawer.mask);
  ok('左侧 6 个入口可见', drawer.visibleItems >= 6, '实际 ' + drawer.visibleItems);
  const [p2, s2] = await shot('_ui-check-drawer.png');
  ok('抽屉截图', s2 > 3000, s2 + ' B -> ' + path.basename(p2));
  ok('空状态文案适配安卓', await evaluate(
    `(document.querySelector('#shelf-grid .empty-state p')||{}).innerText?.includes('＋ 导入') === true`));
  ok('书库路径改为本机提示', await evaluate(
    `getComputedStyle(document.getElementById('lib-path'),'::after').content.includes('卸载会清空')`));

  // Back key should close the drawer first.
  const back = await evaluate(`window.__orBack && window.__orBack()`);
  ok('返回键先关抽屉', back === true && !(await evaluate(`document.body.classList.contains('menu-open')`)));

  // Bottom tabs must drive the real desktop navigation, not a parallel UI.
  await evaluate(`document.querySelector('.or-tab[data-or="shuku"]').click(); true`);
  await sleep(500);
  const shuku = await evaluate(`(() => {
    const f = document.querySelector('#shuku-body iframe');
    return { hidden: document.getElementById('view-shuku').classList.contains('hidden'),
             src: f ? f.getAttribute('src') : '', title: document.getElementById('or-title').textContent };
  })()`);
  ok('云书库标签打开内嵌页', !shuku.hidden && shuku.src.includes('/shuku/') && shuku.title === '云书库',
    JSON.stringify(shuku));

  // ---- v1.7.0：应用内更新（CDP 里没有 Java，注入一个原生桥 mock） ----
  await evaluate(`(() => {
    window.AndroidNative = window.AndroidNative || {};
    window.AndroidNative.checkUpdate = function (m) { window.__lastCheck = m; };
    window.AndroidNative.downloadAndInstall = function (u, s) { window.__lastDownload = [u, s]; };
    window.AndroidNative.installNow = function () { window.__installNow = true; };
    window.AndroidNative.statsOptIn = function () { return window.__statsOn !== false; };
    window.AndroidNative.setStatsOptIn = function (v) { window.__statsOn = v; };
    window.AndroidNative.lastBackupName = function () { return '我的备份-20261115.openlib'; };
    return true;
  })()`);

  await evaluate(`document.querySelector('.or-tab[data-or="settings"]').click(); true`);
  await sleep(700);
  ok('设置标签打开弹窗', await evaluate(
    `!document.getElementById('modal-mask').classList.contains('hidden')`));
  ok('设置弹窗有「检查更新」入口且显示当前版本', await evaluate(
    `!!document.getElementById('s-update') && !!document.querySelector('meta[name="or-version"]')`));

  /* v1.11.0：安卓设置里的「书库目录」换成能用的数据卡片，
     并新增意见反馈入口与可关闭的匿名统计。 */
  const set1110 = await evaluate(`(() => {
    const has = (k) => !!document.getElementById(k);
    return { libStat: !!document.querySelector('.lib-stat'),
      suggest: has('s-suggest'), stats: has('s-stats'),
      exp: has('s-export'), imp: has('s-import'), openDir: has('s-open-dir') };
  })()`);
  ok('安卓设置换成书库数据卡片（不再有打不开的目录路径）',
    set1110.libStat && !set1110.openDir && set1110.exp && set1110.imp,
    JSON.stringify(set1110));
  ok('设置新增意见反馈与匿名统计开关',
    set1110.suggest && set1110.stats, JSON.stringify(set1110));

  /* v1.12.0：备份文件名自定义 + 上次备份位置可见 */
  const backupUI = await evaluate(`(() => {
    const s = (document.querySelector('.lib-stat') || {}).textContent || '';
    return { hasLast: s.indexOf('上次备份') >= 0,
      hasName: s.indexOf('我的备份-20261115.openlib') >= 0,
      hasTip: s.indexOf('恢复时会自动打开') >= 0 };
  })()`);
  ok('数据卡片显示上次备份文件名与恢复定位提示',
    backupUI.hasLast && backupUI.hasName && backupUI.hasTip, JSON.stringify(backupUI));
  const nameDlg = await evaluate(`(async () => {
    document.getElementById('s-export').click();
    await new Promise(r => setTimeout(r, 250));
    const i = document.getElementById('m-input');
    return { has: !!i, value: i ? i.value : '',
      title: (document.querySelector('#modal h2') || {}).textContent || '' };
  })()`);
  ok('导出整库先弹自定义文件名输入框',
    nameDlg.has && nameDlg.value.indexOf('开放书库备份-') === 0
    && /\.openlib$/.test(nameDlg.value) && nameDlg.title === '导出整库备份',
    JSON.stringify(nameDlg));
  await evaluate(`document.getElementById('m-cancel').click(); true`);
  await sleep(250);
  await evaluate(`document.querySelector('.or-tab[data-or="settings"]').click(); true`);
  await sleep(500);

  const statsToggle = await evaluate(`(async () => {
    document.getElementById('s-stats').click();
    await new Promise(r => setTimeout(r, 350));
    return { stored: window.__statsOn,
      label: (document.getElementById('s-stats') || {}).textContent || '' };
  })()`);
  ok('统计开关可关闭并同步到原生层',
    statsToggle.stored === false && statsToggle.label.indexOf('已关闭') >= 0,
    JSON.stringify(statsToggle));
  await evaluate(`document.getElementById('s-stats').click(); true`);
  await sleep(350);
  const suggestView = await evaluate(`(async () => {
    document.getElementById('s-suggest').click();
    await new Promise(r => setTimeout(r, 350));
    const f = document.querySelector('#suggest-body iframe');
    return { hidden: document.getElementById('view-suggest').classList.contains('hidden'),
      src: f ? f.getAttribute('src') : '' };
  })()`);
  ok('意见反馈打开内嵌建议页并带上版本号',
    !suggestView.hidden && suggestView.src.indexOf('/suggest/') >= 0
    && suggestView.src.indexOf('v=') >= 0, JSON.stringify(suggestView));
  await evaluate(`document.getElementById('btn-suggest-back').click(); true`);
  await sleep(200);
  await evaluate(`document.querySelector('.or-tab[data-or="settings"]').click(); true`);
  await sleep(500);

  await evaluate(`document.getElementById('s-update')?.click(); true`);
  ok('手动检查走原生桥 checkUpdate(true)', await evaluate(`window.__lastCheck === true`));
  await evaluate(`document.getElementById('m-close')?.click(); true`);
  await sleep(200);

  const upd = await evaluate(`(async () => {
    window.__orUpdateResult({ state:'available', manual:true, name:'9.9.9',
      notes:'测试更新说明', url:'https://soshu.pythonanywhere.com/or/OpenReader.apk',
      sha256:'deadbeef' });
    await new Promise(r => setTimeout(r, 120));
    const modal = document.getElementById('modal');
    const btn = document.getElementById('m-update');
    const r = {
      visible: !document.getElementById('modal-mask').classList.contains('hidden'),
      hasTitle: !!modal && modal.textContent.includes('发现新版本 9.9.9'),
      hasNotes: !!modal && modal.textContent.includes('测试更新说明'),
      hasBtn: !!btn,
    };
    if (btn) btn.click();
    r.called = window.__lastDownload;
    return r;
  })()`);
  ok('原生回调弹出新版本提示（版本 + 更新说明）',
    upd.visible && upd.hasTitle && upd.hasNotes && upd.hasBtn, JSON.stringify(upd));
  ok('「下载并安装」把 URL + sha256 交给原生层',
    Array.isArray(upd.called) && upd.called[0].startsWith('https://')
    && upd.called[1] === 'deadbeef', JSON.stringify(upd.called));
  ok('静默检查失败 / 已是最新 都不弹窗打扰', await evaluate(`(() => {
    document.getElementById('modal-mask').classList.add('hidden');
    window.__orUpdateResult({ state:'error', manual:false, message:'检查更新失败' });
    window.__orUpdateResult({ state:'latest', manual:false });
    return document.getElementById('modal-mask').classList.contains('hidden');
  })()`));

  await evaluate(`document.querySelector('.or-tab[data-or="shelf"]').click(); true`);
  await sleep(300);
  ok('书架标签回到书架', await evaluate(
    `!document.getElementById('view-shelf').classList.contains('hidden')`));

  // ---- v1.6.0：分节目录合并 + 连续滚动 / 翻页双模式（真实渲染） ----
  const novel = [
    '《分节小说》作者：测试', '', '简介一行。', '',
    '第1章 初遇（1）', '　' + '甲'.repeat(220), '',
    '第2章 初遇（2）', '　' + '乙'.repeat(220), '',
    '第3章 初遇（3）', '　' + '丙'.repeat(220), '',
    '第4章 别离（1）', '　' + '丁'.repeat(220), '',
    '第5章 别离 (2)', '　' + '戊'.repeat(220), '',
    '第6章 尾声（四）', '　' + '己'.repeat(220), '',
    '第7章 番外（一）', '　' + '庚'.repeat(220), '',
    '第8章 番外（二）', '　' + '辛'.repeat(220), '',
    '第9章 后记', '　' + '壬'.repeat(220), '',
  ].join('\n');
  const imported = await evaluate(`(async () => {
    const bytes = new TextEncoder().encode(${JSON.stringify(novel)});
    const r = await fetch('/api/import-book', { method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream',
                 'x-file-name': encodeURIComponent('分节小说.txt') }, body: bytes });
    const j = await r.json();
    return { ok: r.ok, titles: (j.chapters || []).map(c => c.title),
             count: (j.chapters || []).length };
  })()`);
  ok('真机页面导入分节体后目录合并为 5 章', imported.ok && imported.count === 5,
    JSON.stringify(imported.titles));
  ok('目录标题带真实章号范围', imported.titles[0] === '第1–3章 初遇'
    && imported.titles[1] === '第4–5章 别离', JSON.stringify(imported.titles));

  // 重新加载让书架卡片出现（书存在 IndexedDB，不随页面刷新丢失）。
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i++) {
    try {
      if (await evaluate(`window.__orBootOK === true && !!document.querySelector('.book-card')`)) break;
    } catch { /* 导航期间 context 可能销毁 */ }
    await sleep(150);
  }
  await sleep(400);

  /* v1.10.0 书架排列：默认中图网格 / 紧凑列表 / 三档密度。
     用有书的数据跑，顺带验证列表卡片仍带 .book-card，点击与拖拽绑定不丢。 */
  const shelfStyle = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const d0 = document.body.dataset.shelfDensity;
    const v0 = document.body.dataset.shelfView;
    const gridCards = document.querySelectorAll('#shelf-grid .book-card').length;
    document.getElementById('btn-shelf-density').click();
    await wait(400);
    const d1 = document.body.dataset.shelfDensity;
    document.getElementById('btn-shelf-view').click();
    await wait(400);
    const row = document.querySelector('#shelf-grid .book-card.list-card');
    const list = {
      view: document.body.dataset.shelfView,
      cards: document.querySelectorAll('#shelf-grid .book-card.list-card').length,
      author: !!document.querySelector('.list-author'),
      sub: !!document.querySelector('.list-sub'),
      coverH: Math.round(row ? row.querySelector('.list-cover').getBoundingClientRect().height : 0),
      rowH: Math.round(row ? row.getBoundingClientRect().height : 0),
      densityDisabled: document.getElementById('btn-shelf-density').disabled,
    };
    return { d0, v0, d1, gridCards, list };
  })()`);
  ok('书架默认中档封面网格', shelfStyle.v0 === 'grid' && shelfStyle.d0 === 'medium',
    JSON.stringify(shelfStyle));
  ok('尺寸按钮循环切换密度', shelfStyle.d1 === 'small', 'd0=' + shelfStyle.d0 + ' d1=' + shelfStyle.d1);
  ok('列表视图一行一本且带作者/章节信息',
    shelfStyle.list.view === 'list' && shelfStyle.list.cards === shelfStyle.gridCards
    && shelfStyle.list.cards > 0 && shelfStyle.list.author && shelfStyle.list.sub,
    JSON.stringify(shelfStyle.list));
  ok('列表封面缩到 60px 以内', shelfStyle.list.coverH > 0 && shelfStyle.list.coverH <= 60,
    shelfStyle.list.coverH + 'px');
  ok('列表行高不超过 80px（一屏能放十本以上）',
    shelfStyle.list.rowH > 0 && shelfStyle.list.rowH <= 80, shelfStyle.list.rowH + 'px');
  ok('列表模式下尺寸按钮禁用', shelfStyle.list.densityDisabled === true);
  const [pList, sList] = await shot('_ui-check-list.png');
  ok('紧凑列表截图', sList > 3000, sList + ' B -> ' + path.basename(pList));
  const shelfBack = await evaluate(`(async () => {
    document.getElementById('btn-shelf-view').click();
    await new Promise(r => setTimeout(r, 400));
    return {
      view: document.body.dataset.shelfView,
      covers: document.querySelectorAll('#shelf-grid .cover').length,
    };
  })()`);
  ok('可切回封面网格', shelfBack.view === 'grid' && shelfBack.covers === shelfStyle.gridCards,
    JSON.stringify(shelfBack));

  const scrollMode = await evaluate(`(async () => {
    const card = document.querySelector('.book-card');
    if (!card) return { err: 'no card' };
    card.click();
    await new Promise(r => setTimeout(r, 1200));
    const c = document.getElementById('content');
    return {
      reader: !document.getElementById('view-reader').classList.contains('hidden'),
      stream: c.classList.contains('stream'),
      blocks: document.querySelectorAll('.stream-block').length,
      tocItems: document.querySelectorAll('.toc-item').length,
      tocCount: (document.getElementById('toc-count') || {}).textContent || '',
      nextBtn: !!document.getElementById('btn-next'),
      modeLabel: (document.getElementById('btn-read-mode') || {}).textContent || '',
      info: (document.getElementById('page-info') || {}).textContent || '',
    };
  })()`);
  ok('打开书默认进入连续滚动模式',
    scrollMode.reader && scrollMode.stream && scrollMode.blocks >= 3, JSON.stringify(scrollMode));
  ok('目录只有 5 项（不是 9 条重复分节）', scrollMode.tocItems === 5,
    'tocCount=' + scrollMode.tocCount);
  ok('模式按钮显示当前为连续', scrollMode.modeLabel.includes('连续'), scrollMode.modeLabel);
  ok('下一页按钮仍然存在', scrollMode.nextBtn);
  const [p3, s3] = await shot('_ui-check-reader.png');
  ok('连续滚动阅读截图', s3 > 3000, s3 + ' B -> ' + path.basename(p3));

  const streamed = await evaluate(`(async () => {
    const c = document.getElementById('content');
    c.scrollTop = c.scrollHeight;
    await new Promise(r => setTimeout(r, 1000));
    return { blocks: document.querySelectorAll('.stream-block').length,
             end: !document.getElementById('stream-end').classList.contains('hidden'),
             info: (document.getElementById('page-info') || {}).textContent || '' };
  })()`);
  ok('滚到底自动续章（不用点下一页）', streamed.blocks === 5 && streamed.end,
    JSON.stringify(streamed));

  const paged = await evaluate(`(async () => {
    const c = document.getElementById('content');
    c.scrollTop = 0;
    await new Promise(r => setTimeout(r, 250));
    const before = c.scrollTop;
    document.getElementById('btn-next').click();
    await new Promise(r => setTimeout(r, 300));
    return { before: before, after: c.scrollTop };
  })()`);
  ok('连续模式「下一页」= 向下滚动一屏', paged.after > paged.before,
    JSON.stringify(paged));

  const pageMode = await evaluate(`(async () => {
    document.getElementById('btn-read-mode').click();
    await new Promise(r => setTimeout(r, 1000));
    const c = document.getElementById('content');
    return { stream: c.classList.contains('stream'),
             modeLabel: (document.getElementById('btn-read-mode') || {}).textContent || '',
             info: (document.getElementById('page-info') || {}).textContent || '',
             nextBtn: !!document.getElementById('btn-next'),
             length: c.textContent.length };
  })()`);
  ok('一键切回仿真翻书模式', !pageMode.stream && pageMode.modeLabel.includes('翻书'),
    JSON.stringify(pageMode));
  ok('翻页模式正文与「下一页」按钮都在', pageMode.length > 0 && pageMode.nextBtn);

  const flipped = await evaluate(`(async () => {
    const before = document.getElementById('page-info').textContent;
    document.getElementById('btn-next').click();
    await new Promise(r => setTimeout(r, 800));
    return { before: before,
             after: document.getElementById('page-info').textContent };
  })()`);
  ok('翻页模式「下一页」真的翻页', flipped.before !== flipped.after,
    JSON.stringify(flipped));

  // ---- v1.8.0：仿真书页 + 双击全屏 ----
  const bookState = await evaluate(`(() => {
    const c = document.getElementById('content');
    const s = window.__orBookState();
    return { bookMode: c.classList.contains('book-mode'),
      stage: !!document.getElementById('book-stage'),
      frontText: (document.querySelector('.book-front .book-text') || {}).textContent || '',
      effect: s.effect, has3d: s.has3d, active: s.active, gaps: s.gaps,
      count: s.count, index: s.index, full: s.text,
      frontFits: (() => { const t = document.querySelector('.book-front .book-text');
        return !!t && t.scrollHeight <= t.clientHeight + 2; })(),
      frontScroll: (() => { const t = document.querySelector('.book-front .book-text');
        return t ? t.scrollHeight : -1; })(),
      frontClient: (() => { const t = document.querySelector('.book-front .book-text');
        return t ? t.clientHeight : -1; })() };
  })()`);
  ok('翻页已改为一屏一页的仿真书页（不是整段替换）',
    bookState.bookMode && bookState.stage && bookState.active && bookState.count >= 2,
    JSON.stringify({ bookMode: bookState.bookMode, stage: bookState.stage,
      active: bookState.active, count: bookState.count, index: bookState.index }));
  ok('按视口高度切页且正文一个字不丢、不裁字',
    bookState.gaps === 0 && bookState.frontFits && bookState.frontText.length > 0,
    '缓存正文 ' + bookState.full.length + ' 字 / 断链 ' + bookState.gaps
    + ' / 页高 ' + bookState.frontScroll + '/' + bookState.frontClient);
  ok('老引擎无 3D 时自动降级为横向滑动',
    bookState.has3d ? bookState.effect === 'book' : bookState.effect === 'slide',
    'has3d=' + bookState.has3d + ' effect=' + bookState.effect);
  const [pb, sb] = await shot('_ui-check-book.png');
  ok('仿真书页静止截图', sb > 3000, sb + ' B -> ' + path.basename(pb));

  const tapRight = await evaluate(`(async () => {
    const c = document.getElementById('content');
    const r = c.getBoundingClientRect();
    const before = window.__orBookState().index;
    c.dispatchEvent(new MouseEvent('click', { bubbles: true,
      clientX: r.left + r.width * 0.85, clientY: r.top + r.height * 0.5 }));
    await new Promise(z => setTimeout(z, 900));
    return { before, after: window.__orBookState().index };
  })()`);
  ok('点屏幕右侧翻到下一页', tapRight.after === tapRight.before + 1,
    JSON.stringify(tapRight));
  const tapLeft = await evaluate(`(async () => {
    const c = document.getElementById('content');
    const r = c.getBoundingClientRect();
    const before = window.__orBookState().index;
    c.dispatchEvent(new MouseEvent('click', { bubbles: true,
      clientX: r.left + r.width * 0.15, clientY: r.top + r.height * 0.5 }));
    await new Promise(z => setTimeout(z, 900));
    return { before, after: window.__orBookState().index };
  })()`);
  ok('点屏幕左侧翻回上一页', tapLeft.after === tapLeft.before - 1,
    JSON.stringify(tapLeft));

  const swipe = await evaluate(`(async () => {
    try {
      const c = document.getElementById('content');
      const r = c.getBoundingClientRect();
      const before = window.__orBookState().index;
      const mk = (x) => new Touch({ identifier: 1, target: c,
        clientX: x, clientY: r.top + r.height / 2 });
      const a = mk(r.left + r.width * 0.8), b = mk(r.left + r.width * 0.2);
      c.dispatchEvent(new TouchEvent('touchstart',
        { touches: [a], changedTouches: [a], bubbles: true }));
      c.dispatchEvent(new TouchEvent('touchend',
        { touches: [], changedTouches: [b], bubbles: true }));
      await new Promise(z => setTimeout(z, 700));
      return { ok: true, before, after: window.__orBookState().index };
    } catch (e) { return { ok: false, err: String(e) }; }
  })()`);
  if (swipe.ok) ok('左右滑动也能翻页', swipe.after === swipe.before + 1,
    JSON.stringify(swipe));
  else console.log('  SKIP 滑动手势：该 Chromium 不支持构造 TouchEvent (' + swipe.err + ')');

  const dbl = await evaluate(`(async () => {
    const c = document.getElementById('content');
    const r = c.getBoundingClientRect();
    const opt = { bubbles: true, clientX: r.left + r.width * 0.5,
      clientY: r.top + r.height * 0.5 };
    const s0 = window.__orBookState();
    const before = s0.index, beforeLen = s0.text.length;
    c.dispatchEvent(new MouseEvent('click', opt));
    await new Promise(z => setTimeout(z, 90));
    c.dispatchEvent(new MouseEvent('click', opt));
    await new Promise(z => setTimeout(z, 500));
    const s = window.__orBookState();
    return { immersive: document.body.classList.contains('immersive'),
      stateImmersive: s.immersive, before, after: s.index,
      beforeLen, afterLen: s.text.length, animating: s.animating };
  })()`);
  // 全屏后视口变高会重新分页，页码可能变小；这里验证的是「没触发翻页、正文没变」。
  ok('双击正文进入全屏（且不会误翻页 / 不丢字）',
    dbl.immersive && dbl.stateImmersive && !dbl.animating && dbl.beforeLen === dbl.afterLen,
    JSON.stringify(dbl));
  const relaid = await evaluate(`(() => {
    const before = window.__orBookState();
    window.__orRelayoutBook();
    const after = window.__orBookState();
    const t = document.querySelector('.book-front .book-text');
    return { active: after.active, count: after.count, index: after.index,
      gaps: after.gaps, sameText: after.text === before.text,
      frontFits: !!t && t.scrollHeight <= t.clientHeight + 2,
      front: t ? t.textContent.length : 0, beforeCount: before.count };
  })()`);
  ok('全屏后按新视口重分页：正文不丢、位置仍在原章',
    relaid.active && relaid.gaps === 0 && relaid.sameText && relaid.frontFits
    && relaid.index < relaid.count && relaid.front > 0,
    JSON.stringify(relaid));
  const dbl2 = await evaluate(`(async () => {
    const c = document.getElementById('content');
    const r = c.getBoundingClientRect();
    const opt = { bubbles: true, clientX: r.left + r.width * 0.5,
      clientY: r.top + r.height * 0.5 };
    c.dispatchEvent(new MouseEvent('click', opt));
    await new Promise(z => setTimeout(z, 90));
    c.dispatchEvent(new MouseEvent('click', opt));
    await new Promise(z => setTimeout(z, 500));
    return document.body.classList.contains('immersive');
  })()`);
  ok('再双击正文退出全屏', !dbl2);

  const eff = await evaluate(`(async () => {
    const before = window.__orBookState().index;
    window.__orSetPageEffect('none');
    document.getElementById('btn-next').click();
    await new Promise(z => setTimeout(z, 260));
    const s = window.__orBookState();
    window.__orSetPageEffect('book');
    return { before, effect: s.effect, index: s.index,
      restored: window.__orBookState().effect };
  })()`);
  ok('设置可关掉动画，无动画仍正常翻页',
    eff.effect === 'none' && eff.index === eff.before + 1 && eff.restored === 'book',
    JSON.stringify(eff));

  // 抓一帧翻动中的 3D 纸张，作为「有翻书效果」的可视证据。
  await evaluate(`(() => {
    const c = document.getElementById('content');
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('click', { bubbles: true,
      clientX: r.left + r.width * 0.85, clientY: r.top + r.height * 0.5 }));
  })()`);
  await sleep(360 + 55);       // 单击判定 360ms 后起动画，取纸张倾斜的早期帧
  const flipping = await evaluate(`(() => {
    const f = document.querySelector('.book-front');
    const t = getComputedStyle(f).transform;
    return { transform: t.slice(0, 46), matrix3d: t.indexOf('matrix3d') === 0,
      flippingClass: f.classList.contains('book-flipping'),
      animating: window.__orBookState().animating };
  })()`);
  ok('翻页动画确实在做 3D 旋转（不是瞬间换页）',
    flipping.matrix3d && flipping.flippingClass && flipping.animating,
    JSON.stringify(flipping));
  const [pflip, sflip] = await shot('_ui-check-flip.png');
  ok('翻书动画中间帧截图', sflip > 3000, sflip + ' B -> ' + path.basename(pflip));
  await sleep(500);            // 等这页动画结束再切模式

  await evaluate(`document.getElementById('btn-read-mode').click(); true`);
  await sleep(900);
  ok('可以再切回连续滚动', await evaluate(
    `document.getElementById('content').classList.contains('stream')`));
  const scrollDbl = await evaluate(`(async () => {
    const c = document.getElementById('content');
    const r = c.getBoundingClientRect();
    const opt = { bubbles: true, clientX: r.left + r.width * 0.5,
      clientY: r.top + r.height * 0.5 };
    c.dispatchEvent(new MouseEvent('click', opt));
    await new Promise(z => setTimeout(z, 90));
    c.dispatchEvent(new MouseEvent('click', opt));
    await new Promise(z => setTimeout(z, 450));
    return document.body.classList.contains('immersive');
  })()`);
  ok('连续滚动模式下双击同样能全屏', scrollDbl);
  await evaluate(`document.getElementById('btn-exit-immersive').click(); true`);
  // 回到书架，否则视口矩阵里底部标签栏会因 in-reader 被隐藏。
  await evaluate(`document.querySelector('.or-tab[data-or="shelf"]').click(); true`);
  await sleep(300);

  /* v1.11.0：安卓目录是盖住正文的浮层，选完章节必须自动收起。
     CDP 里没有 Java，注入一个最小原生桥让移动端分支生效。 */
  await evaluate(`window.AndroidNative = { statsOptIn: function(){ return true; } }; true`);
  const tocAuto = await evaluate(`(async () => {
    const card = document.querySelector('.book-card');
    if (!card) return { err: 'no card' };
    card.click();
    await new Promise(r => setTimeout(r, 900));
    const v = document.getElementById('view-reader');
    const onOpen = v.classList.contains('toc-collapsed');
    document.getElementById('btn-toc-expand').click();
    const opened = !v.classList.contains('toc-collapsed');
    const items = document.querySelectorAll('.toc-item');
    const target = items[1] || items[0];
    if (target) target.click();
    await new Promise(r => setTimeout(r, 600));
    return { onOpen: onOpen, opened: opened,
      closed: v.classList.contains('toc-collapsed'), items: items.length,
      expandBtn: !document.getElementById('btn-toc-expand').classList.contains('hidden') };
  })()`);
  ok('安卓打开书时目录已收起（不必再点一次）', tocAuto.onOpen === true,
    JSON.stringify(tocAuto));
  ok('展开目录后点章节自动收起',
    tocAuto.opened && tocAuto.closed && tocAuto.expandBtn && tocAuto.items > 0,
    JSON.stringify(tocAuto));
  await evaluate(`document.getElementById('btn-back').click(); true`);
  await sleep(250);

  // ---- 多机型视口矩阵：小屏 / 常见 / 大屏 / 横屏 / 平板 / 不同 DPR ----
  const VIEWPORTS = [
    { name: '320×568 小屏 @2x', w: 320, h: 568, dpr: 2, phone: true },
    { name: '360×640 常见 @3x', w: 360, h: 640, dpr: 3, phone: true },
    { name: '390×844 P40  @3x', w: 390, h: 844, dpr: 3, phone: true },
    { name: '412×915 长屏 @3x', w: 412, h: 915, dpr: 3, phone: true },
    { name: '844×390 横屏 @3x', w: 844, h: 390, dpr: 3, phone: true },
    { name: '1024×768 平板 @2x', w: 1024, h: 768, dpr: 2, phone: false },
  ];
  for (const v of VIEWPORTS) {
    await send('Emulation.setDeviceMetricsOverride',
      { width: v.w, height: v.h, deviceScaleFactor: v.dpr, mobile: true });
    await sleep(220);
    const r = await evaluate(`(() => {
      const rect = (s) => { const e=document.querySelector(s); if(!e) return null;
        const b=e.getBoundingClientRect(); return [Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]; };
      const disp = (s) => { const e=document.querySelector(s); return e ? getComputedStyle(e).display : 'missing'; };
      return { top: rect('#or-topbar'), bottom: rect('#or-tabbar'),
               topDisp: disp('#or-topbar'), bottomDisp: disp('#or-tabbar'),
               sideDisp: disp('.sidebar'), tabs: document.querySelectorAll('.or-tab').length,
               overflowX: document.documentElement.scrollWidth - window.innerWidth,
               iw: window.innerWidth, ih: window.innerHeight };
    })()`);
    const chromeOK = v.phone
      ? (r.topDisp !== 'none' && r.bottomDisp !== 'none' && r.top[3] >= 36
         && r.bottom[1] + r.bottom[3] >= v.h - 2 && r.tabs === 5)
      : (r.topDisp === 'none' && r.bottomDisp === 'none' && r.sideDisp !== 'none');
    ok('视口 ' + v.name, chromeOK && r.overflowX <= 1,
      'iw=' + r.iw + ' top=' + JSON.stringify(r.top) + ' bottom=' + JSON.stringify(r.bottom)
      + ' overflowX=' + r.overflowX + ' side=' + r.sideDisp);
  }

  // ---- 极端情况：整台机器的 JS 被引擎拦掉，导航壳必须仍在 ----
  try {
    await send('Emulation.setDeviceMetricsOverride',
      { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await send('Emulation.setScriptExecutionDisabled', { value: true });
    await send('Page.navigate', { url: url + '?nojs=1' });
    await sleep(900);
    const nojs = await evaluate(`(() => {
      const d = (s) => { const e=document.querySelector(s); return e ? getComputedStyle(e).display : 'missing'; };
      return { top: d('#or-topbar'), bottom: d('#or-tabbar'),
               tabs: document.querySelectorAll('.or-tab').length,
               hasTopbar: !!document.getElementById('or-topbar') };
    })()`);
    ok('禁用全部 JS 后静态导航仍可见',
      nojs.hasTopbar && nojs.top === 'flex' && nojs.bottom === 'flex' && nojs.tabs === 5,
      JSON.stringify(nojs));
  } catch (e) {
    console.log('  SKIP 禁用 JS 检查：CDP 不支持该组合 (' + e.message + ')');
  } finally {
    try { await send('Emulation.setScriptExecutionDisabled', { value: false }); } catch { /* ignore */ }
  }
} catch (e) {
  fail++;
  console.log('  FAIL 渲染检查异常: ' + (e.stack || e.message));
} finally {
  if (ws && ws.readyState === 1) {
    try { await Promise.race([
      new Promise((r) => { ws.onclose = r; ws.send(JSON.stringify({ id: 9999, method: 'Browser.close' })); }),
      sleep(2000),
    ]); } catch { /* ignore */ }
  }
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
  // Windows 上 Chrome 的 Crashpad 可能仍锁着临时 profile，清理失败不影响测试结论。
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  server.close();
}

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) process.exit(1);
