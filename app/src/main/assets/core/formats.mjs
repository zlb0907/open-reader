// 更多阅读格式的零依赖解析层（同构 Web 标准）。
// 覆盖 RTF / ODT / FB2 / MHTML / MOBI(PalmDOC + HUFF/CDIC) / AZW3(KF8) /
// 旧版 DOC(OLE) + 纯文本嗅探兜底。
// 所有函数通过 ctx 复用 parsers.mjs 的公共工具，避免循环导入。
import { uuid } from './util.mjs';
import { createHuffCdic, trimTrailingEntries } from './huffcdic.mjs';

const TD = (b, enc = 'utf-8') => new TextDecoder(enc).decode(b);
const latin1 = (b) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + 0x8000, b.length)));
  }
  return s;
};

// 统一的「块 -> 正文 + 章节」构造，保证 locator 首尾相接、不丢字。
export function buildFromBlocks(blocks) {
  const parts = [], marks = [];
  let cursor = 0;
  for (const b of blocks) {
    if (b.heading) marks.push({ start: cursor, title: (b.text || '').slice(0, 60) });
    const seg = b.text + '\n\n';
    parts.push(seg);
    cursor += seg.length;
  }
  const text = parts.join('');
  if (!text.trim()) return { text: '', chapters: [] };
  const ms = marks.length ? marks : [{ start: 0, title: '全文' }];
  if (ms[0].start > 0) ms[0] = { ...ms[0], start: 0 }; // 短前言并入第一章
  const chapters = ms.map((m, i) => ({
    id: uuid(), index: i, title: m.title || '全文',
    locator: { kind: 'txt_offset', start: m.start,
      end: i + 1 < ms.length ? ms[i + 1].start : text.length },
  }));
  return { text, chapters };
}

function clean(s) {
  return String(s || '').replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function decodeByCharset(bytes, charset, ctx) {
  const c = String(charset || '').toLowerCase().replace(/["'\s]/g, '');
  const table = { 'gb2312': 'gb18030', 'gbk': 'gb18030', 'gb18030': 'gb18030',
    'big5': 'big5', 'utf-8': 'utf-8', 'utf8': 'utf-8', 'utf-16': 'utf-16le',
    'utf-16le': 'utf-16le', 'windows-1252': 'windows-1252', 'iso-8859-1': 'windows-1252',
    'cp1252': 'windows-1252' };
  try {
    if (table[c]) return TD(bytes, table[c]);
  } catch { /* 落到通用编码检测 */ }
  return ctx.decodeText(bytes).text;
}

// ---------- RTF ----------
const RTF_SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header',
  'footer', 'footnote', 'annotation', 'generator', 'listtable', 'listoverridetable',
  'revtbl', 'rsidtbl', 'xmlnstbl', 'themedata', 'datastore', 'object', 'fldinst', 'filetbl']);

export function parseRtf(bytes, ctx) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const s = latin1(u8);
  if (!/^\{\s*\\rtf/i.test(s)) throw new Error('不是有效的 RTF 文档');
  const cpg = /\\ansicpg(\d+)/i.exec(s)?.[1] || '1252';
  const codepage = ({ '936': 'gb18030', '950': 'big5', '65001': 'utf-8', '1252': 'windows-1252' })[cpg] || 'windows-1252';
  let ucSkip = 1;
  const stack = [];
  const blocks = [];
  let cur = '';
  const pushBlock = () => { if (cur.trim()) blocks.push({ text: clean(cur), heading: false }); cur = ''; };

  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const skip = stack.some((g) => g.skip);
    if (ch === '{') { stack.push({ skip, ignorable: false }); i++; continue; }
    if (ch === '}') { stack.pop(); i++; continue; }
    if (ch === '\\') {
      i++;
      if (i >= s.length) break;
      const nc = s[i];
      if (nc === '{' || nc === '}' || nc === '\\') { if (!skip) cur += nc; i++; continue; }
      if (nc === '\n' || nc === '\r') { i++; if (nc === '\r' && s[i] === '\n') i++; continue; }
      if (nc === '*') { if (stack.length) stack[stack.length - 1].skip = true; i++; continue; }
      if (nc === "'") {
        // 连续的 \'hh 组成一个多字节字符（中文 GBK 常见）；
        // 首个字节的 \ 已被消费，后续字节仍带 \ 前缀，两种形态都要吃。
        const buf = [];
        while (i < s.length) {
          if (s[i] === "'" && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
            buf.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 3;
          } else if (s[i] === '\\' && s[i + 1] === "'" && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 2, i + 4))) {
            buf.push(parseInt(s.slice(i + 2, i + 4), 16)); i += 4;
          } else break;
        }
        if (!skip && buf.length) cur += TD(new Uint8Array(buf), codepage);
        continue;
      }
      const m = /^([a-zA-Z]{1,32})(-?\d+)? ?/.exec(s.slice(i));
      if (!m) { i++; continue; }
      const word = m[1], param = m[2] === undefined ? null : Number(m[2]);
      i += m[0].length;
      if (RTF_SKIP.has(word)) { if (stack.length) stack[stack.length - 1].skip = true; continue; }
      if (word === 'uc') { ucSkip = Math.max(0, param ?? 1); continue; }
      if (word === 'u') {
        let cp = param ?? 0;
        if (cp < 0) cp += 65536;
        if (!skip) cur += String.fromCharCode(cp);
        // \uN 之后的 ucSkip 个回退字符（通常是 '?'）
        for (let k = 0; k < ucSkip && i < s.length; k++) {
          if (s[i] === '\\' && s[i + 1] === "'" && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 2, i + 4))) i += 4;
          else i++;
        }
        continue;
      }
      if (word === 'par' || word === 'line') { pushBlock(); continue; }
      if (word === 'tab') { if (!skip) cur += '\t'; continue; }
      if (word === 'enspace' || word === 'emspace') { if (!skip) cur += ' '; continue; }
      // \b \i \fs \f \cf \ansicpg 等格式控制字一律忽略
      continue;
    }
    if (!skip && ch !== '\r' && ch !== '\n') cur += ch;
    i++;
  }
  pushBlock();
  if (!blocks.length) throw new Error('RTF 中未找到可阅读的文字');
  const { text } = buildFromBlocks(blocks);
  return { text, chapters: ctx.splitChapters(text),
    encoding: 'rtf/' + codepage, parse_status: 'ok', title: '', author: '' };
}

