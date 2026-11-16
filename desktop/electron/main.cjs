/* 开放书库 · Windows 桌面壳
   职责：原生窗口 / 菜单 / 文件对话框 / 生命周期。
   业务逻辑全部由内置的 Node 运行时跑 server.mjs + src/core，与浏览器、Android 共用同一份代码。 */
const { app, BrowserWindow, Menu, dialog, shell, ipcMain, session, webContents } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const APP_DIR = path.join(__dirname, '..');                 // resources/app
const EXE_DIR = path.dirname(app.getPath('exe'));
const BASE_DIR = process.env.PORTABLE_EXECUTABLE_DIR || EXE_DIR;
// 数据目录保持 ASCII 名，与参考软件一样放在 exe 同级的 data/，整包拷走即可迁移。
const LIBRARY_DIR = process.env.OPEN_READER_LIBRARY || path.join(BASE_DIR, 'data');
const ICON = path.join(APP_DIR, 'assets', 'app.ico');
const SERVER = path.join(APP_DIR, 'server.mjs');
const INTEGRITY_FILE = path.join(APP_DIR, 'integrity.json');
const BUNDLED_NODE = path.join(APP_DIR, 'runtime', 'node.exe');
const NODE_BIN = fs.existsSync(BUNDLED_NODE) ? BUNDLED_NODE : (process.env.OPEN_READER_NODE || 'node');
const LOG_FILE = path.join(app.getPath('userData'), 'backend.log');
// 求书服务（L1 测试版）：随 exe 启动，用同一个内置 node.exe，数据落在书库目录
const QIUSHU_DIR = path.join(APP_DIR, 'qiushu');
const QIUSHU_SERVER = path.join(QIUSHU_DIR, 'server.mjs');
const QIUSHU_PORT = 8787;
// 求书页地址内置于程序默认值（与 src/core/library.mjs 的 DEFAULT_SETTINGS.qiushu_url 一致），
// 不再写进 data/settings.json；管理页是私密路径，不在菜单里暴露。
const DEFAULT_QIUSHU_URL = 'https://soshu.pythonanywhere.com/qiushu/';
// 本机 8787 求书服务仅作回滚备用；管理口令走内置默认值，不在 data 生成 admin-token.txt。
const DEFAULT_QIUSHU_ADMIN_TOKEN = 'qiushu-admin';

// 求书到货角标（L2）：设备编号由求书页 persist:qiushu 分区持有，主进程只在
// 页面加载时读出来缓存到书库目录；查询走主进程 fetch，渲染层不碰公网 API、不需要 CORS。
const QIUSHU_DID_FILE = path.join(LIBRARY_DIR, 'qiushu-device-id.txt');
const DID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let qiushuDid = '';
let qiushuUnread = 0;

let win = null;
let child = null;
let qiushuChild = null;
let port = 0;
let shuttingDown = false;

try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch { /* noop */ }
function log(line) {
  try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`); } catch { /* noop */ }
}
process.on('uncaughtException', (e) => log('uncaughtException: ' + (e.stack || e.message)));
process.on('unhandledRejection', (e) => log('unhandledRejection: ' + (e && (e.stack || e.message) || e)));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

function waitReady(p, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${p}/api/state`, (res) => {
        res.resume();
        res.on('end', () => res.statusCode === 200 ? resolve() : retry());
      });
      const retry = () => {
        if (Date.now() - start > timeoutMs) reject(new Error('本地服务启动超时'));
        else setTimeout(tick, 250);
      };
      req.on('error', retry);
      req.setTimeout(1200, () => req.destroy());
    };
    tick();
  });
}

