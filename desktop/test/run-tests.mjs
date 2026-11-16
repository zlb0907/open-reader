import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNodeStorage } from '../src/core/storage.mjs';
import { LibraryApp } from '../src/core/api.mjs';
import { openIndex } from '../src/core/indexer.mjs';
import { openLibrary } from '../src/core/library.mjs';
import { mergeMeta, applyBookmark, applyRemoveBookmark, activeBookmarks } from '../src/core/progress.mjs';
import { decodeText } from '../src/core/chapters.mjs';
import { readZip } from '../src/core/pack.mjs';
import { LIBRARY_FILE, INDEX_DIR, META_FILE, FORMAT, SCHEMA_VERSION, toJson, encode } from '../src/core/util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'open-reader-test-'));
const rootA = path.join(tmp, 'library-a');
const rootB = path.join(tmp, 'library-b');
const storage = createNodeStorage();
const dec = new TextDecoder();

let pass = 0, fail = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) {
    console.log('  FAIL  ' + name);
    console.log('        ' + String(e?.message || e).split('\n')[0]);
    fail++; failures.push({ name, error: String(e?.message || e) });
  }
}

const bodyOf = (n, tag) => Array.from({ length: n },
  (_, i) => `第${i + 1}行 ${tag} 关键字青瓦纸鸢 ${'文'.repeat(12)}`).join('\n');
const TXT = `测试之书\n\n第一章 起始\n${bodyOf(30, '起始')}\n\n第二章 中段\n${bodyOf(25, '中段')}\n\n第三章 终章\n${bodyOf(20, '终章')}\n`;
const TXT_BYTES = encode(TXT);

const app = new LibraryApp(storage, rootA, { name: '测试书库' });
await app.init();

console.log('\n== open-reader v0.1 · core 断言测试 ==');
console.log('临时目录: ' + tmp);
let bookId = null;
let packBytes = null;

await t('01 建库：目录结构与 library.json 符合规范', async () => {
  const lib = JSON.parse(dec.decode(await fs.readFile(path.join(rootA, LIBRARY_FILE))));
  assert.equal(lib.format, FORMAT);
  assert.equal(lib.schema_version, SCHEMA_VERSION);
  assert.ok(lib.library_id && lib.created_at && lib.updated_at);
  assert.ok((await fs.stat(path.join(rootA, 'books'))).isDirectory());
  assert.ok((await fs.stat(path.join(rootA, INDEX_DIR))).isDirectory());
  assert.equal((await app.state()).index.kind, 'sqlite');
});

await t('02 导入 UTF-8 TXT：自动 3 章、sha256、原件不改写、可导出', async () => {
  const m = await app.importBook({ filename: '测试 之书.txt', bytes: TXT_BYTES });
  bookId = m.id;
  assert.equal(m.chapters.length, 3);
  assert.equal(m.chapters[0].title, '第一章 起始');
  assert.equal(m.encoding, 'utf-8');
  assert.equal(m.original_filename, '测试 之书.txt');
  assert.equal(m.size_bytes, TXT_BYTES.length);
  assert.match(m.sha256, /^[0-9a-f]{64}$/);
  const src = await fs.readFile(path.join(rootA, 'books', m.id, 'source.txt'));
  assert.deepEqual(new Uint8Array(src), TXT_BYTES);
  const out = await app.exportBook(m.id);
  assert.deepEqual(out.bytes, TXT_BYTES);
  assert.equal(out.filename, '测试 之书.txt');
});

await t('03 GB18030 编码检测与导入', async () => {
  const bytes = new Uint8Array(await fs.readFile(path.join(FIXTURES, 'gb18030-chinese.txt')));
  const d = decodeText(bytes);
  assert.equal(d.encoding, 'gb18030');
  assert.ok(d.text.includes('你好世界'));
  const m = await app.importBook({ filename: 'gb18030.txt', bytes });
  assert.equal(m.encoding, 'gb18030');
  assert.ok(m.chapters.length >= 1);
});

await t('04 无章节文本兜底为「全文」单章', async () => {
  const text = '没有章节的一段文字。\n第二行。\n';
  const m = await app.importBook({ filename: '无章节.txt', bytes: encode(text) });
  assert.equal(m.chapters.length, 1);
  assert.equal(m.chapters[0].title, '全文');
  assert.equal(m.chapters[0].locator.end, text.length);
});

await t('05 分页读取：offset 连续、拼接还原全文（不丢字）', async () => {
  const meta = await app.getBook(bookId);
  let joined = '';
  for (const ch of meta.chapters) {
    let off = 0, done = false, guard = 0;
    while (!done) {
      const r = await app.readChapter(bookId, ch.id, off, 1000);
      joined += r.text;
      assert.equal(r.offset, off);
      assert.ok(r.nextOffset > off || r.done);
      off = r.nextOffset; done = r.done;
      if (++guard > 500) throw new Error('分页未收敛，可能出现死循环');
    }
  }
  assert.equal(joined, TXT.replace(/\r\n?/g, '\n'));
});

await t('06 进度保存：写入后可读回', async () => {
  const ch2 = (await app.getBook(bookId)).chapters[1].id;
  const m = await app.setProgress(bookId, {
    percent: 0.42, chapter_id: ch2, locator: { kind: 'txt_offset', offset: 123 },
  });
  assert.equal(m.progress.percent, 0.42);
  assert.equal(m.progress.locator.offset, 123);
  assert.equal((await app.getBook(bookId)).progress.percent, 0.42);
});