// ---------- ODT（ZIP + content.xml） ----------
export async function parseOdt(bytes, ctx) {
  const zip = await ctx.readZip(bytes);
  const content = await zip.text('content.xml');
  if (content === null) throw new Error('ODT 缺少 content.xml');
  const meta = (await zip.text('meta.xml')) || '';
  // 逐段抽取，标题段落自动生成章节
  const blocks = [];
  for (const m of content.matchAll(/<text:h\b[^>]*>([\s\S]*?)<\/text:h>|<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)) {
    const isH = m[0].startsWith('<text:h');
    const t = ctx.htmlToText(m[1] ?? m[2] ?? '');
    if (!t) continue;
    blocks.push({ text: t, heading: isH });
  }
  if (!blocks.length) {
    const t = ctx.htmlToText(content.replace(/<\?xml[^>]*\?>/gi, '')
      .replace(/<office:body\b[^>]*>|<\/office:body>/gi, '\n'));
    if (t) blocks.push({ text: t, heading: false });
  }
  if (!blocks.length) throw new Error('ODT 中未找到可阅读的文字');
  const { text, chapters } = buildFromBlocks(blocks);
  return { text, chapters, encoding: 'odt/utf-8', parse_status: 'ok',
    title: ctx.tagText(meta, 'title') || '', author: ctx.tagText(meta, 'creator') || '' };
}

