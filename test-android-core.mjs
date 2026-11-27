/* Runs the whole Android core in Node against an in-memory IndexedDB.
   Catches StorageBackend / core drift after `node sync-web.mjs`.
   Usage: node test-android-core.mjs */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, 'app', 'src', 'main', 'assets');
const mod = (f) => pathToFileURL(path.join(ASSETS, f)).href;

const kv = new Map();
const req = (result) => {
  const r = { result: undefined, onsuccess: null, onerror: null };
  queueMicrotask(() => { r.result = result; if (r.onsuccess) r.onsuccess(); });
  return r;
};
const fakeDb = {
  objectStoreNames: { contains: () => true },
  createObjectStore: () => {},
  transaction: () => ({
    onabort: null, error: null,
    objectStore: () => ({
      get: (k) => req(kv.get(k)),
      put: (v, k) => { kv.set(k, v); return req(k); },
      delete: (k) => { kv.delete(k); return req(undefined); },
      getAllKeys: () => req([...kv.keys()]),
    }),
  }),
};
globalThis.indexedDB = {
  open: () => {
    const r = { result: fakeDb, onupgradeneeded: null, onsuccess: null, onerror: null };
    queueMicrotask(() => { if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess(); });
    return r;
  },
};

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  OK   ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + '  ' + extra); }
}

const { createAndroidStorage } = await import(mod('android-storage.mjs'));
const { LibraryApp } = await import(mod('core/api.mjs'));
const storage = createAndroidStorage();
const app = new LibraryApp(storage, '/library', { name: '测试书库', forceMemory: true });
await app.init();

ok('初始化 / 空库 / 内存索引', (await app.state()).index.kind === 'memory');
ok('默认设置', typeof (await app.getSettings()).page_size === 'number');
ok('readdir 空目录', (await storage.readdir('/library/books')).length === 0);

const body = [
  '第一章 旧书摊', '　山行笔记里记着一处旧书摊。青瓦纸鸢是这一章的暗号。', '',
  '第二章 雨夜', '　雨夜里翻到第三十七页，纸上有淡淡的霉味。', '',
].join('\n');
const book = await app.importBook({ filename: '测试·山行笔记.txt', bytes: new TextEncoder().encode(body) });
ok('导入 TXT + 自动分章', book.parse_status === 'ok' && book.chapters.length >= 2, '章数=' + book.chapters.length);
ok('state 列出书籍', (await app.state()).books.length === 1);
ok('getBook', (await app.getBook(book.id)).chapters.length >= 2);
const ch = await app.readChapter(book.id, book.chapters[0].id, 0, 6000);
ok('readChapter 正文', ch.text.includes('旧书摊'), 'len=' + ch.text.length);

ok('setProgress 持久化', !!(await app.setProgress(book.id, { chapterId: book.chapters[1].id, offset: 12 })).progress);
const bm = await app.addBookmark(book.id, { chapterId: book.chapters[0].id, offset: 5, text: '记号' });
ok('addBookmark', (await app.listBookmarks()).length === 1);
await app.removeBookmark(book.id, bm.bookmarks?.[0]?.id);
ok('removeBookmark', (await app.listBookmarks()).length === 0);

const s = await app.search('青瓦纸鸢');
ok('全文检索（内存索引）', Array.isArray(s.results) && s.results.length >= 1, 'hits=' + s.results?.length);
ok('searchFts 降级', Array.isArray((await app.searchFts('雨夜')).results));

await app.setCollections({ updated_at: new Date().toISOString(), root: [{ id: 'c1', name: '小说', children: [] }] });
await app.setBookCollections(book.id, ['c1']);
ok('分类 + 归属', (await app.state()).collections.root.length === 1
  && (await app.getBook(book.id)).collection_ids.includes('c1'));
await app.setSettings({ page_size: 4321 });
ok('设置读写', (await app.getSettings()).page_size === 4321);
ok('重命名', (await app.renameBook(book.id, '改过名字的书')).title === '改过名字的书');

const jpg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3]).toString('base64');
await app.setBookCover(book.id, jpg);
ok('设置/读取封面', (await app.getBook(book.id)).hasCover && (await app.getBookCover(book.id)).length === 7);
await app.removeBookCover(book.id);
ok('移除封面', !(await app.getBook(book.id)).hasCover);
ok('导出单本', (await app.exportBook(book.id)).bytes.length > 0);
const pack = await app.exportLibrary();
ok('导出整库 zip', pack.length > 100 && pack[0] === 0x50 && pack[1] === 0x4b, pack.length + ' B');
ok('导入整库包', (await app.importLibrary(pack)).books >= 1);
ok('智能导入分诊', (await app.importSmart({ filename: '整库.openlib', bytes: pack })).kind === 'library');
ok('重建索引', !!(await app.reindex(true)));
await app.deleteBook(book.id);
ok('删除书籍', (await app.state()).books.length === 0);
ok('remove 递归', !(await storage.exists('/library/books/' + book.id)));

