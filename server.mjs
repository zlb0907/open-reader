import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createNodeStorage } from './src/core/storage.mjs';
import { LibraryApp } from './src/core/api.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, 'src', 'web');
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
}
const root = path.resolve(arg('root', path.join(HERE, 'demo-library')));
const port = Number(arg('port', '8787')) || 8787;
const host = arg('host', '127.0.0.1');
const noDemo = argv.includes('--no-demo');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const app = new LibraryApp(createNodeStorage(), root, { name: '我的书库' });
await app.init();

if (!noDemo) {
  const existing = await app.listBooks();
  if (existing.length === 0) {
    const para = (n, tag) => Array.from({ length: n }, (_, i) =>
      `　　${tag}第 ${i + 1} 段示例正文，用来检验自动分章、分页加载、进度保存与全文检索是否正常工作。山行笔记里记着一处旧书摊，摊主说书不必都读完，翻到哪页算哪页。`).join('\n');
    const t1 = `山行笔记\n\n第一章 旧书摊\n${para(40, '旧书摊')}\n\n第二章 雨夜\n${para(35, '雨夜')}\n\n第三章 归途\n${para(30, '归途')}\n`;
    const t2 = `随手写的一则短文\n\n没有章节标题的文本会整体作为「全文」一章，便于验证无章节时的兜底切分逻辑。\n\n这里藏着一个只用于检索测试的关键词：青瓦纸鸢。\n`;
    await app.importBook({ filename: '示例·山行笔记.txt', bytes: new TextEncoder().encode(t1) });
    await app.importBook({ filename: '示例·无章节短文.txt', bytes: new TextEncoder().encode(t2) });
    console.log('[demo] 已灌入 2 本示例书（仅首次启动）');
  }
}

function sendJson(res, code, obj) {
  const data = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length,
    'Cache-Control': 'no-store' });
  res.end(data);
}

function sendBinary(res, bytes, filename, mime = 'application/octet-stream') {
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': bytes.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
  res.end(Buffer.from(bytes));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return new Uint8Array(Buffer.concat(chunks));
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.resolve(WEB, rel);
  if (!file.startsWith(WEB)) { res.writeHead(403); res.end('Forbidden'); return; }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

async function dispatch(action, body) {
  switch (action) {
    case 'state': return await app.state();
    case 'list-books': return await app.listBooks();
    case 'get-book': return await app.getBook(body.id);
    case 'read-chapter': return await app.readChapter(body.id, body.chapterId, body.offset, body.limit);
    case 'set-progress': return await app.setProgress(body.id, body);
    case 'add-bookmark': return await app.addBookmark(body.id, body);
    case 'remove-bookmark': return await app.removeBookmark(body.id, body.bookmarkId);
    case 'search': return await app.search(body.q);
    case 'search-fts': return await app.searchFts(body.q);
    case 'reindex': return await app.reindex(!!body.full);
    case 'set-collections': return await app.setCollections(body.tree);
    case 'set-book-collections': return await app.setBookCollections(body.id, body.collectionIds);
    case 'set-book-cover': return await app.setBookCover(body.id, body.dataUrl);
    case 'remove-book-cover': return await app.removeBookCover(body.id);
    case 'rename-book': return await app.renameBook(body.id, body.title);
    case 'list-bookmarks': return await app.listBookmarks();
    case 'get-settings': return await app.getSettings();
    case 'set-settings': return await app.setSettings(body.patch ?? body);
    case 'delete-book': return await app.deleteBook(body.id);
    default: throw new Error('未知操作: ' + action);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${host}:${port}`);
    const p = u.pathname;

    if (req.method === 'GET' && !p.startsWith('/api/')) return await serveStatic(res, p);
    if (req.method === 'GET' && p === '/api/state') return sendJson(res, 200, await app.state());
    if (req.method === 'GET' && p === '/api/export-book') {
      const out = await app.exportBook(u.searchParams.get('id'));
      return sendBinary(res, out.bytes, out.filename, 'text/plain; charset=utf-8');
    }
    if (req.method === 'GET' && p === '/api/export-library') {
      return sendBinary(res, await app.exportLibrary(), 'my-library.openlib', 'application/zip');
    }
    if (req.method === 'GET' && p === '/api/page-image') {
      const out = await app.getPageImage(u.searchParams.get('id'), u.searchParams.get('chapterId'));
      return sendBinary(res, out.bytes, 'page.jpg', out.mime);
    }
    if (req.method === 'GET' && p === '/api/cover') {
      const bytes = await app.getBookCover(u.searchParams.get('id'));
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': bytes.length,
        'Cache-Control': 'no-store' });
      res.end(Buffer.from(bytes)); return;
    }
    if (req.method === 'POST' && p === '/api/import-book') {
      const name = decodeURIComponent(String(req.headers['x-file-name'] || 'untitled.txt'));
      const bytes = await readBody(req);
      if (!bytes.length) throw new Error('文件为空');
      return sendJson(res, 200, await app.importBook({ filename: name, bytes }));
    }
    if (req.method === 'POST' && p === '/api/import-library') {
      const bytes = await readBody(req);
      return sendJson(res, 200, await app.importLibrary(bytes));
    }
    // 智能导入：整库包 / 普通 zip / 多书压缩包一律走这里，由后端分诊。
    // readBody 不设硬上限（大部头扫描版 PDF 也能导入），整包进内存。
    if (req.method === 'POST' && p === '/api/import-smart') {
      const name = decodeURIComponent(String(req.headers['x-file-name'] || 'import.zip'));
      const bytes = await readBody(req);
      if (!bytes.length) throw new Error('文件为空');
      return sendJson(res, 200, await app.importSmart({ filename: name, bytes }));
    }
    if (req.method === 'POST' && p.startsWith('/api/')) {
      const raw = await readBody(req);
      let body = {};
      try { body = raw.length ? JSON.parse(Buffer.from(raw).toString('utf8')) : {}; }
      catch { throw new Error('请求体不是合法 JSON'); }
      return sendJson(res, 200, await dispatch(p.slice(5), body));
    }
    res.writeHead(404); res.end('Not found');
  } catch (e) {
    sendJson(res, 400, { error: e?.message || String(e) });
  }
});

server.listen(port, host, () => {
  console.log(`open-reader 已启动: http://${host}:${port}`);
  console.log(`书库目录: ${root}`);
  console.log(`索引引擎: ${app.index.kind}${app.index.tokenizer ? ' / ' + app.index.tokenizer : ''}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { app.close(); server.close(() => process.exit(0)); });
}