// ---------- FB2（FictionBook XML） ----------
export async function parseFb2(bytes, ctx) {
  const xml = typeof bytes === 'string' ? bytes : ctx.decodeText(bytes).text;
  const desc = /<description\b[^>]*>([\s\S]*?)<\/description>/i.exec(xml)?.[1] || '';
  const title = ctx.tagText(desc, 'book-title');
  const author = [ctx.tagText(desc, 'first-name'), ctx.tagText(desc, 'last-name')]
    .filter(Boolean).join(' ');
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(xml)?.[1]
    || /<body\b[^>]*>([\s\S]*)/i.exec(xml)?.[1] || '';
  const blocks = [];
  for (const m of body.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>|<p\b[^>]*>([\s\S]*?)<\/p>|<empty-line\s*\/?>/gi)) {
    if (!m[1] && !m[2]) { blocks.push({ text: '', heading: false }); continue; }
    const t = ctx.htmlToText(m[1] ?? m[2] ?? '');
    if (!t) continue;
    blocks.push({ text: t, heading: !!m[1] });
  }
  if (!blocks.length) {
    const t = ctx.htmlToText(body);
    if (t) blocks.push({ text: t, heading: false });
  }
  if (!blocks.length) throw new Error('FB2 中未找到正文');
  // 空行块不参与拼接，避免空章节
  const solid = blocks.filter((b) => b.text);
  const { text, chapters } = buildFromBlocks(solid);
  return { text, chapters, encoding: 'fb2/xml', parse_status: 'ok', title, author };
}

// ---------- MHTML / MHT ----------
function b64decode(s) {
  const clean = s.replace(/\s/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function qpDecode(s) {
  const out = [];
  const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9a-fA-F]{2}$/.test(t.slice(i + 1, i + 3))) {
      out.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2;
    } else {
      const c = t.charCodeAt(i);
      if (c < 128) out.push(c);
      else out.push(...new TextEncoder().encode(t[i]));
    }
  }
  return new Uint8Array(out);
}

export async function parseMhtml(bytes, ctx) {
  const raw = ctx.decodeText(bytes).text;
  const cut = /\r?\n\r?\n/.exec(raw);
  const headers = cut ? raw.slice(0, cut.index) : raw;
  const body = cut ? raw.slice(cut.index + cut[0].length) : '';
  const boundary = /boundary\s*=\s*"?([^";\r\n]+)"?/i.exec(headers)?.[1];
  if (!boundary) {
    // 单部分 MHTML
    const html = ctx.htmlToText(raw);
    return { text: html, chapters: ctx.splitChapters(html), encoding: 'mhtml',
      parse_status: 'ok', title: '', author: '' };
  }
  const re = new RegExp('--' + boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  const pieces = body.split(re);
  let best = null;
  for (const piece of pieces) {
    const p = piece.replace(/^\s*\r?\n/, '');
    const hm = /\r?\n\r?\n/.exec(p);
    if (!hm) continue;
    const ph = p.slice(0, hm.index);
    const pb = p.slice(hm.index + hm[0].length);
    const ct = /content-type\s*:\s*([^;\r\n]+)(?:[^\r\n]*charset\s*=\s*"?([^"\r\n;]+)"?)?/i.exec(ph);
    const type = (ct?.[1] || '').toLowerCase().trim();
    if (type && type !== 'text/html' && type !== 'text/plain') continue;
    const enc = /content-transfer-encoding\s*:\s*(\S+)/i.exec(ph)?.[1]?.toLowerCase() || '';
    const charset = /charset\s*=\s*"?([^"\r\n;]+)"?/i.exec(ph)?.[1] || 'utf-8';
    const data = enc === 'base64' ? b64decode(pb.replace(/--\s*$/, ''))
      : enc === 'quoted-printable' ? qpDecode(pb) : new TextEncoder().encode(pb);
    const html = decodeByCharset(data, charset, ctx);
    const candidate = { html, type };
    if (type === 'text/html') { best = candidate; break; }
    if (!best) best = candidate;
  }
  if (!best) throw new Error('MHTML 中未找到 HTML 或文本部分');
  const text = ctx.htmlToText(best.html);
  const title = /subject\s*:\s*(.+)/i.exec(headers)?.[1]?.trim() || ctx.tagText(best.html, 'title') || '';
  return { text, chapters: ctx.splitChapters(text), encoding: 'mhtml',
    parse_status: 'ok', title, author: '' };
}

// ---------- MOBI / PRC / PDB（PalmDOC） ----------
function palmDocDecompress(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const c = data[i++];
    if (c >= 0xc0) { out.push(32, c ^ 0x80); }
    else if (c >= 0x80) {
      if (i >= data.length) break;
      const pair = (c << 8) | data[i++];
      const dist = (pair >> 3) & 0x7ff;
      const n = (pair & 7) + 3;
      for (let k = 0; k < n; k++) {
        const v = out[out.length - dist];
        out.push(v === undefined ? 32 : v);
      }
    } else if (c >= 0x09) out.push(c);
    else if (c >= 0x01) { for (let k = 0; k < c && i < data.length; k++) out.push(data[i++]); }
    else if (i < data.length) out.push(data[i++]);
  }
  return new Uint8Array(out);
}

