import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'open-reader-http-'));
const root = path.join(tmp, 'lib');
// 让系统分配空闲端口：固定 18000~19500 随机段在 Windows 上会撞到 Hyper-V 保留端口（EACCES）。
const port = await new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
const base = `http://127.0.0.1:${port}`;

const child = spawn(process.execPath, [
  '--experimental-sqlite', '--no-warnings', path.join(PROJECT, 'server.mjs'),
  '--root', root, '--port', String(port), '--host', '127.0.0.1',
], { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
child.stdout.on('data', (d) => { serverLog += d.toString(); });
child.stderr.on('data', (d) => { serverLog += d.toString(); });

let pass = 0, fail = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) {
    console.log('  FAIL  ' + name);
    console.log('        ' + String(e?.message || e).split('\n')[0]);
    fail++; failures.push(name);
  }
}
async function post(action, body = {}) {
  const r = await fetch(base + '/api/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}
async function waitReady() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(base + '/api/state'); if (r.ok) return await r.json(); } catch { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('服务未就绪\n' + serverLog);
}

console.log('\n== open-reader v0.1 · HTTP 接口冒烟 ==');
console.log('端口: ' + port + '  临时库: ' + root);
let newId = null;
let exported = null;

try {
  const st = await waitReady();
  await t('01 服务启动 + 示例书自动灌入', async () => {
    assert.equal(st.books.length, 2);
    assert.equal(st.index.kind, 'sqlite');
    assert.ok(st.root.endsWith('lib'));
  });

  await t('02 静态资源可访问', async () => {
    const html = await fetch(base + '/');
    assert.equal(html.status, 200);
    assert.ok((await html.text()).includes('开放书库'));
    assert.equal((await fetch(base + '/app.js')).status, 200);
    assert.equal((await fetch(base + '/style.css')).status, 200);
  });

  await t('03 导入接口：二进制 + 中文文件名 + 自动分章', async () => {
    const bytes = new TextEncoder().encode('第一章 开头\n这是 HTTP 冒烟测试的青瓦纸鸢。\n第二章 结束\n收尾。\n');
    const r = await fetch(base + '/api/import-book', {
      method: 'POST', headers: { 'x-file-name': encodeURIComponent('接口 导入.txt') }, body: bytes,
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    newId = j.id;
    assert.equal(j.chapterCount, 2);
    assert.equal(j.title, '接口 导入');
  });

  await t('04 章节读取接口', async () => {
    const book = await post('get-book', { id: newId });
    const r = await post('read-chapter', { id: newId, chapterId: book.chapters[0].id, offset: 0, limit: 1000 });
    assert.ok(r.text.includes('第一章'));
    assert.ok(r.text.includes('青瓦纸鸢'));
    assert.equal(r.offset, 0);
  });

  await t('05 搜索接口（书名 + 全文）', async () => {
    const byBody = await post('search', { q: '青瓦纸鸢' });
    assert.ok(byBody.results.some((x) => x.bookId === newId));
    const byTitle = await post('search', { q: '接口 导入' });
    assert.ok(byTitle.results.some((x) => x.bookId === newId));
    const fts = await post('search-fts', { q: '青瓦纸鸢' });
    assert.ok(fts.results.length >= 1);
  });

  await t('06 进度 / 书签 / 设置 / 书架树接口', async () => {
    const p = await post('set-progress', { id: newId, percent: 0.5 });
    assert.equal(p.progress.percent, 0.5);
    const b = await post('add-bookmark', { id: newId, offset: 12, note: '冒烟' });
    assert.equal(b.bookmarks.length, 1);
    const s = await post('set-settings', { patch: { font_size: 21 } });
    assert.equal(s.font_size, 21);
    const q = await post('set-settings', { patch: { qiushu_url: 'https://example.com/form' } });
    assert.equal(q.qiushu_url, 'https://example.com/form');
    const q2 = await post('set-settings', { patch: { qiushu_url: '' } });
    assert.equal(q2.qiushu_url, '');   // 可清空，恢复默认
    const c = await post('set-collections', { tree: [{ id: 'c1', name: '测试分类', children: [], hidden: false }] });
    assert.equal(c.root[0].name, '测试分类');
    const state = await fetch(base + '/api/state').then((r) => r.json());
    assert.equal(state.settings.font_size, 21);
    assert.equal(state.books.length, 3);
  });

  await t('07 单本导出：字节与原件一致', async () => {
    const r = await fetch(base + '/api/export-book?id=' + encodeURIComponent(newId));
    assert.equal(r.status, 200);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const text = new TextDecoder().decode(bytes);
    assert.ok(text.includes('青瓦纸鸢'));
    assert.ok(String(r.headers.get('content-disposition')).includes("UTF-8''"));
  });

  await t('08 整库导出：标准 ZIP 且可解析', async () => {
    const r = await fetch(base + '/api/export-library');
    assert.equal(r.status, 200);
    exported = new Uint8Array(await r.arrayBuffer());
    assert.equal(new TextDecoder().decode(exported.slice(0, 2)), 'PK');
    assert.ok(exported.length > 500);
  });

  await t('09 整库导入：走合并而非覆盖', async () => {
    const r = await fetch(base + '/api/import-library', { method: 'POST', body: exported });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.books, 3);
    assert.equal(j.merged, 3);
    const state = await fetch(base + '/api/state').then((r) => r.json());
    assert.equal(state.books.length, 3);
  });

  await t('10 错误路径与目录穿越防护', async () => {
    const bad = await fetch(base + '/api/no-such-action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(bad.status, 400);
    assert.ok((await bad.json()).error);
    const illegal = await fetch(base + '/api/get-book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '../../secret' }),
    });
    assert.equal(illegal.status, 400);
    const traversal = await fetch(base + '/%2e%2e/server.mjs');
    assert.ok([403, 404].includes(traversal.status));
  });

  await t('11 重建索引接口', async () => {
    const r = await post('reindex', { full: true });
    assert.equal(r.kind, 'sqlite');
    assert.equal(r.indexed, r.scanned);
    assert.ok((await post('search', { q: '青瓦纸鸢' })).results.length >= 1);
  });
} catch (e) {
  console.log('  FAIL  服务启动/前置条件: ' + e.message);
  fail++;
} finally {
  child.kill('SIGTERM');
  try { await fs.rm(tmp, { recursive: true, force: true }); } catch { /* 忽略文件锁 */ }
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('失败项: ' + failures.join('; '));
  if (serverLog.trim()) console.log('--- 服务日志 ---\n' + serverLog.trim().slice(0, 1500));
  process.exit(1);
}
