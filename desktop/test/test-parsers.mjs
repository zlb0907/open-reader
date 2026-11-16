import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBook, readZip, htmlToText } from '../src/core/parsers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  PASS ', name, extra); }
  else { fail++; console.log('  FAIL ', name, extra); }
}
const bytes = (f) => new Uint8Array(fs.readFileSync(path.join(FIX, f)));

console.log('\n== 格式解析测试（EPUB / DOCX / HTML / ZIP） ==');

const zip = await readZip(bytes('sample.epub'));
ok('01 ZIP 中央目录可解析（deflate）', zip.names().includes('OEBPS/ch1.xhtml'), `${zip.names().length} 项`);
ok('02 ZIP stored 与 deflate 均可读', (await zip.text('mimetype')) === 'application/epub+zip');

const ep = await parseBook('sample.epub', bytes('sample.epub'));
ok('03 EPUB 解析成功', ep.parse_status === 'ok', ep.parse_status + (ep.error ? ' / ' + ep.error : ''));
ok('04 EPUB 按 spine 切成 2 章', ep.chapters.length === 2, JSON.stringify(ep.chapters.map((c) => c.title)));
ok('05 EPUB 标题与作者来自 OPF', ep.title === '测试之书' && ep.author === '测试作者', `${ep.title} / ${ep.author}`);
ok('06 EPUB 正文含两章关键词', ep.text.includes('青瓦纸鸢') && ep.text.includes('旧书摊'));
ok('07 EPUB 已剔除 style/script', !ep.text.includes('color:red'));
ok('08 EPUB 实体已还原', ep.text.includes('&') && ep.text.includes('实体要还原'));
ok('09 EPUB 章节区间首尾无缝覆盖', (() => {
  const cs = ep.chapters;
  if (cs[0].locator.start !== 0) return false;
  if (cs[cs.length - 1].locator.end !== ep.text.length) return false;
  return cs.every((c, i) => i === 0 || c.locator.start === cs[i - 1].locator.end);
})());

const dx = await parseBook('sample.docx', bytes('sample.docx'));
ok('10 DOCX 解析成功', dx.parse_status === 'ok', dx.parse_status + (dx.error ? ' / ' + dx.error : ''));
ok('11 DOCX 按 Heading 切成 2 章', dx.chapters.length === 2, JSON.stringify(dx.chapters.map((c) => c.title)));
ok('12 DOCX 多 run 拼接无损', dx.text.includes('这是 DOCX 正文，包含关键词 青瓦纸鸢。'));
ok('13 DOCX 元数据读取', dx.title === '文档测试' && dx.author === '文档作者', `${dx.title} / ${dx.author}`);
ok('14 DOCX 章节区间连续', dx.chapters[0].locator.start === 0 &&
  dx.chapters[dx.chapters.length - 1].locator.end === dx.text.length);

const html = new TextEncoder().encode('<html><head><title>网页标题</title></head><body><h1>第一章 开场</h1><p>山行笔记 &amp; 青瓦纸鸢</p></body></html>');
const hp = await parseBook('a.html', html);
ok('15 HTML 解析并自动分章', hp.parse_status === 'ok' && hp.chapters.length >= 1 && hp.text.includes('山行笔记 & 青瓦纸鸢'));
ok('16 htmlToText 去标签', htmlToText('<div>甲</div><script>bad()</script><p>乙</p>') === '甲\n乙');

const azw3 = await parseBook('x.azw3', new Uint8Array([0x42, 0x4f, 0x4f, 0x4b]));
ok('17 不支持格式优雅降级并保留提示', azw3.parse_status === 'unsupported' && !!azw3.error && azw3.text === '');

const broken = await parseBook('broken.epub', new Uint8Array([1, 2, 3]));
ok('18 损坏文件不抛异常', broken.parse_status === 'error' && !!broken.error, broken.error);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
