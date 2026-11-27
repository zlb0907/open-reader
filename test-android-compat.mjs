/* 多机型兼容性自检（不需要 Chrome / CDP）
   1) 在 vm 里模拟一台「Chrome 50 级别」的老 WebView，删掉所有现代方法，
      验证 compat.js 的 polyfill 真能顶上，SHA-256 结果与 Node 原生一致。
   2) 静态检查 CSS 的 fallback 规则、Java 的跨 ROM 设置、三处版本号。
   Usage: node test-android-compat.mjs
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const A = path.join(HERE, 'app', 'src', 'main', 'assets');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  OK   ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + '  ' + extra); }
};
const read = (p) => fs.readFileSync(p, 'utf8');
const V = JSON.parse(read(path.join(HERE, 'version.json')));

console.log('=== 老 WebView 运行时 + 多机型静态检查 ===');

/* ---------- 1. 模拟老引擎 ---------- */
const ctx = { console, setTimeout };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(`
  delete String.prototype.padStart; delete String.prototype.padEnd;
  delete String.prototype.matchAll; delete String.prototype.trimStart; delete String.prototype.trimEnd;
  delete Object.entries; delete Object.values; delete Object.fromEntries;
  delete Array.prototype.includes; delete Promise.prototype.finally;
  delete globalThis.IntersectionObserver; delete globalThis.crypto;
  delete globalThis.globalThis;
`, ctx);
vm.runInContext(read(path.join(A, 'compat.js')), ctx);
const run = (code) => vm.runInContext(code, ctx);

ok('globalThis 可用（原生或补丁）', run('typeof globalThis') === 'object');
ok('padStart / padEnd 补丁', run("'7'.padStart(3,'0') + '|' + '7'.padEnd(3,'0')") === '007|700');
ok('Object.entries / values 补丁', run("Object.entries({a:1}).length + ':' + Object.values({a:2})[0]") === '1:2');
ok('Object.fromEntries 补丁', run("Object.fromEntries([['a',3]]).a") === 3);
ok('Array.includes 补丁', run('[1,2,3].includes(2)') === true);
ok('String.matchAll 补丁', run("[...'a1a2'.matchAll(/a(\\d)/g)].map(m=>m[1]).join('')") === '12');
ok('trimStart / trimEnd 补丁', run("'  x  '.trimStart() + '|' + '  x  '.trimEnd()") === 'x  |  x');
ok('Promise.finally 补丁', typeof run('Promise.prototype.finally') === 'function');
ok('IntersectionObserver 兜底', run('typeof new IntersectionObserver(function(){}).observe') === 'function');
ok('crypto.subtle 已补齐', run('!!(crypto && crypto.subtle && crypto.subtle.digest)'));
ok('SHA-256 补丁已启用', run('window.__orCompat.sha256Polyfill') === true);

for (const t of ['', 'abc', '开放书库', 'a'.repeat(1000), 'The quick brown fox jumps over the lazy dog']) {
  const buf = Buffer.from(t, 'utf8');
  const want = crypto.createHash('sha256').update(buf).digest('hex');
  // 把 Node 的 Buffer 内容灌进 vm 的数组，模拟 WebView 里传 Uint8Array / ArrayBuffer 两种形态
  const arr = Array.from(buf);
  const got = await (async () => {
    const hex = await new Promise((resolve, reject) => {
      ctx.__input = arr;
      ctx.__done = (v) => resolve(v);
      ctx.__err = (e) => reject(e);
      run(`crypto.subtle.digest('SHA-256', new Uint8Array(__input))
        .then(function(ab){ __done(Array.from(new Uint8Array(ab)).map(function(b){
          return ('0'+b.toString(16)).slice(-2); }).join('')); })
        .catch(function(e){ __err(String(e)); });`);
    });
    return hex;
  })();
  ok('SHA-256 与原生一致 len=' + buf.length, got === want, got.slice(0, 16));
}

