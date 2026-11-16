/* 针对最终绿色版产物的端到端验证：
   中文安装路径 + 包内 Node 运行时 + SQLite 索引 + EPUB/PDF/RTF 解析 + 静态资源 + 导出。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist', '开放书库');
const APP = path.join(DIST, 'resources', 'app');
const NODE = path.join(APP, 'runtime', 'node.exe');
const SERVER = path.join(APP, 'server.mjs');
// 验证专用书库放临时目录（仍含中文，保留中文路径覆盖）。
// 绝不能用 dist/开放书库/data —— 那是绿色版使用者的真实书库，清理它会把用户的书全删掉。
const DATA = path.join(os.tmpdir(), '开放书库-验证-' + process.pid);
const EXE = path.join(DIST, '开放书库.exe');
const PORT = 18991;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (n, c, extra = '') => {
  if (c) { pass++; console.log('  PASS ', n, extra); }
  else { fail++; console.log('  FAIL ', n, extra); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n== 绿色版产物端到端验证 ==');
for (const [n, p] of [
  ['主程序', EXE], ['内置 Node', NODE], ['服务', SERVER],
  ['前端', path.join(APP, 'src', 'web', 'index.html')],
  ['PDF 解析模块', path.join(APP, 'src', 'core', 'pdf.mjs')],
  ['扩展格式模块', path.join(APP, 'src', 'core', 'formats.mjs')],
]) {
  ok('文件齐备 · ' + n, fs.existsSync(p));
}
if (fail) { console.log('产物不完整，中止'); process.exit(1); }

// 只清理本次验证专用的临时书库（从零开始），不触碰交付包内的用户 data/
fs.rmSync(DATA, { recursive: true, force: true });
const child = spawn(NODE, ['--no-warnings', SERVER, '--root', DATA,
  '--port', String(PORT), '--host', '127.0.0.1'], {
  cwd: APP, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (b) => { log += b; });
child.stderr.on('data', (b) => { log += b; });

function get(url) {
  return new Promise((resolve, reject) => {
    const r = http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    r.on('error', reject); r.setTimeout(2000, () => r.destroy(new Error('timeout')));
  });
}
function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request(url, { method: 'POST', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    r.on('error', reject); r.end(body);
  });
}
const jsonPost = async (action, obj) => JSON.parse((await post(BASE + '/api/' + action,
  Buffer.from(JSON.stringify(obj)), { 'Content-Type': 'application/json' })).buf.toString());

let ready = false;
for (let i = 0; i < 60; i++) {
  try { const r = await get(BASE + '/api/state'); if (r.status === 200) { ready = true; break; } } catch { /* retry */ }
  await sleep(250);
}
ok('01 中文路径下内置 Node 服务可启动', ready, ready ? '' : log.slice(-400));