/* ---- v1.6.0：分节体目录合并（T1） + 升级时进度迁移 ---- */
const { splitChapters, cnNumber, describeChapterTitle } = await import(mod('core/chapters.mjs'));
const { migrateChapterAnchors, PARSER_VERSION } = await import(mod('core/books.mjs'));
ok('解析器版本升到 3（已导入书会自动重解析）', PARSER_VERSION === 3);
ok('中文数字章号', cnNumber('十一') === 11 && cnNumber('二十') === 20
  && cnNumber('一百零五') === 105 && cnNumber('四') === 4);
const d = describeChapterTitle('第559章 深爱与他，不期而遇（19');
ok('缺右括号的分节号也能解析',
  d.num === 559 && d.partNum === 19 && d.base === '深爱与他，不期而遇');
const novel = [
  '《分节小说》作者：测试', '', '简介一行。', '',
  '第1章 初遇（1）', '　' + '甲'.repeat(220), '',
  '第2章 初遇（2）', '　' + '乙'.repeat(220), '',
  '第3章 初遇（3）', '　' + '丙'.repeat(220), '',
  '第4章 别离（1）', '　' + '丁'.repeat(220), '',
  '第5章 别离 (2)', '　' + '戊'.repeat(220), '',
  '第6章 尾声（四）', '　' + '己'.repeat(220), '',
].join('\n');
const merged = splitChapters(novel);
ok('分节体合并成 3 章（不再逐节成章）', merged.length === 3,
  merged.map((c) => c.title).join(' | '));
ok('目录标题带真实章号范围',
  merged[0].title === '第1–3章 初遇' && merged[1].title === '第4–5章 别离');
ok('num / numEnd 供页码跳转', merged[0].num === 1 && merged[0].numEnd === 3);
ok('半角括号与中文数字分节都识别', merged[1].numEnd === 5
  && describeChapterTitle('第949章 我有一个条件（四）').partNum === 4);
ok('单节章保留原标题', merged[2].title === '第6章 尾声（四）');
ok('合并后首尾相接、不丢字', merged[0].locator.start === 0
  && merged[merged.length - 1].locator.end === novel.length
  && merged.every((c, i) => !i || merged[i - 1].locator.end === c.locator.start));
const nb = await app.importBook({ filename: '分节小说.txt', bytes: new TextEncoder().encode(novel) });
ok('导入路径也走新解析器', nb.chapters.length === 3, '章数=' + nb.chapters.length);
const all = await app.readChapter(nb.id, nb.chapters[0].id, 0, 6000);
ok('合并章一次读到全部分节正文',
  all.text.includes('甲') && all.text.includes('乙') && all.text.includes('丙') && all.done);
ok('默认阅读方式为连续滚动', (await app.getSettings()).read_mode === 'scroll');

const oldCh = [
  { id: 'a', index: 0, locator: { start: 0, end: 100 } },
  { id: 'b', index: 1, locator: { start: 100, end: 200 } },
  { id: 'c', index: 2, locator: { start: 200, end: 300 } },
];
const newCh = [
  { id: 'X', index: 0, locator: { start: 0, end: 200 } },
  { id: 'Y', index: 1, locator: { start: 200, end: 300 } },
];
const migrated = migrateChapterAnchors(oldCh, newCh, {
  progress: { chapter_id: 'b', percent: 0.5, locator: { kind: 'txt_offset', offset: 25 } },
  bookmarks: [{ id: 'bm', chapter_id: 'c', offset: 10 }],
});
ok('升级迁移进度到新 chapter_id',
  migrated.progress.chapter_id === 'X' && migrated.progress.locator.offset === 125);
ok('升级迁移书签', migrated.bookmarks[0].chapter_id === 'Y'
  && migrated.bookmarks[0].offset === 10);

/* 端到端：把已导入的书伪装成 v2 时代的结构，重新 init 应自动重解析且不丢进度 */
const metaPath = '/library/books/' + nb.id + '/meta.json';
const oldMeta = JSON.parse(new TextDecoder().decode(await storage.readFile(metaPath)));
oldMeta.parser_version = 2;
oldMeta.chapters = [
  { id: 'old-1', index: 0, title: '第1章 初遇（1）', locator: { kind: 'txt_offset', start: 0, end: 300 } },
  { id: 'old-2', index: 1, title: '第2章 初遇（2）', locator: { kind: 'txt_offset', start: 300, end: 600 } },
  { id: 'old-3', index: 2, title: '第3章 初遇（3）', locator: { kind: 'txt_offset', start: 600, end: 900 } },
];
oldMeta.progress = { chapter_id: 'old-2', percent: 0.4,
  locator: { kind: 'txt_offset', offset: 20 } };
await storage.writeFile(metaPath, new TextEncoder().encode(JSON.stringify(oldMeta)));
const app2 = new LibraryApp(storage, '/library', { name: '测试书库', forceMemory: true });
await app2.init();
const after = JSON.parse(new TextDecoder().decode(await storage.readFile(metaPath)));
ok('v2 旧书启动即自动重解析', after.parser_version === 3 && after.chapters.length === 3,
  'version=' + after.parser_version + ' 章数=' + after.chapters.length);
ok('重解析后进度仍指向有效 chapter_id',
  after.chapters.some((c) => c.id === after.progress.chapter_id),
  after.progress.chapter_id);
ok('重解析后进度偏移保留在正文内', after.progress.locator.offset > 0,
  'offset=' + after.progress.locator.offset);
await app.deleteBook(nb.id);

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) process.exit(1);
