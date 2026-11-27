/* 真实启动绿色版 exe，验证 Electron 主进程 -> 内置 Node 后端 -> 页面 的完整链路。
   正常桌面双击时窗口会常驻；若从 CI / 宿主终端运行，测试脚本退出可能连带回收
   进程组，此时可用脱离进程组的方式（DETACHED_PROCESS）另行拉起窗口。
   注意：WorkBuddy 自身是 Electron 应用，会给子进程注入 ELECTRON_RUN_AS_NODE=1，
   使任何 Electron exe 退化为纯 Node CLI（不加载界面）。从资源管理器双击不会有该变量，
   这里显式清除以还原真实用户环境。 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist', '开放书库');
const EXE = path.join(DIST, '开放书库.exe');
const DATA = path.join(DIST, 'data');
const APPDATA = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
const LOG = path.join(APPDATA, '开放书库', 'backend.log');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n== 启动 EXE 并验证桌面链路 ==');
if (!fs.existsSync(EXE)) { console.error('找不到 exe:', EXE); process.exit(1); }
console.log('  主程序:', EXE);

// 还原干净的用户环境；顺带清掉上一次验证的数据与日志，检验首次启动流程
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
console.log('  已清除 ELECTRON_RUN_AS_NODE（还原双击启动环境）');
fs.rmSync(DATA, { recursive: true, force: true });
fs.rmSync(LOG, { force: true });

const child = spawn(EXE, [], { cwd: DIST, env, detached: true, stdio: 'ignore' });
child.unref();
console.log('  已启动，PID:', child.pid);

let port = null, dataReady = false, alive = false, windowLogged = false;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try { process.kill(child.pid, 0); alive = true; } catch { alive = false; }
  dataReady = fs.existsSync(path.join(DATA, 'library.json'));
  if (fs.existsSync(LOG)) {
    const text = fs.readFileSync(LOG, 'utf8');
    const m = /--port (\d+)/.exec(text);
    if (m) port = Number(m[1]);
    windowLogged = text.includes('[main] 窗口已创建');
  }
  if (dataReady && port && windowLogged) break;
}

console.log('  进程存活:', alive);
console.log('  data/library.json:', dataReady ? '已创建' : '未创建');
console.log('  主进程日志:', fs.existsSync(LOG) ? '已写入' : '未找到');
console.log('  窗口创建:', windowLogged ? '成功' : '未确认');
console.log('  后端端口:', port || '未解析');

let httpOk = false, books = 0, indexKind = '';
if (port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/state`, { signal: AbortSignal.timeout(3000) });
    const j = await r.json();
    httpOk = r.ok && Array.isArray(j.books);
    books = j.books?.length || 0; indexKind = j.index?.kind || '';
    console.log('  接口状态:', r.status, '书籍', books, '索引', indexKind);
  } catch (e) { console.log('  接口探测失败:', e.message); }
}

const pass = alive && dataReady && httpOk && windowLogged;
console.log(pass ? '\n结果: EXE 启动链路全部正常，窗口已在桌面打开。'
  : '\n结果: 启动链路存在异常（详见上方）。');
if (fs.existsSync(LOG) && !pass) console.log('--- 日志 ---\n' + fs.readFileSync(LOG, 'utf8').slice(-2500));
if (!pass) process.exit(1);