async function startBackend() {
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  port = await freePort();
  log(`启动后端: ${NODE_BIN} ${SERVER} --root ${LIBRARY_DIR} --port ${port}`);
  child = spawn(NODE_BIN, ['--no-warnings', SERVER,
    '--root', LIBRARY_DIR, '--port', String(port), '--host', '127.0.0.1', '--no-demo'], {
    cwd: APP_DIR, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (b) => log('out: ' + String(b).trim()));
  child.stderr.on('data', (b) => log('err: ' + String(b).trim()));
  child.on('exit', (code) => log('后端退出，代码 ' + code));
  await waitReady(port);
}

function stopBackend() {
  if (child && !child.killed) { try { child.kill(); } catch { /* noop */ } }
  child = null;
}

/* ---------- 求书服务：独立于阅读器后端，失败不影响主程序 ---------- */
function startQiushu() {
  try {
    if (!fs.existsSync(QIUSHU_SERVER)) { log('[qiushu] 未内置求书服务，跳过'); return; }
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;              // 内置的是真 node.exe，不要 Electron 兼容层
    env.PORT = String(QIUSHU_PORT);
    env.HOST = '127.0.0.1';
    env.STORE_DRIVER = 'file';
    env.DATA_DIR = LIBRARY_DIR;                  // 求书数据放书库目录，随整包拷走/备份
    // 口令固定传环境变量：qiushu/server.mjs 直接采用，不再生成 data/admin-token.txt
    env.ADMIN_TOKEN = env.ADMIN_TOKEN || DEFAULT_QIUSHU_ADMIN_TOKEN;
    qiushuChild = spawn(NODE_BIN, ['--no-warnings', QIUSHU_SERVER], {
      cwd: QIUSHU_DIR, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env,
    });
    qiushuChild.stdout.on('data', (b) => log('[qiushu] ' + String(b).trim()));
    qiushuChild.stderr.on('data', (b) => log('[qiushu] err: ' + String(b).trim()));
    qiushuChild.on('exit', (code) => log('[qiushu] 服务退出，代码 ' + code));
    qiushuChild.on('error', (e) => log('[qiushu] 启动失败: ' + e.message));
    log(`[qiushu] 已启动 http://127.0.0.1:${QIUSHU_PORT}/`);
  } catch (e) {
    log('[qiushu] 启动异常（不影响阅读器）: ' + (e.stack || e.message));
  }
}
function stopQiushu() {
  if (qiushuChild && !qiushuChild.killed) { try { qiushuChild.kill(); } catch { /* noop */ } }
  qiushuChild = null;
}

/* ---------- 求书到货角标（L2） ---------- */
// QIUSHU_API_BASE 仅供本地联调覆盖；默认用内置地址。
// data/settings.json 若手动写了 qiushu_url（含空串）则以其为准，可覆盖或禁用求书。
function qiushuApiBase() {
  if (process.env.QIUSHU_API_BASE) return String(process.env.QIUSHU_API_BASE).replace(/\/+$/, '');
  let u = DEFAULT_QIUSHU_URL;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(LIBRARY_DIR, 'settings.json'), 'utf8'));
    if (Object.prototype.hasOwnProperty.call(s, 'qiushu_url')) u = String(s.qiushu_url || '').trim();
  } catch { /* 文件不存在或损坏：用内置默认值 */ }
  return /^https?:\/\//i.test(u) ? new URL(u).origin : '';
}

function cacheDeviceId(v) {
  if (typeof v !== 'string') return;
  const did = v.trim();
  if (!DID_RE.test(did)) return;
  qiushuDid = did;
  try {
    fs.mkdirSync(LIBRARY_DIR, { recursive: true });
    fs.writeFileSync(QIUSHU_DID_FILE, did + '\n', { encoding: 'utf8', mode: 0o600 });
  } catch (e) { log('[qiushu] 设备编号写入失败: ' + e.message); }
}

function loadDeviceId() {
  if (qiushuDid) return qiushuDid;
  try {
    const v = fs.readFileSync(QIUSHU_DID_FILE, 'utf8').trim();
    if (DID_RE.test(v)) { qiushuDid = v; return v; }
  } catch { /* 还没打开过求书页：没有身份，自然也不会有到货提醒 */ }
  return '';
}

