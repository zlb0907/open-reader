// 新增阅读格式的断言测试：真实样本 + 章节 locality + API 端到端。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBook, SUPPORTED_FORMATS } from '../src/core/parsers.mjs';
import { createNodeStorage } from '../src/core/storage.mjs';
import { LibraryApp } from '../src/core/api.mjs';
import { sha256Hex } from '../src/core/util.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const bytes = async (f) => new Uint8Array(await fs.readFile(path.join(FIX, f)));
let pass = 0, fail = 0;
const failures = [];
async function ok(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) {
    console.log('  FAIL  ' + name + ' -> ' + String(e?.message || e).split('\n')[0]);
    fail++; failures.push(name + ': ' + String(e?.message || e));
  }
}
const parse = async (f) => parseBook(f, await bytes(f));

// 章节 locator 必须首尾相接、覆盖全文，且分页拼接能无损还原
function covers(r) {
  assert.ok(r.chapters.length >= 1, '没有章节');
  assert.equal(r.chapters[0].locator.start, 0, '首章起点不是 0');
  assert.equal(r.chapters[r.chapters.length - 1].locator.end, r.text.length, '末章终点不是全文长度');
  for (let i = 1; i < r.chapters.length; i++) {
    assert.equal(r.chapters[i].locator.start, r.chapters[i - 1].locator.end, `第 ${i + 1} 章区间不连续`);
  }
  let joined = '';
  for (const c of r.chapters) joined += r.text.slice(c.locator.start, c.locator.end);
  assert.equal(joined, r.text, '按章拼接无法还原全文');
}

