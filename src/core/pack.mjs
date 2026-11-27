import {
  FORMAT, SCHEMA_VERSION, LIBRARY_FILE, COLLECTIONS_FILE, SETTINGS_FILE,
  BOOKS_DIR, INDEX_DIR, fromJson, toJson,
} from './util.mjs';
import { mergeMeta } from './progress.mjs';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosStamp(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// 最小 ZIP writer（store 模式，UTF-8 文件名），零依赖、浏览器同样可运行。
export function createZip(entries) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
    const crc = crc32(data);
    const { time, date } = dosStamp(new Date());
    const lh = new Uint8Array(30 + name.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    lh.set(name, 30);
    locals.push(lh, data);

    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    centrals.push(ch);
    offset += lh.length + data.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  const parts = [...locals, ...centrals, eocd];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

// 兼容 Windows 压缩工具：中文文件名常写成 GBK 且不打 UTF-8 标志位。
// 先用严格 UTF-8 解（成功即合法 UTF-8 / ASCII），失败再回退 gb18030（覆盖 GBK/GB2312）。
function decodeZipName(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch {
    try { return new TextDecoder('gb18030').decode(bytes); }
    catch { return new TextDecoder('utf-8').decode(bytes); }
  }
}

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ZIP reader：store(0) + deflate(8)，UTF-8 / GBK 文件名，全部条目解压后按名返回。
// 零外部依赖，Node 22 / Chromium WebView 均可运行。异步是因为 deflate 要过 DecompressionStream。
export async function readZip(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  const floor = Math.max(0, u8.length - 65557);
  for (let i = u8.length - 22; i >= floor; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 zip / openlib 包');
  const count = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) {
    throw new Error('暂不支持 Zip64 包，请用普通模式重新压缩');
  }
  let p = cdOffset;
  const out = new Map();
  for (let n = 0; n < count && p + 46 <= u8.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip 中央目录损坏');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = decodeZipName(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (localOff + 30 > u8.length || dv.getUint32(localOff, true) !== 0x04034b50) continue;
    const lhNameLen = dv.getUint16(localOff + 26, true);
    const lhExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = u8.slice(start, start + csize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    else throw new Error(`不支持的 ZIP 压缩方式（method=${method}）：${name}`);
  }
  return out;
}

// 有人在书库外面又套了一层目录（如「书库备份/library.json」），把这一层前缀剥掉，
// 让整库包和裸包都能被同一套逻辑识别。
export function normalizeZip(files) {
  const libKey = [...files.keys()].find((k) => /(?:^|\/)library\.json$/i.test(k));
  const prefix = libKey ? libKey.slice(0, libKey.length - 'library.json'.length) : '';
  const out = new Map();
  for (const [k, v] of files) {
    const rel = prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k;
    out.set(rel.replace(/^\.\//, ''), v);
  }
  return out;
}

export async function exportLibrary(storage, root) {
  const entries = [];
  for (const f of [LIBRARY_FILE, COLLECTIONS_FILE, SETTINGS_FILE]) {
    const p = storage.join(root, f);
    if (await storage.exists(p)) entries.push({ name: f, data: await storage.readFile(p) });
  }
  const base = storage.join(root, BOOKS_DIR);
  const walk = async (rel) => {
    const abs = rel ? storage.join(base, rel) : base;
    for (const e of await storage.readdir(abs)) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(child);
      else entries.push({ name: `${BOOKS_DIR}/${child}`, data: await storage.readFile(storage.join(base, child)) });
    }
  };
  await walk('');
  return createZip(entries);
}

function isLibraryEntry(name) {
  return name === LIBRARY_FILE || name === COLLECTIONS_FILE || name === SETTINGS_FILE
    || name.startsWith(BOOKS_DIR + '/');
}

// 导入 .openlib：meta.json 按规范第 4 节合并，其余文件覆盖；.index/ 永不入包。
// 只写书库白名单路径，避免压缩包里的杂项文件被塞进书库根目录。
export async function importLibraryFiles(storage, root, files) {
  const lib = fromJson(files.get(LIBRARY_FILE));
  if (!lib || lib.format !== FORMAT) throw new Error('不是开放书库包');
  if (Number(lib.schema_version) > SCHEMA_VERSION) throw new Error('包版本高于本程序，请升级后再导入');
  await storage.mkdir(root);
  await storage.mkdir(storage.join(root, BOOKS_DIR));
  await storage.mkdir(storage.join(root, INDEX_DIR));
  const stats = { files: 0, books: 0, merged: 0 };
  for (const [name, data] of files) {
    if (name.startsWith('/') || name.includes('..') || !isLibraryEntry(name)) continue;
    const dest = storage.join(root, name);
    if (name.endsWith('/meta.json') && (await storage.exists(dest))) {
      const local = fromJson(await storage.readFile(dest));
      const remote = fromJson(data);
      if (local && remote) {
        await storage.writeFile(dest, toJson(mergeMeta(local, remote)));
        stats.merged++; stats.files++; stats.books++;
        continue;
      }
    }
    await storage.writeFile(dest, data);
    stats.files++;
    if (name.endsWith('/meta.json')) stats.books++;
  }
  return stats;
}

export async function importLibraryPack(storage, root, bytes) {
  return await importLibraryFiles(storage, root, normalizeZip(await readZip(bytes)));
}