// 求书页加载完成后把 localStorage 里的设备编号抄一份到书库目录。
// 不覆盖、不重新签发：已有的求书记录和「换机恢复编号」全部照旧。
function captureDeviceId(wc) {
  if (!wc || wc.isDestroyed()) return;
  wc.executeJavaScript("localStorage.getItem('openreader.qiushu.device_id')")
    .then(cacheDeviceId).catch(() => {});
}

// 主进程代理查询：超时 8s，失败静默保留上次角标，不阻塞窗口、不弹错误。
async function fetchUnread() {
  const base = qiushuApiBase();
  const did = loadDeviceId();
  if (!base || !did) return { ok: false, unread_count: 0, reason: 'no-device' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`${base}/api/mine?device_id=${encodeURIComponent(did)}`, { signal: ctl.signal });
    if (!r.ok) return { ok: false, unread_count: qiushuUnread, reason: 'HTTP ' + r.status };
    const j = await r.json();
    qiushuUnread = Math.max(0, Number(j.unread_count) || 0);
    return { ok: true, unread_count: qiushuUnread };
  } catch (e) {
    return { ok: false, unread_count: qiushuUnread, reason: e.message };
  } finally { clearTimeout(timer); }
}

const send = (action) => { if (win && !win.isDestroyed()) win.webContents.send('menu', action); };

async function importFromMenu(openLib = false) {
  const opt = openLib
    ? { title: '导入整库 (.openlib)', properties: ['openFile'],
        filters: [{ name: '开放书库包', extensions: ['openlib', 'zip'] }] }
    : { title: '导入书籍', properties: ['openFile', 'multiSelections'],
        filters: [
          { name: '可直接阅读', extensions: [
            'txt', 'md', 'markdown', 'text', 'log', 'rst', 'tex', 'srt', 'csv', 'json', 'xml', 'nfo',
            'epub', 'docx', 'doc', 'pdf', 'rtf', 'odt', 'ott', 'fb2', 'html', 'htm', 'xhtml',
            'mht', 'mhtml', 'mobi', 'prc', 'pdb', 'azw', 'zip',
          ] },
          { name: '仅保存原件', extensions: ['azw3', 'chm', 'djvu', 'cbz', 'cbr'] },
          { name: '所有文件', extensions: ['*'] },
        ] };
  const r = await dialog.showOpenDialog(win, opt);
  if (r.canceled || !r.filePaths.length) return;
  let ok = 0, bad = 0;
  for (const file of r.filePaths) {
    try {
      const bytes = fs.readFileSync(file);
      const url = openLib ? '/api/import-library' : '/api/import-book';
      const headers = { 'Content-Type': 'application/octet-stream' };
      if (!openLib) headers['x-file-name'] = encodeURIComponent(path.basename(file));
      const res = await fetch(`http://127.0.0.1:${port}${url}`, { method: 'POST', headers, body: bytes });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
      ok++;
    } catch (e) { bad++; log('导入失败 ' + file + ': ' + e.message); }
  }
  if (win && !win.isDestroyed()) win.webContents.send('library-changed');
  if (bad) dialog.showMessageBox(win, { type: 'warning', title: '导入结果',
    message: `成功 ${ok} 个，失败 ${bad} 个。\n详细信息见运行日志。` });
}

/* 从菜单栏卸载：主进程活着时删不掉自己的运行文件，
   所以先把内嵌的卸载器复制到 %TEMP%（它要删的目录包含自己），
   退出当前进程后再由它接手删除。卸载器靠环境变量跳过重复确认。 */