// KF8 / AZW3 的正文是一整份 XHTML，标题藏在 <h1>/<h2> 里。
// 直接 htmlToText 会把 1244 个诗人名 / 诗名冲掉，目录退化成「全文」1 章；
// 这里按标题切成 block，交给 buildFromBlocks 构造首尾相接的章节 locator。
function kf8Blocks(html, ctx) {
  const re = /<(h1|h2)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  const blocks = [];
  let last = 0, m;
  while ((m = re.exec(html))) {
    const pre = ctx.htmlToText(html.slice(last, m.index));
    if (pre) blocks.push({ heading: false, text: pre });
    const title = ctx.htmlToText(m[2]).replace(/\n+/g, ' ').trim().slice(0, 60);
    if (title) blocks.push({ heading: true, text: title });
    last = m.index + m[0].length;
  }
  const tail = ctx.htmlToText(html.slice(last));
  if (tail) blocks.push({ heading: false, text: tail });
  return blocks.some((b) => b.heading) ? blocks : null;
}

export async function parseMobi(bytes, ctx) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const type = latin1(u8.subarray(60, 64));
  const creator = latin1(u8.subarray(64, 68));
  if (u8.length < 80 || (type !== 'BOOK' && creator !== 'MOBI')) {
    throw new Error('不是有效的 MOBI/PDB 容器');
  }
  // PDB 头是大端字节序（与 Palm 设备一致）
  const numRecords = dv.getUint16(76, false);
  if (!numRecords || 78 + numRecords * 8 > u8.length) throw new Error('MOBI 记录表损坏');
  const offsets = [];
  for (let i = 0; i < numRecords; i++) offsets.push(dv.getUint32(78 + i * 8, false));
  const rec = (i) => {
    const a = offsets[i];
    const b = i + 1 < numRecords ? offsets[i + 1] : u8.length;
    if (a === undefined || b > u8.length || b < a) throw new Error('MOBI 记录偏移越界');
    return u8.subarray(a, b);
  };
  const r0 = rec(0);
  if (r0.length < 16) throw new Error('MOBI 缺少 PalmDOC 头');
  const dv0 = new DataView(r0.buffer, r0.byteOffset, r0.byteLength);
  const compression = dv0.getUint16(0, false);
  const textLength = dv0.getUint32(4, false);
  const textRecords = dv0.getUint16(8, false);
  const huff = compression === 17480;
  if (!huff && compression !== 1 && compression !== 2) {
    return { text: '', chapters: [], encoding: null, parse_status: 'unsupported', title: '', author: '',
      error: `不支持的 MOBI 压缩方式 ${compression}，原件已完整保留` };
  }
  // MOBI 头里的文本编码（65001=UTF-8 / 1252=cp1252）
  let charset = 'utf-8';
  const mobiMagic = latin1(r0.subarray(16, 20));
  if (mobiMagic === 'MOBI' && r0.length >= 24 + 32) {
    const enc = dv0.getUint32(16 + 28, false);
    if (enc === 1252) charset = 'windows-1252';
  }
  // EXTH 中的书名 / 作者（类型 503 / 100）。
  // 部分 Calibre 生成的 AZW3 没置 EXTH 标志位但记录确实在，直接找魔数最稳。
  let title = '', author = '';
  let exthOff = -1;
  for (let i = 16; i + 12 <= r0.length; i++) {
    if (r0[i] === 0x45 && r0[i + 1] === 0x58 && r0[i + 2] === 0x54 && r0[i + 3] === 0x48) {
      exthOff = i; break;
    }
  }
  if (exthOff >= 0) {
    const count = Math.min(dv0.getUint32(exthOff + 8, false), 10000);
    let p = exthOff + 12;
    for (let i = 0; i < count && p + 8 <= r0.length; i++) {
      const t = dv0.getUint32(p, false), len = dv0.getUint32(p + 4, false);
      if (len < 8 || p + len > r0.length) break;
      const val = decodeByCharset(r0.subarray(p + 8, p + len), charset, ctx);
      if (t === 503 && !title) title = val.slice(0, 120);
      if (t === 100 && !author) author = val.slice(0, 120);
      p += len;
    }
  }
  // HUFF/CDIC：字典是书里自带的 PDB 记录，不随程序分发；每本 separately 装载。
  let huffReader = null, extraFlags = 0;
  if (huff) {
    try {
      const huffOffset = r0.length >= 0x78 ? dv0.getUint32(0x70, false) : 0;
      const huffNumber = r0.length >= 0x78 ? dv0.getUint32(0x74, false) : 0;
      extraFlags = r0.length >= 0xF4 ? dv0.getUint16(0xF2, false) : 0;
      if (huffOffset + huffNumber > numRecords) throw new Error('字典记录越界');
      huffReader = createHuffCdic(rec, huffOffset, huffNumber);
    } catch (e) {
      return { text: '', chapters: [], encoding: null, parse_status: 'unsupported', title, author,
        error: 'HUFF/CDIC 字典无法读取（加密或结构特殊的书）：' + ((e && e.message) || String(e))
          + '，原件已完整保留' };
    }
  }
  const chunks = [];
  for (let i = 1; i <= Math.min(textRecords, numRecords - 1); i++) {
    const r = rec(i);
    if (huffReader) chunks.push(huffReader.unpack(trimTrailingEntries(r, extraFlags)));
    else chunks.push(compression === 2 ? palmDocDecompress(r) : r);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const buf = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { buf.set(c, at); at += c.length; }
  const data = textLength > 0 && textLength <= buf.length ? buf.subarray(0, textLength) : buf;
  let html = decodeByCharset(data, charset, ctx);
  // KF8 / AZW3 的特征：正文里没有可读 HTML 但存在大量二进制骨架
  if (/<html|<body|<p\b|<h[1-6]\b|<mbp:/i.test(html) === false && /[\u0000-\u0008]{20,}/.test(html)) {
    return { text: '', chapters: [], encoding: null, parse_status: 'unsupported', title, author,
      error: 'AZW3/KF8 结构暂不解析，原件已完整保留，可点「导出」取回' };
  }
  // KF8：按 XHTML 里的 h1/h2 恢复目录（实测唐诗鉴赏辞典有 189 个 h1 + 1055 个 h2）。
  // 必须在下面的 </h1> → 换行替换之前做，否则标题标签已被改写。
  if (huffReader) {
    const blocks = kf8Blocks(html, ctx);
    if (blocks) {
      const built = buildFromBlocks(blocks);
      if (built.text.trim()) {
        return { text: built.text, chapters: built.chapters, encoding: 'azw3/' + charset,
          parse_status: 'ok', title, author };
      }
    }
  }
  html = html.replace(/<mbp:pagebreak\s*\/?>/gi, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(?:p|div|h[1-6]|li)\s*>/gi, '\n');
  const text = clean(ctx.htmlToText(html));
  if (!text) throw new Error('MOBI 中未找到可阅读的文字');
  return { text, chapters: ctx.splitChapters(text), encoding: 'mobi/' + charset,
    parse_status: 'ok', title, author };
}