console.log('\n== PDF 文本抽取 ==');
await ok('01 中文 ToUnicode CMap 还原正文', async () => {
  const r = await parse('pdf_cmap.pdf');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('第一章 青瓦纸鸢'));
  assert.ok(r.text.includes('摊主说书不必都读完'));
  assert.ok(!r.text.includes('\ufffd'), '出现乱码替换符');
  covers(r);
});
await ok('02 PDF 按页分 2 章且标题含页码', async () => {
  const r = await parse('pdf_cmap.pdf');
  assert.equal(r.chapters.length, 2);
  assert.match(r.chapters[0].title, /第 1 页/);
  assert.match(r.chapters[1].title, /第 2 页/);
});
await ok('03 PDF /Info 元数据（UTF-16BE 字符串）', async () => {
  const r = await parse('pdf_cmap.pdf');
  assert.equal(r.title, '开放书库');
  assert.equal(r.author, '测试作者');
});
await ok('04 FlateDecode 压缩流', async () => {
  const r = await parse('pdf_flate.pdf');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('青瓦纸鸢'));
  assert.equal(r.title, '开放书库');
  covers(r);
});
await ok('05 ASCII85Decode + FlateDecode 双层滤镜', async () => {
  const r = await parse('pdf_a85.pdf');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('山行笔记里记着一处旧书摊'));
  assert.equal(r.title, '双层滤镜之书');
});
await ok('06 WinAnsi 简单字体 + TJ 位移空格', async () => {
  const r = await parse('pdf_winansi.pdf');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('Hello world, this is a WinAnsi PDF.'));
  assert.ok(r.text.includes('Chapter One: The old bookshop'));
  assert.equal(r.title, 'WinAnsi Book');
  covers(r);
});
await ok('07 FlateDecode + PNG Predictor', async () => {
  const r = await parse('pdf_predictor.pdf');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('青瓦纸鸢'));
});
await ok('08 LZWDecode', async () => {
  const r = await parse('pdf_lzw.pdf');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('LZW compressed text works.'));
});
await ok('09 PDF 1.5 对象流 ObjStm + xref stream', async () => {
  const r = await parse('pdf_objstm.pdf');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('青瓦纸鸢'));
  // 标题/作者只存在于对象流内部，读到即证明 ObjStm 已展开
  assert.equal(r.title, '对象流之书');
  assert.equal(r.author, '流式作者');
});
await ok('10 扫描版明确降级且不伪造正文', async () => {
  const r = await parse('pdf_scanned.pdf');
  assert.equal(r.parse_status, 'unsupported');
  assert.equal(r.text, '');
  assert.match(r.error, /文字层/);
});
await ok('11 加密 PDF 明确降级', async () => {
  const r = await parse('pdf_encrypted.pdf');
  assert.equal(r.parse_status, 'unsupported');
  assert.match(r.error, /加密/);
});
await ok('12 损坏 PDF 不抛异常', async () => {
  const r = await parseBook('broken.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]));
  assert.notEqual(r.parse_status, 'ok');
  assert.ok(r.error);
});

console.log('\n== 其余阅读格式 ==');
await ok('13 RTF：\\uN 与 GBK \\\'hh 双通道中文', async () => {
  const r = await parse('sample.rtf');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('山行笔记里记着一处旧书摊'));
  assert.ok(r.text.includes('摊主说书不必都读完'));
  assert.ok(r.text.includes('山行') && r.text.includes('旧书摊'), 'GBK 字节未还原');
  assert.ok(!r.text.includes('\ufffd'), '出现乱码替换符');
  covers(r);
});
await ok('14 RTF 自动分章', async () => {
  const r = await parse('sample.rtf');
  assert.equal(r.chapters.length, 2);
});
await ok('15 ODT：content.xml 分章 + meta.xml 元数据', async () => {
  const r = await parse('sample.odt');
  assert.equal(r.parse_status, 'ok');
  assert.equal(r.chapters.length, 2);
  assert.equal(r.title, 'ODT 测试之书');
  assert.equal(r.author, '文档作者');
  assert.ok(r.text.includes('& 实体要还原'));
  covers(r);
});
await ok('16 FB2：section/title 分章 + 作者', async () => {
  const r = await parse('sample.fb2');
  assert.equal(r.parse_status, 'ok');
  assert.equal(r.chapters.length, 2);
  assert.equal(r.title, 'FB2 测试之书');
  assert.equal(r.author, '测试 作者');
  assert.ok(r.text.includes('翻到哪页算哪页'));
  covers(r);
});
await ok('17 MHTML quoted-printable', async () => {
  const r = await parse('sample.mhtml');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('山行笔记里记着一处旧书摊'));
  assert.equal(r.chapters.length, 2);
  covers(r);
});
await ok('18 MHTML base64', async () => {
  const r = await parse('sample_b64.mhtml');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('摊主说书不必都读完'));
});
await ok('19 MOBI 未压缩 PalmDOC', async () => {
  const r = await parse('sample.mobi');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('青瓦纸鸢'));
  assert.equal(r.chapters.length, 2);
  covers(r);
});
await ok('20 MOBI PalmDOC LZ77 压缩', async () => {
  const r = await parse('sample_lz77.mobi');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('摊主说书不必都读完'));
  covers(r);
});
await ok('21 旧版 DOC：OLE + FIB piece table', async () => {
  const r = await parse('sample.doc');
  assert.equal(r.parse_status, 'ok');
  assert.ok(r.text.includes('第一章 青瓦纸鸢'));
  assert.ok(r.text.includes('摊主说书不必都读完'));
  assert.equal(r.chapters.length, 2);
  covers(r);
});
await ok('22 ZIP 内嵌 FB2', async () => {
  const r = await parse('fb2pack.zip');
  assert.equal(r.parse_status, 'ok');
  assert.equal(r.title, 'FB2 测试之书');
  assert.equal(r.chapters.length, 2);
  covers(r);
});
await ok('23 未知扩展名纯文本嗅探兜底', async () => {
  const r = await parse('sample.unknown');
  assert.equal(r.parse_status, 'ok');
  assert.match(r.encoding, /sniff/);
  assert.ok(r.text.includes('应该被嗅探兜底接住'));
  assert.equal(r.chapters.length, 2);
  covers(r);
});
await ok('24 AZW3 明确降级并保留原件提示', async () => {
  const r = await parse('sample.azw3');
  assert.equal(r.parse_status, 'unsupported');
  assert.match(r.error, /AZW3|KF8/);
  assert.match(r.error, /原件/);
});
await ok('25 支持格式清单已覆盖新增格式', async () => {
  for (const ext of ['pdf', 'rtf', 'odt', 'fb2', 'mhtml', 'mobi', 'doc', 'zip']) {
    assert.ok(SUPPORTED_FORMATS.includes(ext), '缺少 ' + ext);
  }
});