async function uninstallFromMenu() {
  const src = path.join(EXE_DIR, '卸载开放书库.exe');
  if (!fs.existsSync(src)) {
    dialog.showMessageBox(win, { type: 'warning',
      message: '找不到卸载组件。\n请重新下载最新版的 开放书库.exe，'
        + '或手动删除 %LOCALAPPDATA%\\OpenReader 与 %APPDATA%\\开放书库。' });
    return;
  }
  const r = await dialog.showMessageBox(win, {
    type: 'warning', title: '卸载开放书库',
    message: '将删除运行文件、默认书库和缓存，且不可恢复。\n\n'
      + '自定义书库目录不会被删除，卸载前会让你先打开保存一份。\n'
      + '不会在控制面板留下卸载项。\n\n'
      + '点「继续卸载」会立即退出程序并打开卸载工具。',
    buttons: ['取消', '继续卸载'], defaultId: 0, cancelId: 0,
  });
  if (r.response !== 1) return;
  const tmp = path.join(app.getPath('temp'), 'OpenReaderUninstall.exe');
  try {
    fs.copyFileSync(src, tmp);
    spawn(tmp, [], {
      detached: true, stdio: 'ignore',
      env: { ...process.env, OR_UNINSTALL_CONFIRMED: '1' },
    }).unref();
    log('已从菜单启动卸载器: ' + tmp);
    stopBackend();
    stopQiushu();
    app.exit(0);
  } catch (e) {
    log('启动卸载器失败: ' + e.message);
    dialog.showErrorBox('无法卸载', e.message);
  }
}

function buildMenu() {
  const template = [
    { label: '文件(&F)', submenu: [
      { label: '导入书籍…', accelerator: 'Ctrl+O', click: () => importFromMenu(false) },
      { label: '导入整库 (.openlib)…', click: () => importFromMenu(true) },
      { type: 'separator' },
      { label: '导出整库…', click: () => send('export-library') },
      { label: '打开书库目录', click: () => shell.openPath(LIBRARY_DIR) },
      { type: 'separator' },
      { label: '退出', role: 'quit' },
    ] },
    { label: '阅读(&R)', submenu: [
      { label: '返回书架', accelerator: 'Escape', click: () => send('back') },
      { type: 'separator' },
      { label: '放大字号', accelerator: 'Ctrl+=', click: () => send('font-up') },
      { label: '缩小字号', accelerator: 'Ctrl+-', click: () => send('font-down') },
      { label: '切换主题', accelerator: 'Ctrl+T', click: () => send('theme') },
      { label: '添加书签', accelerator: 'Ctrl+D', click: () => send('bookmark') },
      { type: 'separator' },
      { label: '全屏阅读（F11）', click: () => send('fullscreen') },
    ] },
    { label: '工具(&T)', submenu: [
      { label: '设置', accelerator: 'Ctrl+,', click: () => send('settings') },
      { label: '重建全文索引', click: () => send('reindex') },
      { type: 'separator' },
      { label: '重新加载界面', role: 'reload' },
      { label: '开发者工具', accelerator: 'F12', role: 'toggleDevTools' },
    ] },
    { label: '帮助(&H)', submenu: [
      { label: '关于 开放书库', click: () => send('about') },
      { label: '检查更新(&U)', click: () => {
        pcUpdateFlow(true).catch(e => log('手动更新异常: ' + e.message)); } },
      { label: '下载完整安装包(&D)', click: () => { shell.openExternal(PC_FULL_URL); } },
      { label: '查看运行日志', click: () => { if (fs.existsSync(LOG_FILE)) shell.openPath(LOG_FILE);
        else dialog.showMessageBox({ message: '暂无日志记录' }); } },
    ] },
    { label: '卸载(&X)', click: () => { uninstallFromMenu(); } },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* L2 防篡改：清单由 build/make-integrity.mjs 生成。
   没有清单（开发态）直接跳过；发现不一致只提示、不阻断，
   避免误报把一台离线的书库变成打不开。 */
function verifyIntegrity() {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(INTEGRITY_FILE, 'utf8')); }
  catch { return; }
  const bad = [];
  for (const [rel, want] of Object.entries(manifest.files || {})) {
    try {
      const got = crypto.createHash('sha256')
        .update(fs.readFileSync(path.join(APP_DIR, rel))).digest('hex');
      if (got !== want) bad.push(rel);
    } catch { bad.push(rel); }
  }
  if (!bad.length) return;
  // 只写日志，不弹窗：正常升级/同步文件后不该让用户看到「被修改」的提示。
  log('完整性校验不一致（仅记录，不影响使用）: ' + bad.join(', '));
}