// ---------- 旧版 DOC（OLE 复合文档 + FIB piece table） ----------
function utf16le(b) {
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8));
  return s;
}

function parseOle(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (u8.length < 512 || sig.some((v, i) => u8[i] !== v)) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const ss = 1 << dv.getUint16(30, true);       // 通常 512
  const mss = 1 << dv.getUint16(32, true);      // 通常 64
  const numFat = dv.getUint32(44, true);
  const firstDir = dv.getUint32(48, true);
  const cutoff = dv.getUint32(56, true) || 4096;
  const firstMiniFat = dv.getUint32(60, true);
  const numMiniFat = dv.getUint32(64, true);
  const secOff = (sid) => 512 + sid * ss;
  if (ss !== 512) return null;

  const fatSectors = [];
  for (let i = 0; i < Math.min(109, numFat); i++) {
    const sid = dv.getUint32(76 + i * 4, true);
    if (sid < 0xfffffffa) fatSectors.push(sid);
  }
  const fat = [];
  for (const sid of fatSectors) {
    const o = secOff(sid);
    if (o + ss > u8.length) break;
    for (let k = 0; k < ss / 4; k++) fat.push(dv.getUint32(o + k * 4, true));
  }
  if (!fat.length) return null;
  const chain = (start, table = fat, limit = 20000) => {
    const out = [];
    let sid = start, guard = 0;
    while (sid < 0xfffffffa && guard++ < limit && table[sid] !== undefined) {
      out.push(sid);
      const nx = table[sid];
      if (nx === sid || nx >= 0xfffffffa) break;
      sid = nx;
    }
    return out;
  };
  const readChain = (start, size, table = fat, sectorSize = ss, offsetFn = secOff) => {
    const ids = chain(start, table);
    const out = new Uint8Array(Math.min(size || ids.length * sectorSize, ids.length * sectorSize));
    let p = 0;
    for (const sid of ids) {
      const o = offsetFn(sid);
      if (o + sectorSize > u8.length) break;
      const len = Math.min(sectorSize, out.length - p);
      if (len <= 0) break;
      out.set(u8.subarray(o, o + len), p);
      p += len;
    }
    return out.subarray(0, p);
  };

  const dirBytes = readChain(firstDir, 0);
  const entries = [];
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const dvE = new DataView(dirBytes.buffer, dirBytes.byteOffset + o, 128);
    const nameLen = dvE.getUint16(64, true);
    const type = dirBytes[o + 66];
    const name = nameLen >= 2 ? utf16le(dirBytes.subarray(o, o + Math.min(64, nameLen - 2))) : '';
    entries.push({ name, type, start: dvE.getUint32(116, true), size: Number(dvE.getBigUint64(120, true)) });
  }
  const root = entries.find((e) => e.type === 5) || entries[0];
  const miniFat = [];
  if (numMiniFat && firstMiniFat < 0xfffffffa) {
    for (const sid of chain(firstMiniFat)) {
      const o = secOff(sid);
      if (o + ss > u8.length) break;
      for (let k = 0; k < ss / 4; k++) miniFat.push(dv.getUint32(o + k * 4, true));
    }
  }
  const miniStream = root && root.size ? readChain(root.start, root.size) : new Uint8Array(0);
  const streamOf = (e) => {
    if (!e) return null;
    if (e.size >= cutoff || !miniFat.length) return readChain(e.start, e.size);
    const ids = chain(e.start, miniFat);
    const out = new Uint8Array(Math.min(e.size, ids.length * mss));
    let p = 0;
    for (const sid of ids) {
      const len = Math.min(mss, out.length - p);
      if (len <= 0) break;
      out.set(miniStream.subarray(sid * mss, sid * mss + len), p);
      p += len;
    }
    return out.subarray(0, p);
  };
  return { entries, streamOf };
}

