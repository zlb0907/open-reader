#!/usr/bin/env node
/* 生成 PC 版热更新补丁。97 MB 的自释放壳不用重发，只上传两个小文件。
 *
 * 用法：
 *   node PC/build/make-pc-patch.mjs                      # code 自动 +1
 *   node PC/build/make-pc-patch.mjs --code 3 --name 1.2.3 --notes "修复导入" --force false
 *   node PC/build/make-pc-patch.mjs --code 9 --require-full --notes "更换运行时"  # 大版本
 *   node PC/build/make-pc-patch.mjs --full-url "https://..."                       # 换网盘
 *
 * 产物（上传到 PythonAnywhere 的 ~/or_update/）：
 *   PC/publish/pc-update.json   版本清单（code / name / notes / url / sha256 / force
 *                                      / full_url / require_full）
 *   PC/publish/pc-patch.json    补丁本体（逐文件 sha256 + base64）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');                    // D:\woby\阅读
const APP = path.join(ROOT, 'PC', 'dist', '开放书库', 'resources', 'app');
const OUT = path.join(ROOT, 'PC', 'publish');
const OR_BASE = 'https://soshu.pythonanywhere.com/or/';
const FULL_URL = 'https://pan.quark.cn/s/f70d9d4eff60';   // 整包 exe 的网盘分享页
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };

if (!fs.existsSync(path.join(APP, 'electron', 'main.cjs')))
  throw new Error('找不到程序目录：' + APP + '\n请先确认 dist/开放书库 已构建。');

// 与 build/make-integrity.mjs 同口径：排除备份文件、runtime/、integrity.json 自身。
function collect() {
  const keys = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (/\.bak|\.backup/i.test(e.name)) continue;
      const abs = path.join(dir, e.name);
      const key = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (key !== 'runtime') walk(abs, key); }
      else if (e.isFile() && key !== 'integrity.json') keys.push(key);
    }
  })(APP, '');
  return keys.sort();
}

let code = Number(arg('--code', ''));
if (!code) {
  try { code = (Number(JSON.parse(fs.readFileSync(path.join(OUT, 'pc-update.json'), 'utf8')).code) || 0) + 1; }
  catch { code = 1; }
}

// 基线写进 dist：重出整包时新 exe 不会重复下载同一版补丁。
fs.writeFileSync(path.join(APP, 'pc-baseline.json'), JSON.stringify({ code }) + '\n');

// 重算完整性清单（含 pc-baseline.json），让替换后 verifyIntegrity() 日志干净。
const keys = collect();
const files = {};
for (const k of keys) files[k] = sha(fs.readFileSync(path.join(APP, k)));
fs.writeFileSync(path.join(APP, 'integrity.json'), JSON.stringify({
  note: '由 build/make-integrity.mjs 生成；改动本目录文件后请重跑。',
  generated: new Date().toISOString(), files,
}, null, 2) + '\n');

const payload = {};
for (const k of [...keys, 'integrity.json']) {
  const b = fs.readFileSync(path.join(APP, k));
  payload[k] = { sha256: sha(b), b64: b.toString('base64') };
}

fs.mkdirSync(OUT, { recursive: true });
const patch = Buffer.from(JSON.stringify({ code, files: payload }), 'utf8');
fs.writeFileSync(path.join(OUT, 'pc-patch.json'), patch);
const manifest = {
  code,
  name: String(arg('--name', '1.2.' + code)),
  notes: String(arg('--notes', '')),
  url: OR_BASE + 'pc-patch.json',
  sha256: sha(patch),
  force: String(arg('--force', 'true')) !== 'false',
  full_url: String(arg('--full-url', FULL_URL) || FULL_URL),
  require_full: process.argv.includes('--require-full'),
};
fs.writeFileSync(path.join(OUT, 'pc-update.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log('code    = ' + code + '  force=' + manifest.force);
console.log('整包    = ' + manifest.full_url
  + (manifest.require_full ? '   require_full=true' : ''));
console.log('files   = ' + Object.keys(payload).length + ' 个');
console.log('patch   = ' + (patch.length / 1024).toFixed(0) + ' KB');
console.log('sha256  = ' + manifest.sha256);
console.log('上传这两个文件到 ~/or_update/：');
console.log('  ' + path.join(OUT, 'pc-update.json'));
console.log('  ' + path.join(OUT, 'pc-patch.json'));
console.log('注意：不要跑 install.py，它会把 update.json 覆盖成占位清单。');
if (manifest.require_full) {
  console.log('大版本顺序：先重出整包并上传到网盘，再上传清单；'
    + '新整包内的 baseline 必须是本次 code=' + code + '，否则装好还会再弹一次。');
}