/* ── PC 版应用内热更新（与安卓同一套清单口径）──────────────────────────
   97 MB 自释放壳不动，只替换 resources/app 下除 runtime/ 外的业务文件。
   冷启动在「启动后端 / 创建窗口」之前检查：此时没有窗口、没有子进程，
   force 门禁天然生效，与安卓 startupUpdateCheck 一致。
   拉清单失败 / 清单畸形 / 离线 → 静默放行，绝不把离线书库变砖；
   已进入门禁后下载或校验失败 → 只给「重试 / 退出应用」，不放行。 */
const PC_OR_BASE = 'https://soshu.pythonanywhere.com/or/';
const PC_UPDATE_URL = PC_OR_BASE + 'pc-update.json';
const PC_FULL_URL = PC_OR_BASE + 'pc-full';   // 服务端 302 到实际网盘地址，落点可换
const PC_STATE_DIR = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'OpenReader') : app.getPath('userData');
const PC_VERSION_FILE = path.join(PC_STATE_DIR, 'pc-version.json');
const PC_BACKUP_DIR = path.join(PC_STATE_DIR, 'patch-backup');
const PC_ALLOWED = /^(src|electron|qiushu|assets)\/[^\\:*?"<>|]+$|^server\.mjs$|^package\.json$|^integrity\.json$|^pc-baseline\.json$/;
const PC_TIMEOUT = 8000;

function pcLocalCode() {
  try {
    const n = Number(JSON.parse(fs.readFileSync(PC_VERSION_FILE, 'utf8')).code);
    if (n) return n;
  } catch { /* 没更新过，读出包时的基线 */ }
  try {
    return Number(JSON.parse(fs.readFileSync(path.join(APP_DIR, 'pc-baseline.json'), 'utf8')).code) || 0;
  } catch { return 0; }
}
function pcWriteCode(code) {
  fs.mkdirSync(PC_STATE_DIR, { recursive: true });
  fs.writeFileSync(PC_VERSION_FILE,
    JSON.stringify({ code, updated: new Date().toISOString() }) + '\n');
}
async function pcFetch(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}
const pcDialog = (opt) => (win && !win.isDestroyed()
  ? dialog.showMessageBox(win, opt) : dialog.showMessageBox(opt));

/** 只接受本域清单；补丁整体 sha256 + 每个文件 sha256 + 路径白名单全过才返回。 */
function pcParsePatch(buf, wantSha) {
  if (crypto.createHash('sha256').update(buf).digest('hex') !== wantSha)
    throw new Error('补丁校验失败，可能下载不完整');
  const j = JSON.parse(buf.toString('utf8'));
  if (!Number.isInteger(j.code) || !j.files || typeof j.files !== 'object')
    throw new Error('补丁格式错误');
  const items = [];
  for (const [rel, v] of Object.entries(j.files)) {
    if (!PC_ALLOWED.test(rel) || rel.includes('..') || rel.includes('\\') || rel.startsWith('/'))
      throw new Error('补丁含非法路径: ' + rel);
    const b = Buffer.from(String(v.b64 || ''), 'base64');
    if (crypto.createHash('sha256').update(b).digest('hex') !== v.sha256)
      throw new Error('文件校验失败: ' + rel);
    items.push([rel, b]);
  }
  if (!items.length) throw new Error('补丁为空');
  return { code: j.code, items };
}
/** 全量校验通过后才落盘；中途任何失败把已写文件从备份还原。 */
function pcApply(items) {
  const done = [];
  try {
    fs.mkdirSync(PC_BACKUP_DIR, { recursive: true });
    for (const [rel, b] of items) {
      const target = path.join(APP_DIR, rel);
      const backup = path.join(PC_BACKUP_DIR, rel);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      if (fs.existsSync(target)) fs.copyFileSync(target, backup);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, b);
      done.push(rel);
    }
  } catch (e) {
    for (const rel of done) {
      const bk = path.join(PC_BACKUP_DIR, rel);
      if (fs.existsSync(bk)) fs.copyFileSync(bk, path.join(APP_DIR, rel));
      else fs.rmSync(path.join(APP_DIR, rel), { force: true });   // 新增文件无备份，删掉避免误判已更新
    }
    throw e;
  }
  fs.rmSync(PC_BACKUP_DIR, { recursive: true, force: true });
}

