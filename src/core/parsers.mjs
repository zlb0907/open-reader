// 同构文档解析层：零外部依赖，只使用 Web 标准 API。
// Node 22 与 Android WebView 均有 DecompressionStream / Blob / Response / TextDecoder，
// 因此这一层无需为不同平台改写。
// 可阅读：TXT/MD/HTML、EPUB、DOCX、PDF、RTF、ODT、FB2、MHTML、
// MOBI(PalmDOC + HUFF/CDIC)、AZW3(KF8)、旧版 DOC、ZIP 内嵌书，
// 以及由魔数嗅探兜底的各种纯文本格式。
import { uuid, extOf } from './util.mjs';
import { decodeText, splitChapters } from './chapters.mjs';
import { parsePdf } from './pdf.mjs';
import {
  parseRtf, parseOdt, parseFb2, parseMhtml, parseMobi, parseDoc, sniffText,
} from './formats.mjs';

const TD = (bytes, enc = 'utf-8') => new TextDecoder(enc).decode(bytes);

// ---------- ZIP（EPUB / DOCX / ODT / FB2 的容器） ----------
async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  const floor = Math.max(0, u8.length - 65557);
  for (let i = u8.length - 22; i >= floor; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 容器');
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let n = 0; n < total && p + 46 <= u8.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = TD(u8.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, compSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }

  async function bytes(name) {
    let key = name;
    if (!entries.has(key)) {
      // 有些生成器写入带 ./ 前缀的路径
      key = [...entries.keys()].find((k) => k.replace(/^\.\//, '') === name) || name;
    }
    const e = entries.get(key);
    if (!e) return null;
    if (e.localOff + 30 > u8.length || dv.getUint32(e.localOff, true) !== 0x04034b50) return null;
    const nameLen = dv.getUint16(e.localOff + 26, true);
    const extraLen = dv.getUint16(e.localOff + 28, true);
    const a = e.localOff + 30 + nameLen + extraLen;
    const raw = u8.subarray(a, a + e.compSize);
    if (e.method === 0) return raw;
    if (e.method === 8) return await inflateRaw(raw);
    throw new Error('不支持的 ZIP 压缩方式: ' + e.method);
  }
  const text = async (name) => { const b = await bytes(name); return b === null ? null : TD(b); };
  const names = () => [...entries.keys()];
  return { bytes, text, names };
}

// ---------- HTML / XML 文本提取 ----------
function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
    mdash: '—', ndash: '–', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X'
        ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m; } catch { return m; }
    }
    return named[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html) {
  let s = String(html || '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|nav|footer)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|td)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s.replace(/[\t\u00a0 ]+/g, ' ')
    .split('\n').map((x) => x.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function tagText(xml, tag) {
  const m = new RegExp(`<\\s*(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\s*/\\s*(?:\\w+:)?${tag}\\s*>`, 'i').exec(xml);
  return m ? htmlToText(m[1]) : '';
}

function attrOf(xml, tag, attr) {
  const re = new RegExp(`<\\s*${tag}\\b[^>]*>`, 'gi');
  let m;
  while ((m = re.exec(xml))) {
    const a = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i').exec(m[0]);
    if (a) return decodeEntities(a[1]);
  }
  return '';
}

// 供 formats.mjs 复用的公共工具（以参数传递，避免循环导入）
const CTX = { readZip, htmlToText, decodeEntities, tagText, attrOf, splitChapters, decodeText };

// ---------- EPUB ----------
async function parseEpub(bytes) {
  const zip = await readZip(bytes);
  const container = await zip.text('META-INF/container.xml');
  if (container === null) throw new Error('EPUB 缺少 META-INF/container.xml');
  const opfPath = /full-path\s*=\s*["']([^"']+)["']/i.exec(container)?.[1] || 'OEBPS/content.opf';
  const opf = await zip.text(opfPath);
  if (opf === null) throw new Error('EPUB 缺少 ' + opfPath);
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const manifest = new Map();
  for (const m of opf.matchAll(/<item\b[^>]*\/?>/gi)) {
    const tag = m[0];
    const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const type = /\bmedia-type\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] || '';
    if (id && href) manifest.set(id, { href, type });
  }
  const spine = [...opf.matchAll(/<itemref\b[^>]*\/?>/gi)]
    .map((m) => /\bidref\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1])
    .filter((id) => id && manifest.has(id));
  if (!spine.length) {
    for (const [id, v] of manifest) {
      if (/xhtml|html/i.test(v.type) || /\.x?html?$/i.test(v.href)) spine.push(id);
    }
  }

  const parts = [];
  let cursor = 0;
  const chapters = [];
  for (const id of spine) {
    const href = decodeURIComponent(manifest.get(id).href.split('#')[0]);
    const doc = await zip.text(base + href) || await zip.text(href);
    if (doc === null) continue;
    const body = htmlToText(doc);
    if (!body) continue;
    const heading = tagText(doc, 'h1') || tagText(doc, 'h2') || tagText(doc, 'title');
    const title = (heading || `第 ${chapters.length + 1} 节`).split('\n')[0].slice(0, 60);
    const prefix = chapters.length ? '\n\n' : '';
    // 章间空行归给上一章，保证 locator 首尾相接、不丢字也不重叠。
    if (chapters.length) chapters[chapters.length - 1].locator.end = cursor + prefix.length;
    const segment = title + '\n\n' + body + '\n';
    const start = cursor + prefix.length;
    chapters.push({ id: uuid(), index: chapters.length, title,
      locator: { kind: 'txt_offset', start, end: start + segment.length } });
    parts.push(prefix + segment);
    cursor += prefix.length + segment.length;
  }
  if (!chapters.length) throw new Error('EPUB 中未找到可阅读的正文');
  const text = parts.join('');
  chapters[chapters.length - 1].locator.end = text.length;
  return {
    text, chapters, encoding: 'epub/utf-8', parse_status: 'ok',
    title: tagText(opf, 'title') || '', author: tagText(opf, 'creator') || '',
  };
}

// ---------- DOCX ----------
async function parseDocx(bytes) {
  const zip = await readZip(bytes);
  const xml = await zip.text('word/document.xml');
  if (xml === null) throw new Error('DOCX 缺少 word/document.xml');
  const core = (await zip.text('docProps/core.xml')) || '';
  const blocks = [];
  for (const m of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const inner = m[1];
    let para = [...inner.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((x) => decodeEntities(x[1])).join('');
    para = para.replace(/[\t\u00a0 ]+/g, ' ').trim();
    if (!para) continue;
    const style = /<w:pStyle\s+w:val\s*=\s*["']([^"']+)["']/i.exec(inner)?.[1] || '';
    const isHeading = /heading|标题|title/i.test(style) || /<w:outlineLvl\b/.test(inner);
    blocks.push({ text: para, heading: isHeading });
  }
  if (!blocks.length) throw new Error('DOCX 中未找到文本段落');

  const parts = [];
  const marks = [];
  let cursor = 0;
  for (const b of blocks) {
    if (b.heading || (!marks.length && /^(第[零〇一二三四五六七八九十百千两0-9]{1,12}[章节回卷部篇集]|Chapter\s+\d+)/i.test(b.text))) {
      marks.push({ start: cursor, title: b.text.slice(0, 60) });
    }
    const seg = b.text + '\n\n';
    parts.push(seg);
    cursor += seg.length;
  }
  const text = parts.join('');
  const chapters = (marks.length ? marks : [{ start: 0, title: '全文' }]).map((m, i, arr) => ({
    id: uuid(), index: i, title: m.title,
    locator: { kind: 'txt_offset', start: m.start, end: i + 1 < arr.length ? arr[i + 1].start : text.length },
  }));
  if (!marks.length) chapters[0].locator.start = 0;
  return {
    text, chapters, encoding: 'docx/utf-8', parse_status: 'ok',
    title: tagText(core, 'title') || '', author: tagText(core, 'creator') || '',
  };
}

// ---------- ZIP 容器内的书（EPUB / FB2 / TXT 打包分发常见） ----------
async function parseZipBook(bytes) {
  const zip = await readZip(bytes);
  const names = zip.names();
  const mime = await zip.text('mimetype');
  if (mime && /epub/i.test(mime)) return await parseEpub(bytes);
  const fb2 = names.find((n) => /\.fb2$/i.test(n));
  if (fb2) return await parseFb2(await zip.bytes(fb2), CTX);
  const txt = names.find((n) => /\.(txt|md|text)$/i.test(n));
  if (txt) {
    const b = await zip.bytes(txt);
    const { text, encoding } = decodeText(b);
    return { text, chapters: splitChapters(text), encoding: encoding + '/zip',
      parse_status: 'ok', title: '', author: '' };
  }
  throw new Error('ZIP 里没有可阅读的 EPUB / FB2 / TXT 文件');
}

const UNSUPPORTED_HINT = {
  chm: 'CHM 暂不解析，原件已完整保留',
  djvu: 'DjVu 暂不解析，原件已完整保留',
  cbz: 'CBZ 是漫画压缩包，暂不解析，原件已完整保留',
  cbr: 'CBR 是漫画压缩包，暂不解析，原件已完整保留',
};

export const PLAIN_TEXT = ['txt', 'md', 'markdown', 'text', 'log', 'rst', 'tex', 'srt', 'csv',
  'json', 'yaml', 'yml', 'ini', 'conf', 'xml', 'nfo', 'me', '1st'];

// 纯文本的「原件」本身就是正文，按需 decodeText 即可还原派生文本，无需落盘第二份。
export function isPlainText(ext) {
  return PLAIN_TEXT.includes(String(ext || '').toLowerCase());
}

// ---------- 统一入口 ----------
export async function parseBook(filename, bytes) {
  const ext = extOf(filename);
  try {
    if (ext === 'epub') return await parseEpub(bytes);
    if (ext === 'docx') return await parseDocx(bytes);
    if (ext === 'pdf') return await parsePdf(bytes);
    if (ext === 'rtf') return await parseRtf(bytes, CTX);
    if (ext === 'odt' || ext === 'ott') return await parseOdt(bytes, CTX);
    if (ext === 'fb2') return await parseFb2(bytes, CTX);
    if (ext === 'mht' || ext === 'mhtml') return await parseMhtml(bytes, CTX);
    if (ext === 'mobi' || ext === 'prc' || ext === 'pdb' || ext === 'azw' || ext === 'azw3') {
      return await parseMobi(bytes, CTX);
    }
    if (ext === 'doc') return await parseDoc(bytes, CTX);
    if (ext === 'zip') return await parseZipBook(bytes);
    if (UNSUPPORTED_HINT[ext]) {
      return { text: '', chapters: [], encoding: null, parse_status: 'unsupported',
        title: '', author: '', error: UNSUPPORTED_HINT[ext] };
    }
    if (ext === 'html' || ext === 'htm' || ext === 'xhtml') {
      const { text: raw, encoding } = decodeText(bytes);
      const body = htmlToText(raw);
      return { text: body, chapters: splitChapters(body), encoding: encoding + '/html',
        parse_status: 'ok', title: tagText(raw, 'title') || '', author: '' };
    }
    if (PLAIN_TEXT.includes(ext)) {
      const { text, encoding } = decodeText(bytes);
      return { text, chapters: splitChapters(text), encoding, parse_status: 'ok', title: '', author: '' };
    }
    // 未知扩展名：先排除二进制魔数，再按纯文本兜底
    const sniffed = sniffText(bytes, CTX);
    if (sniffed) return sniffed;
  } catch (e) {
    return { text: '', chapters: [], encoding: null, parse_status: 'error',
      error: e?.message || String(e), title: '', author: '' };
  }
  return { text: '', chapters: [], encoding: null, parse_status: 'unsupported',
    title: '', author: '', error: '暂不解析该格式，原件已完整保留，可点「导出」取回' };
}

export const SUPPORTED_FORMATS = [
  'txt', 'md', 'markdown', 'text', 'log', 'rst', 'tex', 'srt', 'csv', 'json',
  'xml', 'nfo', 'epub', 'docx', 'doc', 'pdf', 'rtf', 'odt', 'ott', 'fb2',
  'html', 'htm', 'xhtml', 'mht', 'mhtml', 'mobi', 'prc', 'pdb', 'azw', 'azw3', 'zip',
];

export const FORMAT_LABEL = 'TXT / MD / EPUB / DOCX / DOC / PDF / RTF / ODT / FB2 / MHTML / MOBI / AZW3 / HTML / ZIP / 常见纯文本';
