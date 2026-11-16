import {
  openLibrary as openLibraryCore, getCollections as getCollectionsCore,
  saveCollections as saveCollectionsCore, getSettings as getSettingsCore,
  saveSettings as saveSettingsCore,
} from './library.mjs';
import {
  importBook as importBookCore, listBooks as listBooksCore, getMeta,
  saveMeta, readChapter as readChapterCore, exportBookBytes,
  deleteBook as deleteBookCore, bookDir, ensureParsed, PARSER_VERSION,
} from './books.mjs';
import { applyProgress, applyBookmark, applyRemoveBookmark } from './progress.mjs';
import {
  openIndex, reindex as reindexCore, search as searchCore, searchFts, closeIndex,
} from './indexer.mjs';
import {
  exportLibrary as exportLibraryCore, importLibraryPack,
  readZip, normalizeZip, importLibraryFiles,
} from './pack.mjs';
import { sha256Hex } from './util.mjs';

// 智能导入：包内这些扩展名才当书，其余（图片、说明、元数据）一律跳过。
const BOOK_EXT = new Set([
  'txt', 'md', 'markdown', 'text', 'log', 'rst', 'tex', 'srt', 'csv', 'json', 'xml', 'nfo',
  'epub', 'docx', 'doc', 'pdf', 'rtf', 'odt', 'ott', 'fb2', 'html', 'htm', 'xhtml',
  'mht', 'mhtml', 'mobi', 'prc', 'pdb', 'azw', 'azw3',
]);
const SKIP_NAMES = new Set([
  'library.json', 'collections.json', 'settings.json', 'meta.json',
  '.ds_store', 'thumbs.db', 'desktop.ini',
]);

function bookSummary(m) {
  return {
    id: m.id,
    title: m.title,
    author: m.author || '',
    format: m.format,
    encoding: m.encoding,
    size_bytes: m.size_bytes,
    sha256: m.sha256,
    original_filename: m.original_filename,
    added_at: m.added_at,
    updated_at: m.updated_at,
    revision: m.revision,
    parse_status: m.parse_status,
    parse_error: m.parse_error || null,
    collection_ids: m.collection_ids || [],
    // 封面标记：所有返回书籍摘要的接口都带上，避免 get-book 覆盖掉书架列表里的字段。
    // withCovers() 会再按真实文件存在与否覆盖一次，以文件为准。
    hasCover: !!m.cover?.file,
    chapterCount: (m.chapters || []).length,
    chapters: (m.chapters || []).map((c) => ({ id: c.id, index: c.index, title: c.title,
      ...(c.num != null ? { num: c.num } : {}),
      ...(c.numEnd != null ? { numEnd: c.numEnd } : {}),
      locator: c.locator, ...(c.image ? { image: c.image } : {}) })),
    progress: m.progress || null,
    bookmarks: (m.bookmarks || []).filter((b) => !b.deleted_at),
  };
}

// 门面：HTTP 服务、CLI 测试、将来的 Android WebView 都调用同一组方法。
export class LibraryApp {
  constructor(storage, root, opts = {}) {
    this.storage = storage;
    this.root = root;
    this.opts = opts;
    this.library = null;
    this.index = null;
  }

  async init() {
    this.library = await openLibraryCore(this.storage, this.root, this.opts.name);
    this.index = await openIndex(this.storage, this.root, { forceMemory: !!this.opts.forceMemory });
    await this.migrateParsing();
    await this.reindex(false);
    return this.library;
  }

  // 升级解析器后，把旧版本导入的书从原件重跑一次（幂等，只做一次）。
  // 只按 parser_version 判断，不能因为「已解析成功」就跳过——v3 的分节合并
  // 需要对已经能读的书也重跑，否则目录永远是旧结构。
  async migrateParsing() {
    for (const m of await listBooksCore(this.storage, this.root)) {
      if (Number(m.parser_version) >= PARSER_VERSION) continue;
      try { await ensureParsed(this.storage, this.root, m); } catch { /* 单本失败不影响启动 */ }
    }
  }

  async state() {
    return {
      library: this.library,
      root: this.root,
      collections: await getCollectionsCore(this.storage, this.root),
      settings: await getSettingsCore(this.storage, this.root),
      books: await this.withCovers((await listBooksCore(this.storage, this.root)).map(bookSummary)),
      index: {
        kind: this.index.kind,
        tokenizer: this.index.tokenizer || null,
        fallbackReason: this.index.fallbackReason || null,
      },
    };
  }