async function pcUpdateFlow(manual) {
  let m;
  try { m = JSON.parse((await pcFetch(PC_UPDATE_URL, PC_TIMEOUT)).toString('utf8')); }
  catch (e) {
    log('PC 更新检查跳过: ' + e.message);
    if (manual) await pcDialog({ message: '暂时无法检查更新，请稍后再试。' });
    return 'skip';
  }
  const code = Number(m.code) || 0;
  if (!Number.isInteger(code) || code <= pcLocalCode()) {
    if (manual) await pcDialog({ message: '当前已是最新版本。' });
    return 'none';
  }
  const force = m.force !== false;          // 缺字段也强制

  // 大版本：热补丁换不了 97 MB 的壳 / runtime，必须重新下载完整安装包。
  // 只弹框 + 打开下载页，不自动下载（网盘 97 MB 失败率高，且运行中 exe 被锁）。
  if (m.require_full === true) {
    const msg = '此版本需要重新下载完整安装包。\n\n'
      + String(m.name || code) + (m.notes ? '\n' + String(m.notes) : '')
      + '\n\n点「打开下载页」会用浏览器打开下载页面，下载后覆盖现有的「开放书库.exe」即可；'
      + '书库数据不会丢失。';
    const btns = force ? ['打开下载页', '退出应用']
                       : ['打开下载页', '稍后再说', '退出应用'];
    const r = await pcDialog({
      type: 'info', title: '开放书库需要更新', message: msg,
      buttons: btns, defaultId: 0, cancelId: btns.length - 1,
    });
    const pick = btns[r.response];
    if (pick === '稍后再说') return 'later';
    if (pick === '打开下载页') shell.openExternal(PC_FULL_URL);
    app.quit();
    return 'quit';
  }

  const url = String(m.url || '');
  const want = String(m.sha256 || '');
  if (!url.startsWith(PC_OR_BASE) || !/^[0-9a-f]{64}$/i.test(want)) {
    log('PC 更新清单不合法，跳过'); return 'skip';
  }
  const msg = '发现新版本 ' + String(m.name || code)
    + (m.notes ? '\n\n' + String(m.notes) : '')
    + '\n\n更新只替换程序文件，不会动书库。';
  const buttons = force ? ['立即更新', '退出应用'] : ['立即更新', '稍后再说', '退出应用'];
  if (win && !win.isDestroyed()) win.setEnabled(false);   // 手动检查时先锁窗口
  const choice = await pcDialog({
    type: 'info', title: '开放书库需要更新', message: msg,
    buttons, defaultId: 0, cancelId: 1,
  });
  const picked = buttons[choice.response];
  if (picked === '稍后再说') { if (win && !win.isDestroyed()) win.setEnabled(true); return 'later'; }
  if (picked === '退出应用') { app.quit(); return 'quit'; }

  // 已进入门禁：失败只给重试 / 退出，绝不静默放行
  for (;;) {
    try {
      const patch = pcParsePatch(await pcFetch(url, 60000), want);
      if (patch.code !== code) throw new Error('补丁版本与清单不一致');
      pcApply(patch.items);
      pcWriteCode(code);
      break;
    } catch (e) {
      log('PC 更新失败: ' + e.message);
      const r = await pcDialog({
        type: 'error', title: '更新失败',
        message: e.message + '\n\n已还原原有文件，可以重试。',
        buttons: ['重试', '退出应用'], defaultId: 0, cancelId: 1,
      });
      if (r.response === 1) { app.quit(); return 'quit'; }
    }
  }
  await pcDialog({ message: '更新完成，程序将自动重启。', buttons: ['确定'] });
  app.relaunch();
  app.exit(0);
  return 'done';
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240, height: 820, minWidth: 940, minHeight: 620,
    title: '开放书库 · 阅读器',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    backgroundColor: '#f6f7f9',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      webviewTag: true,   // 求书 / 云书库页内嵌网页
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(`http://127.0.0.1:${port}/`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
}

const locked = app.requestSingleInstanceLock();
if (!locked) {
  log('单实例锁被占用，已有实例在运行，本实例退出');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  // 求书 webview 的 guest 一创建就接管外链，不依赖 dom-ready 时机。
  // 单靠渲染层 armWebview 有竞态：页面加载慢时用户先点了「打开链接」，
  // 请求会被 Electron 静默丢弃，表现为「点了没反应」。
  app.on('web-contents-created', (_e, wc) => {
    if (wc.getType() !== 'webview') return;
    if (!wc.__qiushuArmed) {
      wc.__qiushuArmed = true;
      wc.setWindowOpenHandler(({ url }) => {
        if (/^https?:/.test(url)) shell.openExternal(url);
        return { action: 'deny' };
      });
    }
    if (!wc.__qiushuDidHooked) {
      wc.__qiushuDidHooked = true;
      wc.on('did-finish-load', () => setTimeout(() => captureDeviceId(wc), 250));
    }
  });

  app.whenReady().then(async () => {
    log('[main] Electron ready');
    // 冷启动强制更新门禁：必须在 startBackend / createWindow 之前。
    // 此时无窗口、无子进程，force=true 时用户进不了阅读界面。
    try {
      const r = await pcUpdateFlow(false);
      if (r === 'quit' || r === 'done') return;
    } catch (e) { log('启动更新检查异常（放行）: ' + (e.stack || e.message)); }
    try {
      await startBackend();
      log('[main] 后端就绪，端口 ' + port);
      startQiushu();   // 求书服务并行启动，不阻塞窗口创建
    } catch (e) {
      log('启动失败: ' + (e.stack || e.message));
      dialog.showErrorBox('开放书库启动失败',
        `${e.message}\n\n请确认程序目录完整（runtime/node.exe 与 server.mjs 存在）。\n运行日志：${LOG_FILE}`);
      app.quit();
      return;
    }
    try {
      ipcMain.handle('open-library-dir', () => shell.openPath(LIBRARY_DIR));
      // 全屏阅读：渲染层切换沉浸布局时同步切换 Electron 原生全屏
      ipcMain.handle('set-fullscreen', (_e, on) => {
        if (win && !win.isDestroyed()) win.setFullScreen(!!on);
        return !!(win && !win.isDestroyed() && win.isFullScreen());
      });
      // 求书 webview 的 guest 页面若试图弹新窗口，一律交给系统浏览器，禁止在应用内开窗
      ipcMain.handle('arm-webview', (_e, id) => {
        const wc = webContents.fromId(Number(id));
        if (!wc) return;
        if (!wc.__qiushuArmed) {
          wc.__qiushuArmed = true;
          wc.setWindowOpenHandler(({ url }) => {
            if (/^https?:/.test(url)) shell.openExternal(url);
            return { action: 'deny' };
          });
        }
        captureDeviceId(wc);   // dom-ready 时设备编号已生成，立刻缓存一次
      });
      ipcMain.handle('qiushu-unread', () => fetchUnread());
      session.defaultSession.on('will-download', (_e, item) => {
        item.setSaveDialogOptions({
          title: '保存到', defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
        });
      });
      buildMenu();
      createWindow();
      verifyIntegrity();
      log('[main] 窗口已创建');
    } catch (e) {
      log('创建窗口失败: ' + (e.stack || e.message));
      dialog.showErrorBox('开放书库启动失败', e.message);
      app.quit();
    }
  });

  // 不监听 window-all-closed：Electron 在 Windows 上默认会在最后一个窗口关闭后退出。
  // 若在此主动 app.quit()，异步启动后端期间可能误触发，导致窗口刚建好就被关闭。
  app.on('before-quit', () => { shuttingDown = true; stopBackend(); stopQiushu(); });
  app.on('will-quit', () => { stopBackend(); stopQiushu(); });
  process.on('exit', () => { stopBackend(); stopQiushu(); });
}
