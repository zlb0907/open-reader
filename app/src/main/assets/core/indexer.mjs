import { INDEX_DIR, INDEX_FILE, BOOKS_DIR, DERIVED_TEXT, decode, makeSnippet } from './util.mjs';
import { listBooks } from './books.mjs';
import { decodeText } from './chapters.mjs';
import { isPlainText } from './parsers.mjs';

// node:sqlite 在 Node 22 需 --experimental-sqlite；浏览器 / Android WebView 无此模块，
// 自动降级为内存索引。该模块是除 StorageBackend 外唯一需要按端替换的部分。
// 搜索只用 LIKE 子串匹配（中文结果确定），因此正文存普通表即可；
// 早期版本的 FTS5 trigram 倒排索引前端从未调用，这里启动时自动清理回收空间。
const DatabaseSync = null; // Android WebView 无 node:sqlite，恒走内存索引

export async function openIndex(storage, root, { forceMemory = false } = {}) {
  if (forceMemory || !DatabaseSync) {
    return { kind: 'memory', rows: new Map(), storage, root,
      fallbackReason: forceMemory ? 'forced' : 'node:sqlite unavailable' };
  }
  try {
    await storage.mkdir(storage.join(root, INDEX_DIR));
    const db = new DatabaseSync(storage.join(root, INDEX_DIR, INDEX_FILE));
    db.exec(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY, title TEXT, author TEXT, updated_at TEXT, revision INTEGER
      );
      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY, book_id TEXT, idx INTEGER, title TEXT,
        start_offset INTEGER, end_offset INTEGER
      );
      CREATE TABLE IF NOT EXISTS book_search (
        book_id TEXT PRIMARY KEY, title TEXT, body TEXT
      );
    `);
    // 旧版 FTS5 表（含内部 data/idx/content 表）已无用，DROP + VACUUM 真正释放磁盘。
    let migrated = false;
    try {
      const old = db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='book_fts'"
      ).get();
      if (old) {
        db.exec('DROP TABLE book_fts;');
        // 清空增量标记，迫使启动时的 reindex(false) 走全量重建，填满 book_search。
        db.exec('DELETE FROM books; DELETE FROM chapters;');
        db.exec('VACUUM;');
        migrated = true;
      }
    } catch { /* 旧表损坏时忽略，book_search 仍可用 */ }
    return { kind: 'sqlite', db, tokenizer: null, migrated, storage, root };
  } catch (e) {
    return { kind: 'memory', rows: new Map(), storage, root, fallbackReason: e.message };
  }
}

async function bodyOf(storage, root, meta) {
  const p = storage.join(root, BOOKS_DIR, meta.id, DERIVED_TEXT);
  if (await storage.exists(p)) return decode(await storage.readFile(p));
  // 纯文本书不再存派生文件：从原件解码，结果与旧派生文本逐字符一致，
  // 因此章节 txt_offset 不会错位。
  if (isPlainText(meta.format)) {
    const src = storage.join(root, BOOKS_DIR, meta.id, `source.${meta.format}`);
    if (await storage.exists(src)) return decodeText(await storage.readFile(src)).text;
  }
  return '';
}

export async function reindex(idx, { incremental = true, books = null } = {}) {
  const list = books || await listBooks(idx.storage, idx.root);
  const stats = { scanned: list.length, indexed: 0, skipped: 0, removed: 0, kind: idx.kind };
  if (!incremental && idx.kind === 'sqlite') {
    idx.db.exec('DELETE FROM book_search; DELETE FROM chapters; DELETE FROM books;');
  } else if (!incremental) {
    idx.rows.clear();
  }

  if (idx.kind === 'sqlite') {
    const known = new Map();
    for (const r of idx.db.prepare('SELECT id, updated_at, revision FROM books').all()) {
      known.set(r.id, r);
    }
    const ids = new Set(list.map((b) => b.id));
    for (const id of known.keys()) {
      if (!ids.has(id)) {
        idx.db.prepare('DELETE FROM book_search WHERE book_id = ?').run(id);
        idx.db.prepare('DELETE FROM chapters WHERE book_id = ?').run(id);
        idx.db.prepare('DELETE FROM books WHERE id = ?').run(id);
        stats.removed++;
      }
    }
    for (const meta of list) {
      const k = known.get(meta.id);
      if (incremental && k && k.updated_at === meta.updated_at && Number(k.revision) === Number(meta.revision)) {
        stats.skipped++;
        continue;
      }
      const body = await bodyOf(idx.storage, idx.root, meta);
      idx.db.prepare('DELETE FROM book_search WHERE book_id = ?').run(meta.id);
      idx.db.prepare('DELETE FROM chapters WHERE book_id = ?').run(meta.id);
      idx.db.prepare('INSERT OR REPLACE INTO books (id,title,author,updated_at,revision) VALUES (?,?,?,?,?)')
        .run(meta.id, meta.title || '', meta.author || '', meta.updated_at || '', Number(meta.revision) || 1);
      idx.db.prepare('INSERT INTO book_search (book_id,title,body) VALUES (?,?,?)')
        .run(meta.id, meta.title || '', body);
      const insCh = idx.db.prepare('INSERT OR REPLACE INTO chapters (id,book_id,idx,title,start_offset,end_offset) VALUES (?,?,?,?,?,?)');
      for (const c of meta.chapters || []) {
        insCh.run(c.id, meta.id, c.index, c.title, c.locator?.start ?? 0, c.locator?.end ?? 0);
      }
      stats.indexed++;
    }
  } else {
    for (const meta of list) {
      idx.rows.set(meta.id, {
        id: meta.id, title: meta.title || '', author: meta.author || '',
        body: await bodyOf(idx.storage, idx.root, meta),
        updated_at: meta.updated_at, revision: meta.revision,
      });
      stats.indexed++;
    }
  }
  return stats;
}

// 中文子串检索统一用 LIKE 保证结果确定（正文存普通表，不建倒排索引）。
export function search(idx, term) {
  const q = String(term || '').trim();
  if (!q) return [];
  const like = `%${q}%`;
  let rows;
  if (idx.kind === 'sqlite') {
    rows = idx.db.prepare(
      'SELECT book_id, title, body FROM book_search WHERE title LIKE ? OR body LIKE ? LIMIT 50'
    ).all(like, like);
  } else {
    rows = [...idx.rows.values()]
      .filter((r) => r.title.includes(q) || r.body.includes(q)).slice(0, 50);
  }
  return rows.map((r) => ({
    bookId: r.book_id ?? r.id,
    title: r.title,
    snippet: makeSnippet(r.body, q),
  }));
}

// 兼容旧接口：FTS5 已移除，降级到同一套 LIKE 查询，返回结构保持不变。
export function searchFts(idx, term) {
  return search(idx, term);
}

export function closeIndex(idx) {
  if (idx?.kind === 'sqlite') { try { idx.db.close(); } catch { /* noop */ } }
  if (idx?.kind === 'memory') idx.rows.clear();
}
