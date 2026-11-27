/* Regenerate Android WebView assets from the Windows open-reader source.
   The desktop source stays untouched; only a few explicit patches are applied.
   Usage: node sync-web.mjs   (from the 安卓 folder)

   Output is a classic-script build: esbuild bundles bootstrap.mjs -> bundle.js
   at ES2017 / IIFE, so old Android System WebView doesn't need ES module
   support, optional chaining, top-level await or DecompressionStream. */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 版本号的唯一真源。build-apk.ps1 / 三套自检都读同一个文件，避免漏改导致误报更新。
const V = JSON.parse(fs.readFileSync(path.join(HERE, 'version.json'), 'utf8'));
const SRC = path.resolve(HERE, '..', 'PC');
const ASSETS = path.join(HERE, 'app', 'src', 'main', 'assets');
const WEB = path.join(SRC, 'src', 'web');
const CORE = path.join(SRC, 'src', 'core');
const TOOLCHAIN = path.join(process.env.LOCALAPPDATA || '', 'OpenReaderToolchain');
const FFLATE = path.join(TOOLCHAIN, 'node_modules', 'fflate', 'esm', 'browser.js');
const ESBUILD = path.join(TOOLCHAIN, 'node_modules', 'esbuild', 'bin', 'esbuild');

function need(p) {
  if (!fs.existsSync(p)) throw new Error('源文件不存在: ' + p);
  return fs.readFileSync(p, 'utf8');
}
function write(rel, text) {
  const dst = path.join(ASSETS, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, text, 'utf8');
  return rel;
}
function copy(rel, src) {
  const dst = path.join(ASSETS, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return rel;
}
function mustReplace(s, a, b, label) {
  if (!s.includes(a)) throw new Error(label + '：补丁未匹配到目标片段');
  return s.replace(a, b);
}

const done = [];

/* ---------------------------------------------------------------------------
   0. vendor: pure-JS DEFLATE.  WebView's DecompressionStream('deflate-raw')
   only exists on Chromium 103+, which Huawei P40 / EMUI WebView does not have.
   --------------------------------------------------------------------------- */
if (!fs.existsSync(FFLATE) || !fs.existsSync(ESBUILD)) {
  throw new Error('缺少构建依赖。请先执行：\n'
    + '  cd "%LOCALAPPDATA%\\OpenReaderToolchain" && npm install esbuild@0.28.2 fflate@0.8.2');
}
done.push(copy('vendor/fflate.mjs', FFLATE));

const RAW_INFLATE = /async function inflateRaw\(bytes\) \{\s*\n\s*const ds = new DecompressionStream\('deflate-raw'\);\s*\n\s*const stream = new Blob\(\[bytes\]\)\.stream\(\)\.pipeThrough\(ds\);\s*\n\s*return new Uint8Array\(await new Response\(stream\)\.arrayBuffer\(\)\);\s*\n\}/;
const RAW_INFLATE_NEW = 'async function inflateRaw(bytes) {\n'
  + '  return inflateSync(bytes); // Android: 纯 JS DEFLATE，兼容老 WebView\n}';

const PDF_FLATE = /async function flate\(data\) \{[\s\S]*?\n\}/;
const PDF_FLATE_NEW = 'async function flate(data) {\n'
  + "  try { return unzlibSync(data); } catch { /* 试 raw deflate */ }\n"
  + "  try { return inflateSync(data); } catch { /* 两种包装都不行 */ }\n"
  + "  throw new Error('FlateDecode 数据无法解压');\n}";

// 1. core: every module is pure Web-standard JS except storage.mjs.
const coreFiles = fs.readdirSync(CORE).filter((f) => f.endsWith('.mjs') && f !== 'storage.mjs');
for (const f of coreFiles) {
  let s = need(path.join(CORE, f));

  if (f === 'indexer.mjs') {
    // 源码用 top-level await 探测 node:sqlite；老 WebView 不支持 TLA，直接恒为内存索引。
    const tla = /let DatabaseSync = null;\s*\ntry \{\s*\n\s*\(\{\s*DatabaseSync\s*\} = await import\('node:sqlite'\)\);\s*\n\} catch \{\s*\n\s*DatabaseSync = null;\s*\n\}/;
    if (!tla.test(s)) throw new Error('indexer.mjs 未匹配到 node:sqlite 初始化块');
    s = s.replace(tla, 'const DatabaseSync = null; // Android WebView 无 node:sqlite，恒走内存索引');
    if (/\bawait\s+import\(|await Promise\.reject/.test(s)) {
      throw new Error('indexer.mjs 仍残留顶层 await');
    }
  }

  if (f === 'parsers.mjs' || f === 'pack.mjs') {
    if (!RAW_INFLATE.test(s)) throw new Error(f + ' 未匹配到 inflateRaw');
    s = s.replace(RAW_INFLATE, RAW_INFLATE_NEW);
    s = "import { inflateSync } from '../vendor/fflate.mjs';\n" + s;
  }
  if (f === 'pdf.mjs') {
    if (!PDF_FLATE.test(s)) throw new Error('pdf.mjs 未匹配到 flate()');
    s = s.replace(PDF_FLATE, PDF_FLATE_NEW);
    s = "import { inflateSync, unzlibSync } from '../vendor/fflate.mjs';\n" + s;
  }
  done.push(write('core/' + f, s));
}
// Some future core module might import storage.mjs directly: keep a working shim.
done.push(write('core/storage.mjs',
  "export { AndroidStorage, createAndroidStorage as createNodeStorage } from '../android-storage.mjs';\n"));

// 2. static assets
for (const f of ['style.css', 'favicon.svg']) {
  const p = path.join(WEB, f);
  if (fs.existsSync(p)) done.push(copy(f, p));
}

/* ---------------------------------------------------------------------------
   3. index.html: static phone shell + classic scripts.
   The nav DOM is IN THE HTML, so it exists even when JS fails outright.
   --------------------------------------------------------------------------- */
let html = need(path.join(WEB, 'index.html'));

/* 常驻导航一律用内联 SVG，不依赖 ROM 自带的符号字体。
   华为/小米/OPPO 等定制字体缺 ☰ ☁ ✎ ⚙ ▤ 字形时会显示豆腐块。 */
const IC = (d, extra) => '<svg class="or-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
  + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + d + (extra || '') + '</svg>';
const ICON_MENU = IC('<path d="M4 7h16M4 12h16M4 17h16"/>');
const ICON_SEARCH = IC('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>');
const ICON_PLUS = IC('<path d="M12 5v14M5 12h14"/>');
const ICON_SHELF = IC('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M9 3v18"/>');
const ICON_MARK = IC('<path d="M6 3h12v18l-6-4-6 4V3z"/>');
const ICON_CLOUD = IC('<path d="M7 18h10a3.5 3.5 0 0 0 .3-7 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 18z"/>');
const ICON_PEN = IC('<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/>');
const ICON_GEAR = IC('<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>');

const SHELL = `<header id="or-topbar">
  <button id="or-menu-btn" type="button" aria-label="打开菜单" title="开放书库 v${V.name}">${ICON_MENU}</button>
  <div id="or-title">开放书库</div>
  <button id="or-search-btn" type="button" aria-label="搜索">${ICON_SEARCH}</button>
  <button id="or-import-btn" type="button" aria-label="导入书籍">${ICON_PLUS}<span>导入</span></button>
</header>
<nav id="or-tabbar" aria-label="主导航">
  <button class="or-tab active" data-or="shelf" type="button">${ICON_SHELF}<span>书架</span></button>
  <button class="or-tab" data-or="bookmarks" type="button">${ICON_MARK}<span>书签</span></button>
  <button class="or-tab" data-or="shuku" type="button">${ICON_CLOUD}<span>云书库</span></button>
  <button class="or-tab" data-or="request" type="button">${ICON_PEN}<span>求书</span></button>
  <button class="or-tab" data-or="settings" type="button">${ICON_GEAR}<span>设置</span></button>
</nav>
<div id="or-mask"></div>
<button id="or-drawer-close" type="button" aria-label="关闭菜单">×</button>
<div id="or-diag" class="hidden"></div>
`;

const htmlPatches = [
  ['<link rel="stylesheet" href="/style.css">',
    `<meta name="or-version" content="${V.name}">\n`
    + '<link rel="stylesheet" href="/style.css">\n<link rel="stylesheet" href="/mobile.css">'],
  ['<body data-theme="light">', '<body data-theme="light">\n' + SHELL],
  ['<small>OPEN READER · v1.2</small>', `<small>OPEN READER · ANDROID v${V.name}</small>`],
  ['webkitdirectory directory multiple', 'multiple'],
  ['＋ 导入文件夹', '＋ 批量导入'],
  ['title="选一个文件夹，里面的书会一次性导入"', 'title="一次选择多本书批量导入"'],
  ['<script type="module" src="/app.js"></script>',
    '<script src="/compat.js"></script>\n<script src="/shell.js"></script>\n<script src="/bundle.js"></script>'],
];
for (const [a, b] of htmlPatches) html = mustReplace(html, a, b, 'index.html');
done.push(write('index.html', html));

// 4. app.js: export used to navigate away; route it to the Java save bridge.
let js = need(path.join(WEB, 'app.js'));
const re = /location\.href = ('\/api\/export-[^;]+);/g;
const hits = js.match(re) || [];
// 3 处 = 整库备份 1 处（统一走 exportLibrary）+ 单本导出 2 处。
if (hits.length !== 3) throw new Error('app.js 导出调用数与预期不符: ' + hits.length + '（期望 3）');
if (!js.includes('async function exportLibrary()')) throw new Error('app.js 缺少整库备份入口');
js = js.replace(re, 'androidExport($1);');
if (js.includes("location.href = '/api/")) throw new Error('app.js 仍有未替换的导出导航');
js = mustReplace(js, '版本 1.2 ·', `版本 ${V.name} ·`, 'app.js 关于版本');
if (!js.includes('__orUpdateResult')) throw new Error('app.js 缺少应用内更新回调');
done.push(write('app.js', js));

/* ---------------------------------------------------------------------------
   5. bundle: one classic ES2017 IIFE. No <script type="module"> on device.
   --------------------------------------------------------------------------- */
const bundle = path.join(ASSETS, 'bundle.js');
execFileSync(process.execPath, [
  ESBUILD,
  path.join(ASSETS, 'bootstrap.mjs'),
  '--bundle', '--format=iife', '--target=es2016',
  '--outfile=' + bundle, '--log-level=warning',
], { stdio: 'inherit' });
const code = fs.readFileSync(bundle, 'utf8');
for (const bad of ['?.', '??', 'import(', 'async function', 'await ']) {
  if (code.includes(bad)) throw new Error('bundle.js 仍残留不兼容语法: ' + bad);
}
if (/^\s*(import|export)\s/m.test(code)) throw new Error('bundle.js 仍是 ES module');
if (!/^\s*\(\(\)\s*=>|^\s*\(function/.test(code)) {
  throw new Error('bundle.js 不是 IIFE');
}
if (!code.includes('__orUpdateResult') || !code.includes('checkUpdate')) {
  throw new Error('bundle.js 缺少应用内更新实现');
}
done.push('bundle.js (' + (code.length / 1024).toFixed(1) + ' KB)');

console.log('=== sync-web 完成 ===');
console.log('版本   :', V.name, '(versionCode ' + V.code + ')');
console.log('源目录 :', SRC);
console.log('目标   :', ASSETS);
console.log('生成   :', done.length, '个条目');
for (const f of done) console.log('  ' + f);
console.log('未改动 : bootstrap.mjs / api-bridge.mjs / android-storage.mjs / shell.js / mobile.css（Android 专属）');
