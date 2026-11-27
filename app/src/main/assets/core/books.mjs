import {
  BOOKS_DIR, META_FILE, DERIVED_TEXT, uuid, nowIso, encode, decode,
  sha256Hex, safeName, extOf, titleFromName, toJson, fromJson,
} from './util.mjs';
import { decodeText, sliceChapter } from './chapters.mjs';
import { parseBook, isPlainText } from './parsers.mjs';

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 解析器版本：升级解析能力后，旧版本导入的书会自动重解析一次。
// 原件从未改写，所以这是纯本地的派生数据迁移，不需要用户重新导入。
// v3: 合并「第N章 主标题（1）…（10）」分节体，目录不再出现成百上千条重复标题。
export const PARSER_VERSION = 3;

export function bookDir(storage, root, id) {
  return storage.join(root, BOOKS_DIR, id);
}

function checkId(id) {
  if (!ID_RE.test(String(id || ''))) throw new Error('非法书籍 ID');
  return String(id);
}

// 导入：原件原样复制 + 生成派生 UTF-8 文本 + 生成 meta.json（规范第 5 节）。
export async function importBook(storage, root, { filename, bytes, collectionIds = [], id = null }) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ext = extOf(filename);
  const bookId = id ? checkId(id) : uuid();
  const dir = bookDir(storage, root, bookId);
  await storage.mkdir(dir);
  await storage.writeFile(storage.join(dir, `source.${ext}`), data);

  // 原件永远原样保留；派生文本只用于阅读与检索，可随时由原件重建。
  // 纯文本类（txt/md/...）原件即正文，decodeText(source) 与派生文本逐字符一致，
  // 故不再落盘第二份，避免大部头 TXT 把书库体积翻倍。
  const parsed = await parseBook(filename, data);
  if (!isPlainText(ext)) {
    await storage.writeFile(storage.join(dir, DERIVED_TEXT), encode(parsed.text));
  }

  const t = nowIso();
  const chapters = parsed.chapters || [];
  const meta = {
    id: bookId,
    title: parsed.title || titleFromName(filename),
    author: parsed.author || '',
    original_filename: safeName(filename),
    format: ext,
    encoding: parsed.encoding,
    size_bytes: data.byteLength,
    sha256: await sha256Hex(data),
    collection_ids: Array.isArray(collectionIds) ? collectionIds : [],
    tags: [],
    added_at: t,
    updated_at: t,
    revision: 1,
    parser_version: PARSER_VERSION,
    parse_status: parsed.parse_status,
    ...(parsed.error ? { parse_error: parsed.error } : {}),
    chapters,
    progress: {
      chapter_id: chapters[0]?.id ?? null,
      percent: 0,
      locator: { kind: 'txt_offset', offset: 0 },
      updated_at: t,
    },
    bookmarks: [],
  };
  await saveMeta(storage, root, meta, { bump: false });
  return meta;
}

export async function listBooks(storage, root) {
  const dir = storage.join(root, BOOKS_DIR);
  const entries = await storage.readdir(dir);
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = storage.join(dir, e.name, META_FILE);
    if (!(await storage.exists(p))) continue;
    const meta = fromJson(await storage.readFile(p));
    if (meta && meta.id) out.push(meta);
  }
  out.sort((a, b) => String(a.added_at || '').localeCompare(String(b.added_at || '')));
  return out;
}

export async function getMeta(storage, root, id) {
  const bookId = checkId(id);
  const p = storage.join(root, BOOKS_DIR, bookId, META_FILE);
  if (!(await storage.exists(p))) throw new Error('书籍不存在: ' + bookId);
  const meta = fromJson(await storage.readFile(p));
  if (!meta) throw new Error('meta.json 损坏: ' + bookId);
  return meta;
}

export async function saveMeta(storage, root, meta, { bump = true } = {}) {
  if (bump) {
    meta.revision = (Number(meta.revision) || 1) + 1;
    meta.updated_at = nowIso();
  }
  await storage.writeFile(storage.join(root, BOOKS_DIR, meta.id, META_FILE), toJson(meta));
  return meta;
}

export async function getBookText(storage, root, id) {
  const bookId = checkId(id);
  const derived = storage.join(root, BOOKS_DIR, bookId, DERIVED_TEXT);
  if (await storage.exists(derived)) return decode(await storage.readFile(derived));
  const meta = await getMeta(storage, root, bookId);
  const src = storage.join(root, BOOKS_DIR, bookId, `source.${meta.format}`);
  const { text } = decodeText(await storage.readFile(src));
  return text;
}

/**
 * 章节结构变化（分节合并等）后，book_id 不变但 chapter_id 全部重建。
 * 按「全书绝对字符偏移」把阅读进度与书签重新挂到包含该位置的新章节上，
 * 这样升级解析器不会让用户丢进度。纯函数，便于测试。
 */