  async listBooks() {
    return await this.withCovers((await listBooksCore(this.storage, this.root)).map(bookSummary));
  }

  async getBook(id) {
    const summary = bookSummary(await ensureParsed(this.storage, this.root,
      await getMeta(this.storage, this.root, id)));
    return (await this.withCovers([summary]))[0];   // 以封面文件是否真实存在为准
  }

  async importBook({ filename, bytes, collectionIds }) {
    const meta = await importBookCore(this.storage, this.root, { filename, bytes, collectionIds });
    await this.reindex(false);
    return bookSummary(meta);
  }

  // 智能导入：一个入口自动分诊。
  // ① 有 library.json + books/*/meta.json → 整库合并（保留 UUID / 进度 / 分类 / 封面）
  // ② 否则把包内每个书文件当单本导入，按 sha256 去重，逐条给出明细
  // 支持 store / deflate 与 UTF-8 / GBK 文件名，包外再套一层目录也能识别。
  async importSmart({ filename, bytes }) {
    const label = filename || '压缩包';
    let files;
    try { files = normalizeZip(await readZip(bytes)); }
    catch (e) { throw new Error(`${label}：${e.message}`); }

    const names = [...files.keys()];
    const isPack = files.has('library.json')
      && names.some((n) => /^books\/[^/]+\/meta\.json$/i.test(n));
    if (isPack) {
      const stats = await importLibraryFiles(this.storage, this.root, files);
      this.library = await openLibraryCore(this.storage, this.root);
      await this.reindex(true);
      return { kind: 'library', file: label, books: stats.books, merged: stats.merged,
        files: stats.files, ok: [], skip: [], fail: [] };
    }

    const seen = new Set((await listBooksCore(this.storage, this.root))
      .map((m) => m.sha256).filter(Boolean));
    const report = { kind: 'books', file: label, ok: [], skip: [], fail: [] };
    for (const [name, data] of files) {
      const base = String(name).split('/').pop();
      if (!base || name.endsWith('/') || base.startsWith('.')) continue;
      if (/^__MACOSX\//i.test(name)) continue;
      const low = base.toLowerCase();
      if (SKIP_NAMES.has(low)) continue;
      const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(low)?.[1] || '').toLowerCase();
      if (!BOOK_EXT.has(ext)) continue;
      if (!data?.length) { report.skip.push({ name: base, reason: '空文件' }); continue; }
      try {
        const hash = await sha256Hex(data);
        if (seen.has(hash)) { report.skip.push({ name: base, reason: '内容重复（已存在）' }); continue; }
        const meta = await importBookCore(this.storage, this.root, { filename: base, bytes: data });
        seen.add(hash);                    // 同一个包内重复的文件也只导一次
        report.ok.push({ name: base, title: meta.title });
      } catch (e) { report.fail.push({ name: base, error: e.message || String(e) }); }
    }
    if (report.ok.length) await this.reindex(false);
    return report;
  }

  async readChapter(id, chapterId, offset = 0, limit = 6000) {
    const settings = await getSettingsCore(this.storage, this.root);
    const size = Math.max(500, Math.min(50000, Number(limit) || settings.page_size || 6000));
    return await readChapterCore(this.storage, this.root, id, chapterId, offset, size);
  }

  async setProgress(id, patch) {
    const meta = await getMeta(this.storage, this.root, id);
    return bookSummary(await saveMeta(this.storage, this.root, applyProgress(meta, patch)));
  }

  async addBookmark(id, patch) {
    const meta = await getMeta(this.storage, this.root, id);
    return bookSummary(await saveMeta(this.storage, this.root, applyBookmark(meta, patch)));
  }

  async removeBookmark(id, bookmarkId) {
    const meta = await getMeta(this.storage, this.root, id);
    return bookSummary(await saveMeta(this.storage, this.root, applyRemoveBookmark(meta, bookmarkId)));
  }

  async search(q) {
    return { mode: 'like', results: searchCore(this.index, q) };
  }

  async searchFts(q) {
    // FTS5 已移除，兼容接口降级到同一套 LIKE 查询
    return { mode: 'like', tokenizer: null, results: searchFts(this.index, q) };
  }

  async reindex(full = false) {
    return await reindexCore(this.index, { incremental: !full });
  }

  async setCollections(tree) {
    return await saveCollectionsCore(this.storage, this.root, tree);
  }