if (ready) {
  const state = JSON.parse((await get(BASE + '/api/state')).buf.toString());
  ok('02 SQLite + LIKE 索引在中文路径可用', state.index.kind === 'sqlite', state.index.kind + ' / like');
  ok('03 书库目录由 --root 指定且位于中文路径',
    path.resolve(state.root) === path.resolve(DATA) && /[^\x00-\x7f]/.test(DATA), state.root);
  ok('04 首次启动自动灌入示例书', state.books.length >= 2, state.books.length + ' 本');

  const html = (await get(BASE + '/')).buf.toString();
  ok('05 完整前端界面可访问', html.includes('开放书库') && html.includes('shelf-grid'));

  const epub = fs.readFileSync(path.join(HERE, 'fixtures', 'sample.epub'));
  const imp = await post(BASE + '/api/import-book', epub,
    { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent('验证用书.epub') });
  const book = JSON.parse(imp.buf.toString());
  ok('06 产物内 EPUB 解析成功', book.parse_status === 'ok' && book.chapterCount === 2,
    book.parse_status + ' / ' + book.chapterCount + ' 章' + (book.parse_error ? ' / ' + book.parse_error : ''));

  const read = await jsonPost('read-chapter', { id: book.id, chapterId: book.chapters[0].id, offset: 0, limit: 4000 });
  ok('07 产物内章节正文可读', (read.text || '').includes('青瓦纸鸢'), (read.text || '').length + ' 字');

  const out = (await get(BASE + '/api/export-book?id=' + encodeURIComponent(book.id))).buf;
  ok('08 原件导出与导入字节一致', Buffer.compare(out, epub) === 0, out.length + ' 字节');

  const hits = await jsonPost('search', { q: '青瓦纸鸢' });
  ok('09 全文检索命中 EPUB 内容', hits.results.some((h) => h.bookId === book.id));

  const settings = await jsonPost('set-settings', { patch: { theme: 'sepia', font_size: 20 } });
  ok('10 设置持久化', settings.theme === 'sepia' && settings.font_size === 20);

  const pack = (await get(BASE + '/api/export-library')).buf;
  ok('11 整库导出为标准 ZIP', pack[0] === 0x50 && pack[1] === 0x4b, (pack.length / 1024).toFixed(1) + ' KB');

  const pdf = fs.readFileSync(path.join(HERE, 'fixtures', 'pdf_cmap.pdf'));
  const pimp = await post(BASE + '/api/import-book', pdf,
    { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent('验证用 PDF.pdf') });
  const pbook = JSON.parse(pimp.buf.toString());
  ok('12 产物内 PDF 中文 ToUnicode 解析成功',
    pbook.parse_status === 'ok' && pbook.chapterCount === 2 && pbook.title === '开放书库',
    pbook.parse_status + ' / ' + pbook.chapterCount + ' 章 / ' + pbook.title +
    (pbook.parse_error ? ' / ' + pbook.parse_error : ''));

  const pread = await jsonPost('read-chapter',
    { id: pbook.id, chapterId: pbook.chapters[0].id, offset: 0, limit: 4000 });
  ok('13 产物内 PDF 按页正文可读', (pread.text || '').includes('青瓦纸鸢'));

  const pout = (await get(BASE + '/api/export-book?id=' + encodeURIComponent(pbook.id))).buf;
  ok('14 产物内 PDF 原件导出字节一致', Buffer.compare(pout, pdf) === 0, pout.length + ' 字节');

  const rtf = fs.readFileSync(path.join(HERE, 'fixtures', 'sample.rtf'));
  const rimp = await post(BASE + '/api/import-book', rtf,
    { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent('验证用 RTF.rtf') });
  const rbook = JSON.parse(rimp.buf.toString());
  ok('15 产物内 RTF 中文解析成功',
    rbook.parse_status === 'ok' && rbook.chapterCount === 2,
    rbook.parse_status + ' / ' + rbook.chapterCount + ' 章');

  ok('16 前端导入过滤器已列出 PDF', html.includes('.pdf') && html.includes('.mobi'));

  const scan = fs.readFileSync(path.join(HERE, 'fixtures', 'pdf_scanned_jpeg.pdf'));
  const sim = await post(BASE + '/api/import-book', scan,
    { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent('扫描图册.pdf') });
  const sbook = JSON.parse(sim.buf.toString());
  ok('17 产物内扫描版 PDF 生成原页图片章节',
    sbook.parse_status === 'ok' && sbook.chapterCount === 2 && !!sbook.chapters?.[0]?.image,
    sbook.parse_status + ' / ' + sbook.chapterCount + ' 页');

  const img = (await get(BASE + '/api/page-image?id=' + encodeURIComponent(sbook.id)
    + '&chapterId=' + encodeURIComponent(sbook.chapters[0].id))).buf;
  ok('18 产物内页面图片端点返回 JPEG', img[0] === 0xff && img[1] === 0xd8, img.length + ' 字节');

  const webCss = (await get(BASE + '/style.css')).buf.toString();
  const webJs = (await get(BASE + '/app.js')).buf.toString();
  ok('19 目录为左侧常驻面板（顶部下拉已移除）',
    html.includes('id="toc-list"') && !html.includes('chapter-select') &&
    webCss.includes('.toc-list') && webJs.includes('function renderToc'));
  ok('20 扫描 PDF 采用连续滚动页流',
    webCss.includes('.scan-stream') && webJs.includes('function appendScanPages'));

  // —— v1.2 求书功能（飞书表单嵌入）——
  const setQ = await jsonPost('set-settings', { patch: { qiushu_url: 'https://example.com/qiushu-form' } });
  const stateQ = JSON.parse((await get(BASE + '/api/state')).buf.toString());
  ok('21 求书链接仍可显式覆盖并随书库持久化',
    setQ.qiushu_url === 'https://example.com/qiushu-form' &&
    stateQ.settings.qiushu_url === 'https://example.com/qiushu-form');
  ok('21b 云书库默认地址随 state 下发（settings.json 里没有也能用）',
    stateQ.settings.shuku_url === 'https://soshu.pythonanywhere.com/shuku/');
  await jsonPost('set-settings', { patch: { qiushu_url: '' } });

  ok('22 求书入口与内嵌容器已在界面就位',
    html.includes('data-view="request"') && html.includes('id="request-body"') &&
    webJs.includes('function renderRequest') && webCss.includes('.request-webview'));

  const electronMain = fs.readFileSync(path.join(APP, 'electron', 'main.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(APP, 'electron', 'preload.cjs'), 'utf8');
  ok('23 Electron 壳已启用 webview 并接管弹窗',
    electronMain.includes('webviewTag: true') && electronMain.includes('arm-webview') &&
    preload.includes('armWebview'));
  const coreLib = fs.readFileSync(path.join(APP, 'src', 'core', 'library.mjs'), 'utf8');
  // 在线页地址已改为程序内置默认值，设置弹窗不再暴露链接输入框（用户明确要求）。
  ok('24 在线页地址内置且不落盘、设置弹窗不含链接输入框',
    coreLib.includes("shuku_url: 'https://soshu.pythonanywhere.com/shuku/'") &&
    coreLib.includes('persistableSettings') && !webJs.includes("id=\"s-qiushu\""));
  ok('25 云书库入口与内嵌视图已在产物就位',
    html.includes('data-view="shuku"') && html.includes('id="view-shuku"') &&
    html.includes('id="shuku-body"') && webJs.includes('function renderShuku'));
  ok('26 云书库与求书共用分区，页内跳「去求书」不丢设备编号',
    /function renderShuku[\s\S]*?persist:qiushu/.test(webJs));
}

child.kill();
await sleep(300);
// 只清理验证用的临时书库；交付包内 dist/开放书库/data 是用户书库，保持原样
fs.rmSync(DATA, { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