console.log('\n== API 端到端（导入 / 阅读 / 检索 / 导出原件） ==');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'open-reader-formats-'));
const app = new LibraryApp(createNodeStorage(), path.join(tmp, 'library'), { name: '格式测试库' });
await app.init();
await ok('26 PDF 经 API 导入后能分页阅读', async () => {
  const raw = await bytes('pdf_cmap.pdf');
  const b = await app.importBook({ filename: '中文测试.pdf', bytes: raw });
  assert.equal(b.parse_status, 'ok');
  assert.equal(b.format, 'pdf');
  assert.equal(b.chapterCount, 2);
  let all = '';
  for (const ch of b.chapters) {
    let off = 0, guard = 0;
    while (guard++ < 20) {
      const page = await app.readChapter(b.id, ch.id, off, 9);
      all += page.text;
      if (page.done) break;
      off = page.nextOffset;
    }
  }
  assert.ok(all.includes('第一章 青瓦纸鸢'), '第一章正文未读到');
  assert.ok(all.includes('摊主说书不必都读完'), '第二章正文未读到');
});
await ok('27 全文检索能命中 PDF 正文', async () => {
  const r = await app.search('青瓦纸鸢');
  assert.ok(r.results.length >= 1, '检索无结果');
});
await ok('28 导出原件与导入字节完全一致（原件不改写）', async () => {
  const raw = await bytes('pdf_flate.pdf');
  const b = await app.importBook({ filename: '压缩测试.pdf', bytes: raw });
  const out = await app.exportBook(b.id);
  assert.equal(out.filename, '压缩测试.pdf');
  assert.equal(await sha256Hex(raw), await sha256Hex(out.bytes));
});
await ok('29 不支持格式导入后仍保留原件且可导出', async () => {
  const raw = await bytes('sample.azw3');
  const b = await app.importBook({ filename: '保留测试.azw3', bytes: raw });
  assert.equal(b.parse_status, 'unsupported');
  const out = await app.exportBook(b.id);
  assert.equal(await sha256Hex(raw), await sha256Hex(out.bytes));
});
await ok('30 扫描版 JPEG：按原页图片浏览而非空降级', async () => {
  const raw = await bytes('pdf_scanned_jpeg.pdf');
  const r = await parse('pdf_scanned_jpeg.pdf');
  assert.equal(r.parse_status, 'ok');
  assert.equal(r.chapters.length, 2);
  assert.match(r.notice, /无文字层/);
  for (const ch of r.chapters) {
    assert.equal(ch.image.kind, 'pdf_image');
    assert.equal(ch.image.mime, 'image/jpeg');
    const seg = raw.subarray(ch.image.offset, ch.image.offset + ch.image.length);
    assert.equal(seg[0], 0xff); assert.equal(seg[1], 0xd8, '不是有效 JPEG');
    assert.equal(seg[seg.length - 2], 0xff); assert.equal(seg[seg.length - 1], 0xd9);
  }
  covers(r);
});
await ok('31 原 PDF 无文字层且图片不可显示时明确降级', async () => {
  const r = await parse('pdf_scanned.pdf');
  assert.equal(r.parse_status, 'unsupported');
  assert.match(r.error, /文字层/);
});
await ok('32 图片页经 API 切片返回有效 JPEG', async () => {
  const b = await app.importBook({ filename: '扫描图册.pdf', bytes: await bytes('pdf_scanned_jpeg.pdf') });
  assert.equal(b.parse_status, 'ok');
  assert.equal(b.chapterCount, 2);
  assert.ok(b.chapters[0].image, '章节未带图片索引');
  const out = await app.getPageImage(b.id, b.chapters[0].id);
  assert.equal(out.mime, 'image/jpeg');
  assert.equal(out.bytes[0], 0xff); assert.equal(out.bytes[1], 0xd8);
  const read = await app.readChapter(b.id, b.chapters[0].id, 0, 6000);
  assert.ok(read.chapter.image, 'readChapter 未透传图片索引');
  assert.match(read.notice, /扫描版/);
});
app.close();

console.log('\n== 旧书库升级迁移（v1.0 导入的书无需重新导入） ==');
await ok('33 旧 meta 在重启后自动重解析并恢复章节', async () => {
  const legacyRoot = path.join(tmp, 'legacy');
  const a1 = new LibraryApp(createNodeStorage(), legacyRoot, { name: '旧书库' });
  await a1.init();
  const b = await a1.importBook({ filename: '旧版导入.pdf', bytes: await bytes('pdf_cmap.pdf') });
  const dir = path.join(legacyRoot, 'books', b.id);
  const metaPath = path.join(dir, 'meta.json');
  const m = JSON.parse(await fs.readFile(metaPath, 'utf8'));
  // 伪造 v1.0 的状态：不支持、无章节、无解析版本、派生文本为空
  delete m.parser_version;
  m.parse_status = 'unsupported';
  m.parse_error = '暂不解析该格式，原件已完整保留';
  m.chapters = [];
  m.progress = { chapter_id: null, percent: 0, locator: { kind: 'txt_offset', offset: 0 }, updated_at: m.updated_at };
  await fs.writeFile(metaPath, JSON.stringify(m, null, 2));
  await fs.mkdir(path.join(dir, 'derived'), { recursive: true });
  await fs.writeFile(path.join(dir, 'derived', 'text.txt'), '');
  a1.close();

  const a2 = new LibraryApp(createNodeStorage(), legacyRoot, { name: '旧书库' });
  await a2.init();                       // 模拟升级后重启
  const fresh = await a2.getBook(b.id);
  assert.equal(fresh.parse_status, 'ok', '迁移后仍标为不支持');
  assert.equal(fresh.chapterCount, 2);
  assert.equal(fresh.parse_error, null);
  const read = await a2.readChapter(b.id, fresh.chapters[0].id, 0, 4000);
  assert.ok(read.text.includes('青瓦纸鸢'), '迁移后正文仍读不到');
  const out = await a2.exportBook(b.id);
  assert.equal(await sha256Hex(out.bytes), await sha256Hex(await bytes('pdf_cmap.pdf')));
  a2.close();
});

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (failures.length) console.log('失败项:\n  - ' + failures.join('\n  - '));
if (fail) process.exit(1);