await t('07 多端合并：进度取更靠前、书签并集、墓碑删除', async () => {
  const t0 = '2026-01-01T00:00:00Z', t1 = '2026-01-02T00:00:00Z';
  const base = { id: 'x', revision: 1, updated_at: t0, chapters: [], bookmarks: [],
    progress: { percent: 0.2, updated_at: t0 } };
  const a = structuredClone(base);
  a.bookmarks = [{ id: 'b1', chapter_id: 'c1', offset: 10, note: '甲', created_at: t0, updated_at: t0, deleted_at: null }];
  const b = structuredClone(base);
  b.updated_at = t1;
  b.progress = { percent: 0.8, updated_at: t1 };
  b.bookmarks = [{ id: 'b2', chapter_id: 'c1', offset: 20, note: '乙', created_at: t1, updated_at: t1, deleted_at: null }];
  const m = mergeMeta(a, b);
  assert.equal(m.progress.percent, 0.8);
  assert.deepEqual(m.bookmarks.map((x) => x.id).sort(), ['b1', 'b2']);
  assert.ok(m.revision >= 2);

  const withBm = applyBookmark(await app.getBook(bookId), { offset: 5, note: '测试' });
  assert.equal(activeBookmarks(withBm).length, 1);
  const removed = applyRemoveBookmark(withBm, withBm.bookmarks[0].id);
  assert.equal(activeBookmarks(removed).length, 0);
  assert.ok(removed.bookmarks[0].deleted_at);
});

await t('08 书架树与偏好设置持久化', async () => {
  await app.setCollections([{ id: 'c1', name: '小说', children: [], hidden: false }]);
  assert.equal((await app.state()).collections.root[0].name, '小说');
  const s = await app.setSettings({ font_size: 22, theme: 'sepia' });
  assert.equal(s.font_size, 22);
  assert.equal((await app.getSettings()).theme, 'sepia');
});

await t('09 索引：全量 / 中文子串 / 增量跳过 / FTS5 MATCH', async () => {
  const full = await app.reindex(true);
  assert.equal(full.indexed, full.scanned);
  const r = await app.search('青瓦纸鸢');
  assert.ok(r.results.length >= 1);
  assert.ok(r.results.some((x) => x.bookId === bookId));
  const inc = await app.reindex(false);
  assert.equal(inc.skipped, inc.scanned);
  const fts = await app.searchFts('青瓦纸鸢');
  assert.ok(fts.results.length >= 1);
});

await t('10 删掉 .index/ 后重建，搜索结果一致', async () => {
  const before = (await app.search('青瓦纸鸢')).results.length;
  app.close();
  await storage.remove(storage.join(rootA, INDEX_DIR));
  app.index = await openIndex(storage, rootA);
  const st = await app.reindex(true);
  assert.equal(st.indexed, st.scanned);
  assert.equal((await app.search('青瓦纸鸢')).results.length, before);
});

await t('11 .openlib 导出：标准 ZIP、含 books、不含 .index', async () => {
  packBytes = await app.exportLibrary();
  assert.equal(dec.decode(packBytes.slice(0, 2)), 'PK');
  const files = await readZip(packBytes);
  assert.ok(files.has(LIBRARY_FILE));
  assert.ok([...files.keys()].some((n) => n.endsWith('/' + META_FILE)));
  assert.ok(![...files.keys()].some((n) => n.startsWith(INDEX_DIR)));
  assert.equal(JSON.parse(dec.decode(files.get(LIBRARY_FILE))).format, FORMAT);
});

await t('12 .openlib 导入新库：书籍数与正文一致，重复导入走合并', async () => {
  const appB = new LibraryApp(storage, rootB);
  await appB.init();
  const files = await readZip(packBytes);
  const metaCount = [...files.keys()].filter((n) => n.endsWith('/' + META_FILE)).length;
  const stats = await appB.importLibrary(packBytes);
  assert.equal(stats.books, metaCount);
  assert.equal((await appB.listBooks()).length, (await app.listBooks()).length);
  const chA = (await app.getBook(bookId)).chapters[0].id;
  const chB = (await appB.getBook(bookId)).chapters[0].id;
  assert.equal((await appB.readChapter(bookId, chB, 0, 50000)).text,
    (await app.readChapter(bookId, chA, 0, 50000)).text);
  const again = await appB.importLibrary(packBytes);
  assert.equal(again.merged, metaCount);
  appB.close();
});

await t('13 防御：非法 ID 与高版本书库拒绝写入', async () => {
  await assert.rejects(() => app.getBook('../etc/passwd'), /非法书籍 ID/);
  await storage.writeFile(storage.join(rootB, LIBRARY_FILE),
    toJson({ format: FORMAT, schema_version: 99 }));
  await assert.rejects(() => openLibrary(storage, rootB), /高于本程序/);
});

await t('14 无效 PDF：存原件、明确降级、可导出取回', async () => {
  const bytes = encode('%PDF-1.4 fake');
  const m = await app.importBook({ filename: '样本.pdf', bytes });
  assert.equal(m.parse_status, 'unsupported');
  assert.equal(m.chapters.length, 0);
  const r = await app.readChapter(m.id, null, 0, 1000);
  assert.ok(r.notice);
  assert.deepEqual((await app.exportBook(m.id)).bytes, bytes);
});

app.close();
try { await fs.rm(tmp, { recursive: true, force: true }); } catch { /* Windows 文件锁，忽略 */ }
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (fail) {
  console.log('失败项: ' + failures.map((f) => f.name).join('; '));
  process.exit(1);
}