function docTextFromWordStream(data, ctx) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 0x1aa || dv.getUint16(0, true) !== 0xa5ec) return null;
  const fcClx = dv.getUint32(0x1a2, true);
  const lcbClx = dv.getUint32(0x1a6, true);
  const clxEnd = Math.min(data.length, fcClx + lcbClx);
  if (lcbClx > 8 && clxEnd > fcClx + 8) {
    let p = fcClx;
    // Clx 可能先带一个 Prc（clxt=0x01）：0x01 + cbGrpprl(2) + GrpPrl
    if (data[p] === 0x01) { p += 3 + dv.getUint16(p + 1, true); }
    if (data[p] === 0x02 && p + 5 <= clxEnd) {
      const lcb = dv.getUint32(p + 1, true);   // PlcPcd 长度（不含 clxt 与本字段）
      const plc = p + 5;
      const n = (lcb - 4) / 12;
      if (Number.isInteger(n) && n >= 1 && n < 10000 && plc + lcb <= clxEnd) {
        const cps = [];
        for (let i = 0; i <= n; i++) cps.push(dv.getUint32(plc + i * 4, true));
        const base = plc + (n + 1) * 4;
        let out = '';
        let valid = true;
        for (let i = 0; i < n; i++) {
          const fc = dv.getUint32(base + i * 8 + 2, true);
          const compressed = (fc & 0x40000000) !== 0;
          const off = compressed ? (fc & 0x3fffffff) / 2 : (fc & 0x3fffffff);
          const len = Math.max(0, cps[i + 1] - cps[i]);
          if (off + len * (compressed ? 1 : 2) > data.length) { valid = false; break; }
          out += compressed
            ? decodeByCharset(data.subarray(off, off + len), 'windows-1252', ctx)
            : utf16le(data.subarray(off, off + len * 2));
        }
        if (valid && out.trim()) return out;
      }
    }
  }
  // 兜底：扫描长串 UTF-16LE 可读字符（部分老 DOC 的 piece table 变体）
  const runs = [];
  let cur = '';
  for (let i = 0; i + 1 < data.length; i += 2) {
    const c = data[i] | (data[i + 1] << 8);
    const printable = (c >= 0x20 && c <= 0x7e) || (c >= 0x4e00 && c <= 0x9fff)
      || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef)
      || c === 0x0d || c === 0x0a || c === 0x09;
    if (printable) cur += String.fromCharCode(c);
    else { if (cur.length >= 8) runs.push(cur); cur = ''; }
  }
  if (cur.length >= 8) runs.push(cur);
  return runs.length ? runs.join('\n') : null;
}

