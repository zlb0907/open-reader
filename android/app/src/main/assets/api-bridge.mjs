/* Local /api/* implementation for Android: the same LibraryApp that server.mjs
   drives, but called directly in the WebView's JS engine instead of over HTTP. */

import { createAndroidStorage } from './android-storage.mjs';
import { LibraryApp } from './core/api.mjs';

let app = null;

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function binaryResponse(bytes, mime, filename) {
  const headers = { 'Content-Type': mime || 'application/octet-stream' };
  if (filename) headers['Content-Disposition'] = "attachment; filename*=UTF-8''" + encodeURIComponent(filename);
  return new Response(bytes, { status: 200, headers });
}

function headerName(init) {
  const h = init.headers;
  let v = '';
  if (h instanceof Headers) v = h.get('x-file-name') || '';
  else if (Array.isArray(h)) v = (h.find((x) => String(x[0]).toLowerCase() === 'x-file-name') || [])[1] || '';
  else if (h && typeof h === 'object') {
    const k = Object.keys(h).find((x) => x.toLowerCase() === 'x-file-name');
    v = k ? h[k] : '';
  }
  try { return decodeURIComponent(String(v || 'untitled.txt')); }
  catch { return String(v || 'untitled.txt'); }
}

async function bodyBytes(init) {
  const b = init.body;
  if (b == null) return new Uint8Array();
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  if (typeof Blob !== 'undefined' && b instanceof Blob) return new Uint8Array(await b.arrayBuffer());
  if (typeof b === 'string') return new TextEncoder().encode(b);
  return new Uint8Array();
}

function bodyJson(init) {
  const raw = new TextDecoder('utf-8').decode(bodyBytesSync(init));
  return raw ? JSON.parse(raw) : {};
}

function bodyBytesSync(init) {
  const b = init.body;
  if (b == null) return new Uint8Array();
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  if (typeof b === 'string') return new TextEncoder().encode(b);
  return new Uint8Array();
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

async function handle(url, init) {
  const p = url.pathname;
  const method = String(init.method || 'GET').toUpperCase();

  if (method === 'GET' && p === '/api/state') return jsonResponse(await app.state());
  if (method === 'GET' && p === '/api/cover') {
    return binaryResponse(await app.getBookCover(url.searchParams.get('id')), 'image/jpeg');
  }
  if (method === 'GET' && p === '/api/page-image') {
    const out = await app.getPageImage(url.searchParams.get('id'), url.searchParams.get('chapterId'));
    return binaryResponse(out.bytes, out.mime || 'image/jpeg');
  }
  if (method === 'GET' && p === '/api/export-book') {
    const out = await app.exportBook(url.searchParams.get('id'));
    return binaryResponse(out.bytes, 'text/plain; charset=utf-8', out.filename);
  }
  if (method === 'GET' && p === '/api/export-library') {
    return binaryResponse(await app.exportLibrary(), 'application/zip', 'my-library.openlib');
  }
  if (method === 'POST' && p === '/api/import-book') {
    const bytes = await bodyBytes(init);
    if (!bytes.length) throw new Error('文件为空');
    return jsonResponse(await app.importBook({ filename: headerName(init), bytes }));
  }
  if (method === 'POST' && p === '/api/import-library') {
    return jsonResponse(await app.importLibrary(await bodyBytes(init)));
  }
  if (method === 'POST' && p === '/api/import-smart') {
    const bytes = await bodyBytes(init);
    if (!bytes.length) throw new Error('文件为空');
    return jsonResponse(await app.importSmart({ filename: headerName(init), bytes }));
  }
  if (method === 'POST' && p.startsWith('/api/')) {
    return jsonResponse(await dispatch(p.slice(5), bodyJson(init)));
  }
  return new Response('Not found', { status: 404 });
}

export async function initBridge() {
  const storage = createAndroidStorage();
  app = new LibraryApp(storage, '/library', { name: '我的书库', forceMemory: true });
  await app.init();

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    let url;
    try {
      const raw = typeof input === 'string' ? input : (input && input.url) || '';
      url = new URL(raw, location.href);
    } catch { return nativeFetch(input, init); }
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) {
      return nativeFetch(input, init);
    }
    try { return await handle(url, init); }
    catch (e) { return jsonResponse({ error: e?.message || String(e) }, 400); }
  };
  return app;
}