  async setBookCollections(id, collectionIds) {
    const meta = await getMeta(this.storage, this.root, id);
    meta.collection_ids = Array.isArray(collectionIds) ? [...new Set(collectionIds.map(String))] : [];
    return bookSummary(await saveMeta(this.storage, this.root, meta));
  }

  /* ---------- 手动封面：统一转 JPEG 存 derived/cover.jpg ----------
     放在 books/ 目录内，导出 .openlib 时 pack.mjs 整目录打包会自动带上。 */
  coverFile(id) {
    return this.storage.join(bookDir(this.storage, this.root, id), 'derived', 'cover.jpg');
  }

  // 只给书目附加一个布尔标记，图片本体走 /api/cover 按需加载，state() 不塞 base64。
  async withCovers(list) {
    return await Promise.all(list.map(async (b) => ({
      ...b, hasCover: await this.storage.exists(this.coverFile(b.id)),
    })));
  }

  async getBookCover(id) {
    const p = this.coverFile(id);
    if (!await this.storage.exists(p)) throw new Error('这本书还没有封面');
    return await this.storage.readFile(p);
  }

  // dataUrl 由前端 canvas 生成，固定为 data:image/jpeg;base64,...；上限 3 MB。
  async setBookCover(id, dataUrl) {
    const meta = await getMeta(this.storage, this.root, id);   // 顺带校验 ID 合法性
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw new Error('封面数据格式不正确');
    const bin = atob(m[1]);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (bytes.length < 2) throw new Error('封面数据为空');
    if (bytes.length > 3 * 1024 * 1024) throw new Error('封面过大（上限 3 MB）');
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('不是有效的 JPEG 图片');
    await this.storage.writeFile(this.coverFile(id), bytes);
    meta.cover = { file: 'derived/cover.jpg', updated_at: new Date().toISOString() };
    await saveMeta(this.storage, this.root, meta);
    return { ok: true, size: bytes.length };
  }

  async removeBookCover(id) {
    const meta = await getMeta(this.storage, this.root, id);
    await this.storage.remove(this.coverFile(id));
    if (meta.cover) { delete meta.cover; await saveMeta(this.storage, this.root, meta); }
    return { ok: true };
  }

  async renameBook(id, title) {
    const meta = await getMeta(this.storage, this.root, id);
    const t = String(title || '').trim().slice(0, 120);
    if (!t) throw new Error('书名不能为空');
    meta.title = t;
    return bookSummary(await saveMeta(this.storage, this.root, meta));
  }

  async listBookmarks() {
    const out = [];
    for (const m of await listBooksCore(this.storage, this.root)) {
      for (const b of (m.bookmarks || []).filter((x) => !x.deleted_at)) {
        out.push({ ...b, bookId: m.id, bookTitle: m.title });
      }
    }
    return out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  async getSettings() {
    return await getSettingsCore(this.storage, this.root);
  }

  async setSettings(patch) {
    return await saveSettingsCore(this.storage, this.root, patch);
  }

  async exportBook(id) {
    return await exportBookBytes(this.storage, this.root, id);
  }

  // 扫描版 PDF：按 meta 里记录的字节区间，从原 PDF 直接切片返回页面图片。
  // 不额外存一份 74 MB 的图片副本，原件仍然只有一份。
  async getPageImage(id, chapterId) {
    const meta = await getMeta(this.storage, this.root, id);
    const ch = meta.chapters.find((c) => c.id === chapterId) || meta.chapters[0];
    const img = ch?.image;
    if (!img || img.kind !== 'pdf_image' || !Number.isFinite(img.offset) || !Number.isFinite(img.length)) {
      throw new Error('该章节没有可显示的页面图片');
    }
    const src = this.storage.join(bookDir(this.storage, this.root, meta.id), `source.${meta.format}`);
    const all = await this.storage.readFile(src);
    const bytes = all.subarray(img.offset, img.offset + img.length);
    if (!bytes.length) throw new Error('页面图片数据为空');
    return { bytes, mime: img.mime || 'image/jpeg' };
  }

  async exportLibrary() {
    return await exportLibraryCore(this.storage, this.root);
  }

  async importLibrary(bytes) {
    const stats = await importLibraryPack(this.storage, this.root, bytes);
    this.library = await openLibraryCore(this.storage, this.root);
    await this.reindex(true);
    return stats;
  }

  async deleteBook(id) {
    const r = await deleteBookCore(this.storage, this.root, id);
    await this.reindex(true);
    return r;
  }

  close() {
    closeIndex(this.index);
  }
}
