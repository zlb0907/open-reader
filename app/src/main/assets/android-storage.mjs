/* IndexedDB-backed StorageBackend for Android WebView.
   Implements exactly the NodeStorage surface (src/core/storage.mjs) so every
   core module runs unchanged. Paths are virtual; keys are normalized strings. */

const DB_NAME = 'openreader-library';
const STORE = 'files';
let dbPromise = null;
let keyCache = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request(mode, make) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const r = make(store);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
  }));
}

async function allKeys() {
  if (!keyCache) keyCache = new Set(await request('readonly', (s) => s.getAllKeys()));
  return keyCache;
}

function get(key) { return request('readonly', (s) => s.get(key)); }

async function put(key, value) {
  await request('readwrite', (s) => s.put(value, key));
  (await allKeys()).add(key);
}

async function del(key) {
  await request('readwrite', (s) => s.delete(key));
  (await allKeys()).delete(key);
}

function norm(...parts) {
  const segs = [];
  const absolute = String(parts[0] ?? '').startsWith('/');
  for (const p of parts) {
    for (const s of String(p ?? '').split(/[\\/]+/)) {
      if (!s || s === '.') continue;
      if (s === '..') segs.pop();
      else segs.push(s);
    }
  }
  return (absolute ? '/' : '') + segs.join('/');
}

function toU8(data) {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data.slice();
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  throw new Error('writeFile: unsupported data type');
}

export class AndroidStorage {
  join(...parts) { return norm(...parts); }
  dirname(p) {
    const k = norm(p);
    const i = k.lastIndexOf('/');
    return i <= 0 ? (k.startsWith('/') ? '/' : '') : k.slice(0, i);
  }
  basename(p) { const k = norm(p); return k.slice(k.lastIndexOf('/') + 1); }
  extname(p) {
    const b = this.basename(p);
    const i = b.lastIndexOf('.');
    return i > 0 ? b.slice(i) : '';
  }
  resolve(p) { return norm(p); }

  async exists(p) {
    const k = norm(p);
    const keys = await allKeys();
    if (keys.has(k)) return true;
    const prefix = k === '/' ? '/' : k + '/';
    for (const key of keys) if (key.startsWith(prefix)) return true;
    return false;
  }

  async readFile(p) {
    const rec = await get(norm(p));
    if (!rec || rec.kind !== 'file') throw new Error('ENOENT: ' + norm(p));
    return rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
  }

  async readText(p) {
    return new TextDecoder('utf-8').decode(await this.readFile(p));
  }

  async writeFile(p, data) {
    await put(norm(p), { kind: 'file', bytes: toU8(data), mtime: Date.now() });
  }

  async mkdir(p) {
    const k = norm(p);
    if (k && k !== '/') await put(k, { kind: 'dir', mtime: Date.now() });
  }

  async readdir(p) {
    const k = norm(p);
    const prefix = k === '/' ? '/' : k + '/';
    const keys = [...(await allKeys())];
    const names = new Map();
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (!rest) continue;
      const first = rest.split('/')[0];
      if (!first) continue;
      const isDir = rest.includes('/') || (await get(prefix + first))?.kind === 'dir';
      names.set(first, (names.get(first) || false) || isDir);
    }
    return [...names].map(([name, isDir]) => ({
      name,
      isDirectory: () => isDir,
      isFile: () => !isDir,
    }));
  }

  async isFile(p) {
    const rec = await get(norm(p));
    return !!rec && rec.kind === 'file';
  }

  async copyFile(src, dst) {
    await this.writeFile(dst, await this.readFile(src));
  }

  async remove(p) {
    const k = norm(p);
    const prefix = k === '/' ? '' : k + '/';
    const doomed = [...(await allKeys())].filter((key) => key === k || (prefix && key.startsWith(prefix)));
    for (const key of doomed) await del(key);
  }

  async stat(p) {
    const rec = await get(norm(p));
    if (!rec) throw new Error('ENOENT: ' + norm(p));
    const isFile = rec.kind === 'file';
    return {
      size: isFile ? rec.bytes.length : 0,
      mtimeMs: rec.mtime,
      mtime: new Date(rec.mtime),
      isFile: () => isFile,
      isDirectory: () => !isFile,
    };
  }
}

export function createAndroidStorage() {
  return new AndroidStorage();
}