export async function parseDoc(bytes, ctx) {
  const ole = parseOle(bytes);
  if (!ole) throw new Error('不是有效的 OLE 复合文档（旧版 .doc）');
  const entry = ole.entries.find((e) => /^WordDocument$/i.test(e.name) && e.type === 2);
  const data = ole.streamOf(entry);
  if (!data || !data.length) throw new Error('DOC 中找不到 WordDocument 流');
  const raw = docTextFromWordStream(data, ctx);
  if (!raw) throw new Error('DOC 正文无法提取，原件已完整保留');
  const text = clean(raw.replace(/\x0b/g, '\n').replace(/\x07/g, '').replace(/[\x00-\x08\x0e-\x1f]/g, ''));
  if (!text) throw new Error('DOC 正文为空');
  // 标题/作者从 SummaryInformation 尽力读取，失败不影响正文
  let title = '', author = '';
  const si = ole.entries.find((e) => /^\x05SummaryInformation$/i.test(e.name));
  if (si) {
    const b = ole.streamOf(si);
    if (b) {
      const s = latin1(b);
      const m = /([\u4e00-\u9fffA-Za-z0-9 ·_]{4,60})/.exec(s.replace(/[\x00-\x1f]/g, ' '));
      if (m) title = m[1].trim();
    }
  }
  return { text, chapters: ctx.splitChapters(text), encoding: 'doc/ole',
    parse_status: 'ok', title, author };
}

// ---------- 魔数嗅探 + 纯文本兜底 ----------
export function looksBinary(bytes) {
  const h = bytes.subarray(0, 64);
  const s4 = latin1(h.subarray(0, 8));
  if (h[0] === 0x50 && h[1] === 0x4b) return true;              // ZIP 系
  if (s4.startsWith('%PDF')) return true;
  if (h[0] === 0xd0 && h[1] === 0xcf) return true;               // OLE 系
  if (s4.startsWith('{\\rtf')) return true;
  if (h[0] === 0x1f && h[1] === 0x8b) return true;               // gzip
  if (h[0] === 0x89 && h[1] === 0x50) return true;               // PNG
  if (h[0] === 0xff && h[1] === 0xd8) return true;               // JPEG
  if (latin1(bytes.subarray(60, 64)) === 'BOOK') return true;    // PDB/MOBI
  const sample = bytes.subarray(0, Math.min(1024, bytes.length));
  let bad = 0;
  for (const b of sample) if (b < 9 || (b > 13 && b < 32)) bad++;
  return bad > sample.length * 0.06;
}

export function sniffText(bytes, ctx) {
  if (looksBinary(bytes)) return null;
  const { text, encoding } = ctx.decodeText(bytes);
  if (!text.trim()) return null;
  const sample = text.slice(0, 2048);
  let printable = 0;
  for (const ch of sample) {
    const c = ch.codePointAt(0);
    if (c >= 32 || c === 10 || c === 13 || c === 9) printable++;
  }
  if (printable / Math.max(1, sample.length) < 0.9) return null;
  return { text, chapters: ctx.splitChapters(text), encoding: encoding + '/sniff',
    parse_status: 'ok', title: '', author: '' };
}
