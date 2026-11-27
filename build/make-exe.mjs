/* 组装绿色免安装版。
   注意：Node 22 的 fs.cpSync 复制到中文目标路径会段错误（Windows 路径编码 bug），
   因此构建全程使用纯 ASCII 路径，最终改名交由 build/finalize.py 用 Python 完成。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const say = (...a) => process.stderr.write(a.join(' ') + '\n');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'OpenReader');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
// 直接用当前执行构建脚本的 Node，避免写死某台机器的绝对路径
const MANAGED_NODE = process.execPath;
const VERSION = '1.2.0';

function sizeOf(p) {
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    total += e.isDirectory() ? sizeOf(f) : fs.statSync(f).size;
  }
  return total;
}
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
// 手写递归复制，避开 fs.cpSync 在含非 ASCII 路径下的崩溃
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (/\.bak|\.backup/i.test(e.name)) continue;   // 回滚点只留在源码，不进发行包
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

say('== 组装开放书库 Windows 绿色版 ==');
if (!fs.existsSync(path.join(ELECTRON_DIST, 'electron.exe'))) {
  throw new Error('找不到 Electron 运行时，请先执行 build/fetch-electron.mjs');
}
if (!fs.existsSync(MANAGED_NODE)) throw new Error('找不到内置 Node 运行时: ' + MANAGED_NODE);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
say('[1/6] 展开 Electron 运行时…');
copyDir(ELECTRON_DIST, OUT);
say('      已展开 ' + mb(sizeOf(OUT)));

const exe = path.join(OUT, 'electron.exe');
fs.rmSync(path.join(OUT, 'resources', 'default_app.asar'), { force: true });

const APP = path.join(OUT, 'resources', 'app');
fs.mkdirSync(APP, { recursive: true });
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify({
  name: 'open-reader-desktop', productName: '开放书库', version: VERSION,
  main: 'electron/main.cjs', private: true,
}, null, 2) + '\n');
copyDir(path.join(ROOT, 'electron'), path.join(APP, 'electron'));
fs.copyFileSync(path.join(ROOT, 'server.mjs'), path.join(APP, 'server.mjs'));
copyDir(path.join(ROOT, 'src'), path.join(APP, 'src'));
copyDir(path.join(ROOT, 'assets'), path.join(APP, 'assets'));
fs.mkdirSync(path.join(APP, 'runtime'), { recursive: true });
fs.copyFileSync(MANAGED_NODE, path.join(APP, 'runtime', 'node.exe'));
say('[2/6] 应用代码 + 内置 Node 运行时已写入');

const locales = path.join(OUT, 'locales');
if (fs.existsSync(locales)) {
  const keep = new Set(['zh-CN.pak', 'en-US.pak']);
  for (const f of fs.readdirSync(locales)) if (!keep.has(f)) fs.rmSync(path.join(locales, f), { force: true });
}
say('[3/6] 语言包已精简');

try {
  const rcedit = require('rcedit').rcedit;
  await rcedit(exe, {
    icon: path.join(ROOT, 'assets', 'app.ico'),
    'file-version': VERSION + '.0',
    'product-version': VERSION + '.0',
    'version-string': {
      FileDescription: '开放书库 · 阅读器',
      ProductName: '开放书库',
      CompanyName: 'Open Reader',
      LegalCopyright: '免费、开放格式',
      FileVersion: VERSION,
      ProductVersion: VERSION,
      OriginalFilename: '开放书库.exe',
    },
  });
  say('[4/6] exe 图标与版本信息已写入');
} catch (e) {
  say('[4/6] rcedit 跳过（不影响运行）: ' + e.message);
}

fs.writeFileSync(path.join(OUT, 'README.txt'), [
  '开放书库 · 阅读器（Windows 绿色版 v' + VERSION + '）',
  '========================================',
  '',
  '【启动】双击「开放书库.exe」即可，无需安装、无需账号；阅读与书库数据完全离线。',
  '  请从资源管理器双击；若从集成终端启动无反应，先清除环境变量 ELECTRON_RUN_AS_NODE。',
  '',
  '【数据在哪】首次启动会在 exe 同目录自动创建「data」文件夹。',
  '  books/ 保存原始文件（原样不改写），meta.json 保存进度与书签，',
  '  .index/ 只是可重建的检索索引。换电脑或重装，整个文件夹拷走即可。',
  '  请勿把程序放在需要管理员权限的目录（如 C:\\Program Files）。',
  '',
  '【支持格式】可直接阅读：TXT / MD / EPUB / DOCX / DOC / PDF / RTF / ODT /',
  '  FB2 / MHTML / MOBI / PRC / PDB / HTML / ZIP（内嵌 EPUB·FB2·TXT）/ 常见纯文本。',
  '  PDF 按页分章，支持中文 ToUnicode 字体、对象流与常见压缩滤镜。',
  '  扫描版 PDF（JPEG/JPX 页面）按原页图片浏览，可翻页看图；无文字层，不做 OCR、不能全文检索。',
  '  加密 PDF、AZW3 / CHM / 漫画包等：原件完整保留，可右键「导出原始文件」取回。',
  '  所有原件一律原样保留、不改写；无法解析时只在界面提示，不会丢文件。',
  '  从旧版升级时，之前标为「暂不解析」的书会自动重新解析一次，无需重新导入。',
  '',
  '【常用操作】',
  '  Ctrl+O 导入书籍 · 也可直接把文件拖进窗口',
  '  ← → / PageUp / PageDown / 空格 翻页 · Esc 返回书架',
  '  Ctrl+D 添加书签 · Ctrl+= / Ctrl+- 调整字号 · Ctrl+T 切换主题',
  '  Ctrl+, 打开设置 · Ctrl+F 聚焦搜索',
  '  右键书籍卡片：重命名、归类、导出、删除',
  '  把书籍卡片拖到左侧分类上即可归类',
  '',
  '【整库备份】「导出整库」生成 .openlib（标准 ZIP），任何解压软件都能打开；',
  '  「导入整库」按规范做合并而非覆盖。',
  '',
  '【在线功能（可选）】地址已内置，无需配置；仅主动打开「云书库」或「求书」时联网。',
  '  云书库：搜站内已有书籍 → 结果卡片点「打开下载」，跳转网盘获取文件。',
  '  求书  ：站内没有时提交书名/作者；维护者回复后，左侧「求书」出现到货角标。',
  '  下载到的文件直接拖进窗口即可导入；断网或未配置时不影响本机阅读。',
  '',
  '【隐私】阅读 / 书库 / 索引全在本机，不收集数据，没有任何收费功能。',
  '  无数字签名是个人免费软件的常见情况，如被安全软件拦截可加入白名单。',
  '',
  '【排障】帮助菜单 →「查看运行日志」。',
  '',
].join('\r\n'), 'utf8');

const spec = path.join(ROOT, '..', 'Server', '书库格式规范_v0.1.md');
if (fs.existsSync(spec)) fs.copyFileSync(spec, path.join(OUT, 'FORMAT_SPEC.md'));
say('[5/6] 使用说明与格式规范已附带');

say('[6/6] 构建完成');
say('  输出目录: ' + OUT);
say('  总大小  : ' + mb(sizeOf(OUT)));
