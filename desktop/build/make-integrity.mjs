/* 生成 / 校验 Windows 绿色版完整性清单（L2 防篡改）。
   打包或手动同步 resources/app 内任何文件后都要重跑：
     node build/make-integrity.mjs              # 重新生成清单
     node build/make-integrity.mjs --verify     # 只校验，不改文件
   清单本身不参与校验；校验逻辑在 electron/main.cjs。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERIFY = process.argv.includes('--verify');
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const APP = arg ? path.resolve(arg) : path.join(ROOT, 'dist', '开放书库', 'resources', 'app');
const OUT = path.join(APP, 'integrity.json');
if (!fs.existsSync(path.join(APP, 'electron', 'main.cjs'))) {
  throw new Error('找不到程序目录：' + APP
    + '\n用法：node build/make-integrity.mjs [resources/app 路径] [--verify]');
}

const hash = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files = {};
function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/\.bak|\.backup/i.test(e.name)) continue;
    const abs = path.join(dir, e.name);
    const key = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(abs, key);
    // 跳过 runtime/ 下几十 MB 的内置 node.exe：那是第三方二进制，不是本程序代码，
    // 每次启动同步算它的哈希会拖慢窗口显示。
    else if (e.isFile() && key !== 'integrity.json' && !key.startsWith('runtime/')) {
      files[key] = hash(abs);
    }
  }
}
walk(APP, '');
const keys = Object.keys(files).sort();
const sorted = {};
for (const k of keys) sorted[k] = files[k];

if (VERIFY) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(OUT, 'utf8')); }
  catch (e) { console.error('清单缺失或无法解析：' + OUT); process.exit(1); }
  const want = manifest.files || {};
  const bad = keys.filter((k) => !(k in want) || want[k] !== files[k]);
  const missing = Object.keys(want).filter((k) => !(k in files));
  if (bad.length || missing.length) {
    console.error('完整性校验失败：被改 ' + bad.length + ' 个，缺失 ' + missing.length + ' 个');
    console.error([...bad, ...missing].slice(0, 10).join('\n'));
    process.exit(1);
  }
  console.log('完整性校验通过：' + keys.length + ' 个文件');
} else {
  fs.writeFileSync(OUT, JSON.stringify({
    note: '由 build/make-integrity.mjs 生成；改动本目录文件后请重跑。',
    generated: new Date().toISOString(),
    files: sorted,
  }, null, 2) + '\n');
  console.log('已生成 ' + OUT + '（' + keys.length + ' 个文件）');
}