export function migrateChapterAnchors(oldChapters, newChapters, meta) {
  const oldById = new Map((oldChapters || []).map((c) => [c.id, c]));
  const list = newChapters || [];
  const remap = (chapterId, offset) => {
    const old = oldById.get(chapterId);
    if (!old || !list.length) return null;
    const abs = (Number(old.locator?.start) || 0) + (Number(offset) || 0);
    let target = list[list.length - 1];
    for (const n of list) {
      const s = Number(n.locator?.start) || 0;
      const e = Number(n.locator?.end) || 0;
      if (abs >= s && abs < e) { target = n; break; }
    }
    const s = Number(target.locator?.start) || 0;
    const e = Number(target.locator?.end) || 0;
    const len = Math.max(1, e - s);
    return { chapter_id: target.id, offset: Math.max(0, Math.min(len - 1, abs - s)) };
  };
  const out = { ...meta };
  const p = remap(meta.progress?.chapter_id, meta.progress?.locator?.offset);
  if (p && out.progress) {
    out.progress = { ...out.progress, chapter_id: p.chapter_id,
      locator: { ...(out.progress.locator || {}), offset: p.offset } };
  }
  if (Array.isArray(out.bookmarks)) {
    out.bookmarks = out.bookmarks.map((bm) => {
      const r = remap(bm.chapter_id, bm.offset);
      return r ? { ...bm, chapter_id: r.chapter_id, offset: r.offset } : bm;
    });
  }
  return out;
}

// 旧版本导入的书用当前解析器从原件重跑一次并写回 meta。
// 用 parser_version 做幂等，避免每次启动都重复读大文件。
export async function ensureParsed(storage, root, meta) {
  if (Number(meta.parser_version) >= PARSER_VERSION) return meta;
  const dir = bookDir(storage, root, meta.id);
  const src = storage.join(dir, `source.${meta.format}`);
  if (!(await storage.exists(src))) return meta;
  let parsed = null;
  try { parsed = await parseBook(meta.original_filename, await storage.readFile(src)); }
  catch { /* 单本失败不拖垮全书库 */ }
  let next = { ...meta, parser_version: PARSER_VERSION };
  if (parsed && parsed.parse_status === 'ok' && (parsed.chapters || []).length) {
    // 先按绝对偏移迁移进度 / 书签，再替换章节表（新表的 chapter_id 是全新 uuid）。
    next = migrateChapterAnchors(meta.chapters, parsed.chapters, next);
    next.parse_status = 'ok';
    delete next.parse_error;
    next.chapters = parsed.chapters;
    next.encoding = parsed.encoding;
    if (parsed.title && !meta.title) next.title = parsed.title;
    if (parsed.author) next.author = parsed.author;
    if (!next.progress?.chapter_id) {
      next.progress = { ...(next.progress || {}), chapter_id: parsed.chapters[0].id,
        percent: 0, locator: { kind: 'txt_offset', offset: 0 }, updated_at: next.updated_at };
    }
    if (!isPlainText(meta.format)) {
      await storage.writeFile(storage.join(dir, DERIVED_TEXT), encode(parsed.text));
    }
  } else if (parsed) {
    next.parse_status = parsed.parse_status;
    if (parsed.error) next.parse_error = parsed.error;
    else delete next.parse_error;
  }
  return await saveMeta(storage, root, next);
}

export async function readChapter(storage, root, id, chapterId, offset = 0, limit = 6000) {
  const meta = await ensureParsed(storage, root, await getMeta(storage, root, id));
  const ch = meta.chapters.find((c) => c.id === chapterId) || meta.chapters[0];
  if (!ch) {
    const notice = meta.parse_error
      || (meta.parse_status === 'unsupported' ? '该格式暂不解析，原件已完整保留，可点「导出」取回。' : '本书没有可解析的正文');
    return { chapter: null, text: '', offset: 0, nextOffset: 0, total: 0, done: true, notice };
  }
  const full = await getBookText(storage, root, id);
  const slice = sliceChapter(full, ch, offset, limit);
  return { chapter: { id: ch.id, index: ch.index, title: ch.title,
    ...(ch.num != null ? { num: ch.num } : {}),
    ...(ch.numEnd != null ? { numEnd: ch.numEnd } : {}),
    ...(ch.image ? { image: ch.image } : {}) },
    ...slice, chapterIndex: ch.index, chapterCount: meta.chapters.length,
    notice: ch.image ? '扫描版 PDF：按原页图片显示，无文字层，不支持全文检索' : null };
}

export async function exportBookBytes(storage, root, id) {
  const meta = await getMeta(storage, root, id);
  const p = storage.join(root, BOOKS_DIR, meta.id, `source.${meta.format}`);
  return { bytes: await storage.readFile(p), filename: meta.original_filename, meta };
}

export async function deleteBook(storage, root, id) {
  const meta = await getMeta(storage, root, id);
  await storage.remove(bookDir(storage, root, meta.id));
  return { deleted: meta.id };
}
