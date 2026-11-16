// 构建期脚本：从国内镜像安装 Electron 运行时（仅开发机使用，不进入最终 exe）
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const NODE = process.execPath;
const NPM_CLI = path.join(path.dirname(NODE), 'node_modules', 'npm', 'bin', 'npm-cli.js');

const env = {
  ...process.env,
  npm_config_registry: 'https://registry.npmmirror.com',
  ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_CUSTOM_DIR: '{{ version }}',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
};

function run(args) {
  console.log('[run]', args.join(' '));
  const r = spawnSync(NODE, [NPM_CLI, ...args], {
    cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900000,
  });
  if (r.stdout) process.stdout.write(r.stdout.slice(-4000));
  if (r.stderr) process.stderr.write(r.stderr.slice(-4000));
  if (r.status !== 0) throw new Error('npm 失败，退出码 ' + r.status);
}

// 取 35.x 最新稳定版
const res = await fetch('https://registry.npmmirror.com/electron/35');
const info = await res.json();
const version = info.version;
console.log('[info] Electron 版本:', version);

run(['install', '--save-dev', '--no-audit', '--no-fund', `electron@${version}`]);

const dist = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
console.log('[check] electron.exe:', fs.existsSync(dist), dist);
console.log('DONE');