/* ---------- 2. CSS fallback 静态检查 ---------- */
const css = read(path.join(A, 'mobile.css'));
ok('已移除 min() 变量写法', !/--or-drawer:\s*min\(/.test(css));
ok('已移除 inset 简写', !/\binset\s*:/.test(css));
const dvhAll = (css.match(/100dvh/g) || []).length;
const dvhPaired = (css.match(/height:\s*100vh;\s*height:\s*100dvh/g) || []).length;
ok('100dvh 均有 100vh 前置', dvhAll > 0 && dvhPaired === dvhAll,
  dvhPaired + '/' + dvhAll);
// 逐行检查：凡含 env() 的声明，同一规则块内必须已有同属性的纯值声明。
let lastPlain = {}, envTotal = 0, envFallbackMissing = [];
for (const raw of css.split('\n')) {
  const line = raw.trim();
  if (line.startsWith('@media') || line.endsWith('{')) { lastPlain = {}; continue; }
  const m = /^([a-z-]+)\s*:\s*(.+?);/.exec(line);
  if (!m) continue;
  const prop = m[1], val = m[2];
  if (val.includes('env(')) {
    envTotal++;
    if (!lastPlain[prop]) envFallbackMissing.push(prop + ': ' + val.slice(0, 40));
  } else {
    lastPlain[prop] = true;
  }
}
ok('每条 env() 声明都有纯值 fallback',
  envTotal >= 10 && envFallbackMissing.length === 0,
  'env 声明 ' + envTotal + ' 条' + (envFallbackMissing.length ? ' 缺: ' + envFallbackMissing.join(' / ') : ''));
ok('小屏 / 横屏 / 平板三档媒体查询齐全',
  /max-width:\s*360px/.test(css) && /orientation:\s*landscape/.test(css)
  && /min-width:\s*861px/.test(css));
ok('手势条有固定兜底', /--or-safe-bottom:\s*\d+px/.test(css));

/* ---------- 3. HTML / Java / 版本一致性 ---------- */
const html = read(path.join(A, 'index.html'));
const order = ['/compat.js', '/shell.js', '/bundle.js'].map((s) => html.indexOf(s));
ok('脚本顺序 compat → shell → bundle',
  order.every((v) => v > 0) && order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
const chromeHtml = (/<header id="or-topbar"[\s\S]*?<\/nav>/.exec(html) || [''])[0];
ok('常驻导航无字体符号图标', chromeHtml.length > 0 && !/[☰⌕▤☆☁✎⚙]/.test(chromeHtml),
  'svg=' + (chromeHtml.match(/class="or-ic"/g) || []).length);

const java = read(path.join(HERE, 'app', 'src', 'main', 'java', 'com', 'openreader', 'app', 'MainActivity.java'));
for (const [name, needle] of [
  ['禁用厂商强制深色', 'setForceDark(WebSettings.FORCE_DARK_OFF)'],
  ['固定字体缩放 100%', 'setTextZoom(100)'],
  ['开启 content access', 'setAllowContentAccess(true)'],
  ['文件选择器 chooser', 'Intent.createChooser'],
  ['设备信息桥', 'public String deviceInfo()'],
  ['WebView 调试开关', 'setWebContentsDebuggingEnabled(true)'],
  ['应用内更新检查', 'runCheckUpdate'],
  ['APK SHA-256 校验', 'MessageDigest.getInstance("SHA-256")'],
  ['未知来源授权引导', 'ACTION_MANAGE_UNKNOWN_APP_SOURCES'],
]) ok('Java ' + name, java.includes(needle));

const manifest = read(path.join(HERE, 'app', 'src', 'main', 'AndroidManifest.xml'));
const gradle = read(path.join(HERE, 'app', 'build.gradle'));
const ps1 = read(path.join(HERE, 'build-apk.ps1'));
const shellJs = read(path.join(A, 'shell.js'));
ok('版本号由 version.json 单一来源驱动（v' + V.name + ' / code ' + V.code + '）',
  manifest.includes('versionCode="' + V.code + '"')
  && manifest.includes('versionName="' + V.name + '"')
  && gradle.includes('versionCode ' + V.code)
  && gradle.includes("versionName '" + V.name + "'")
  && ps1.includes('$V.code') && ps1.includes('$V.name')
  && html.includes('ANDROID v' + V.name)
  && html.includes('name="or-version" content="' + V.name + '"'));
ok('build-apk.ps1 不再硬编码版本号',
  !/--version-code' '\d+'/.test(ps1) && !/--version-name' '[\d.]+'/.test(ps1));
ok('shell.js 版本从 meta 读取、无硬编码',
  shellJs.includes('or-version') && !/开放书库 v\d+\.\d+\.\d+/.test(shellJs));
ok('Java 更新地址与 version.json 一致', java.includes('"' + V.update_url + '"'));

/* ---------- 4. v1.8.0 仿真书页 + 双击全屏 + 分节目录合并 ---------- */
const appjs = read(path.join(A, 'app.js'));
const bundle = read(path.join(A, 'bundle.js'));
const desktopCss = read(path.join(A, 'style.css'));
const chapters = read(path.join(A, 'core/chapters.mjs'));
const books = read(path.join(A, 'core/books.mjs'));
const library = read(path.join(A, 'core/library.mjs'));
ok('阅读器有模式切换按钮', html.includes('id="btn-read-mode"') && appjs.includes('toggleReadMode'));
ok('翻页模式的「上一页 / 下一页」按钮仍在',
  html.includes('id="btn-prev"') && html.includes('id="btn-next"')
  && appjs.includes('function gotoNext()') && appjs.includes('function gotoPrev()'));
ok('连续滚动实现已打进 bundle',
  bundle.includes('stream-block') && bundle.includes('STREAM_MAX_BLOCKS')
  && bundle.includes('read_mode'));
ok('连续滚动不劫持原生滚动',
  appjs.includes('scan.active || stream.active') && appjs.includes('streamPage(1)'));
ok('连续流有窗口裁剪（防老 WebView OOM）',
  appjs.includes('function trimStream()') && appjs.includes('content.scrollTop = Math.max(0, content.scrollTop - h)'));
ok('桌面 / 手机样式都有 stream 规则',
  desktopCss.includes('.content.stream') && css.includes('.content.stream'));
ok('手机工具条单行横滑且模式按钮靠前',
  css.includes('.reader-bar { flex-wrap: nowrap; overflow-x: auto;')
  && html.indexOf('id="btn-read-mode"') < html.indexOf('id="btn-theme"'));
ok('分节合并在 core 里（不是只改 UI）',
  chapters.includes('sameGroup') && chapters.includes('numEnd') && chapters.includes('describeChapterTitle'));
ok('已导入书会自动重解析并迁移进度',
  books.includes('PARSER_VERSION = 3') && books.includes('migrateChapterAnchors')
  && books.includes('Number(meta.parser_version) >= PARSER_VERSION'));
ok('默认阅读方式写进设置', library.includes("read_mode: 'scroll'"));

/* ---------- 5. 仿真翻书 / 双击全屏 ---------- */
ok('正文按视口高度分页（二分测量，不裁字）',
  appjs.includes('function paginateChunks(') && appjs.includes('m.scrollHeight <= maxH')
  && bundle.includes('paginateChunks'));
ok('翻页走 3D 纸张动画 + 阴影',
  appjs.includes('rotateY(-88deg)') && desktopCss.includes('book-flipping::after')
  && desktopCss.includes('-webkit-perspective'));
ok('跨章连续填充（短章不占一整页留白）',
  appjs.includes('function paginateChunks(') && appjs.includes('chunks.unshift.apply')
  && bundle.includes('paginateChunks'));
ok('无 3D 的老 WebView 自动降级滑动',
  appjs.includes('const HAS_3D') && appjs.includes("'translateX(-102%)'")
  && appjs.includes("!HAS_3D) book.effect = 'slide'")
  && appjs.includes('book.effect === \'book\' && !HAS_3D ? \'slide\''));
ok('老引擎 transform 双前缀',
  appjs.includes('el.style.webkitTransform = v') && appjs.includes('el.style.transform = v'));
ok('CSS 保留 backface / 页眉页脚 / 离屏测量容器',
  desktopCss.includes('backface-visibility: hidden') && desktopCss.includes('.book-measure')
  && desktopCss.includes('body.immersive .content.book-mode'));
ok('手机端书页有专属样式与安全区 fallback',
  css.includes('.content.book-mode') && css.includes('.book-page {')
  && css.includes('env(safe-area-inset-bottom'));
ok('双击自己判定（不依赖 WebView 的 dblclick）',
  appjs.includes('t - book.lastTap < 360') && appjs.includes('toggleImmersive()')
  && !appjs.includes("addEventListener('dblclick'"));
ok('Java 关掉双击缩放，避免吞掉第二次 click',
  java.includes('setSupportZoom(false)') && java.includes('setDisplayZoomControls(false)'));
ok('单击热区 / 左右滑动 / 底部按钮三条翻页路径都在',
  appjs.includes('x < w * 0.32') && appjs.includes('x > w * 0.68')
  && appjs.includes("addEventListener('touchend'") && html.includes('id="btn-next"'));
ok('全屏 / 旋转 / 字号变化后重新分页并保留位置',
  appjs.includes('function relayoutBook()') && appjs.includes("'resize', scheduleBookRelayout")
  && appjs.includes('scheduleBookRelayout();'));
ok('设置里可切换仿真 / 滑动 / 无动画',
  appjs.includes('data-effect-v') && library.includes("page_effect: 'book'"));
ok('按钮文案改为「仿真翻书」而非「下一页式翻页」',
  appjs.includes('▤ 翻书') && appjs.includes('仿真翻书'));

/* ---------- v1.12.0 整库备份 ---------- */
const boot = read(path.join(A, 'bootstrap.mjs'));
ok('整库备份把自定义名交给 SAF 桥、单本导出不受影响',
  boot.includes('window.__orBackupName') && boot.includes('saveBackup(name, btoa(bin))')
  && boot.includes("if (isLib) window.__orBackupName = ''"));
ok('没有 SAF 桥时回退旧 saveFile',
  boot.includes('window.AndroidNative.saveFile(name, btoa(bin))'));
ok('设置里用 askText 输入备份名，安卓侧仍被替换成导出桥',
  appjs.includes('async function exportLibrary()')
  && appjs.includes("askText('导出整库备份'")
  && appjs.includes("androidExport('/api/export-library')"));
ok('sync-web 导出调用数断言同步为 3',
  read(path.join(HERE, 'sync-web.mjs')).includes('hits.length !== 3'));

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) process.exit(1);
