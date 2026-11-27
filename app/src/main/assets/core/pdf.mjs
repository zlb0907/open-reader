import { inflateSync, unzlibSync } from '../vendor/fflate.mjs';
// 零依赖 PDF 文本抽取（同构层：只用 Web 标准 API，Node 与 Android WebView 通用）。
//
// 覆盖范围：
//   - 传统 xref / 对象流 ObjStm（PDF 1.5+，Chrome/Word 导出的常见形态）
//   - FlateDecode、ASCIIHexDecode、ASCII85Decode、RunLengthDecode、LZWDecode 与 PNG Predictor
//   - 字体 ToUnicode CMap（bfchar / bfrange / codespacerange），中文 Identity-H 可正确还原
//   - 无 CMap 时的 WinAnsi / Differences / GB18030 / UTF-16BE 启发式解码
//   - 内容流 BT/ET、Tf、Tm、Td、TD、T*、Tj、TJ、'、" 等文本操作符
//   - 按页分章，locator 首尾相接不丢字
// 不覆盖：加密 PDF、扫描件（无文字层）、纯图形排版。两者都明确降级并保留原件。
import { uuid } from './util.mjs';

const latin1 = (b) => {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < b.length; i += CH) {
    s += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + CH, b.length)));
  }
  return s;
};
const strBytes = (s) => {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
  return u;
};
const isTag = (v, k) => v !== null && typeof v === 'object' && !Array.isArray(v) && v[k] !== undefined;
const nameOf = (v) => (isTag(v, 'name') ? v.name : '');
const dictOf = (v) => (isTag(v, 'dict') ? v.dict : {});
const isKw = (v) => isTag(v, 'kw');

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([0, 9, 10, 12, 13, 32, 40, 41, 60, 62, 91, 93, 47, 37, 123, 125]);

// ---------- PDF 语法词法 / 值解析 ----------
class Lexer {
  constructor(s, pos = 0) { this.s = s; this.i = pos; this.n = s.length; }

  skip() {
    while (this.i < this.n) {
      const c = this.s.charCodeAt(this.i);
      if (WS.has(c)) { this.i++; continue; }
      if (c === 37) { // % 注释到行尾
        while (this.i < this.n && this.s.charCodeAt(this.i) !== 10 && this.s.charCodeAt(this.i) !== 13) this.i++;
        continue;
      }
      break;
    }
  }

  word() {
    const a = this.i;
    while (this.i < this.n && !DELIM.has(this.s.charCodeAt(this.i))) this.i++;
    return this.s.slice(a, this.i);
  }

  literalString() {
    this.i++; // (
    let depth = 1;
    const out = [];
    const ESC = { n: 10, r: 13, t: 9, b: 8, f: 12 };
    while (this.i < this.n && depth > 0) {
      const c = this.s[this.i++];
      if (c === '\\') {
        const nc = this.s[this.i++];
        if (nc === undefined) break;
        if (nc >= '0' && nc <= '7') {
          let oct = nc;
          for (let k = 0; k < 2 && this.s[this.i] >= '0' && this.s[this.i] <= '7'; k++) oct += this.s[this.i++];
          out.push(parseInt(oct, 8) & 255);
        } else if (nc === '\r') { if (this.s[this.i] === '\n') this.i++; }
        else if (nc === '\n') { /* 续行 */ }
        else out.push((ESC[nc] ?? nc.charCodeAt(0)) & 255);
      } else if (c === '(') { depth++; out.push(40); }
      else if (c === ')') { depth--; if (depth > 0) out.push(41); }
      else if (c === '\r') { out.push(10); if (this.s[this.i] === '\n') this.i++; }
      else out.push(c.charCodeAt(0) & 255);
    }
    return { bytes: new Uint8Array(out) };
  }

  hexString() {
    this.i++; // <
    const a = this.i;
    while (this.i < this.n && this.s[this.i] !== '>') this.i++;
    const hex = this.s.slice(a, this.i).replace(/[^0-9a-fA-F]/g, '');
    this.i = Math.min(this.n, this.i + 1);
    const h = hex.length % 2 ? hex + '0' : hex;
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return { bytes: out };
  }

  array() {
    this.i++; // [
    const a = [];
    while (true) {
      this.skip();
      if (this.i >= this.n) break;
      if (this.s[this.i] === ']') { this.i++; break; }
      const v = this.value();
      if (v === null) break;
      if (isKw(v) && v.kw === ']') break;
      a.push(v);
    }
    return a;
  }

  dict() {
    this.i += 2; // <<
    const d = Object.create(null);
    while (true) {
      this.skip();
      if (this.i >= this.n) break;
      if (this.s[this.i] === '>' && this.s[this.i + 1] === '>') { this.i += 2; break; }
      const k = this.value();
      if (k === null) break;
      if (isKw(k) && (k.kw === '>' || k.kw === '>>')) break;
      const v = this.value();
      if (isTag(k, 'name')) d[k.name] = v === null ? null : v;
    }
    return { dict: d };
  }

  value() {
    this.skip();
    if (this.i >= this.n) return null;
    const c = this.s[this.i];
    if (c === '/') {
      this.i++;
      const w = this.word();
      // PDF 名称中的 #xx 转义
      return { name: w.replace(/#([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))) };
    }
    if (c === '(') return this.literalString();
    if (c === '<' && this.s[this.i + 1] === '<') return this.dict();
    if (c === '<') return this.hexString();
    if (c === '[') return this.array();
    if (c === ']' || c === '>' || c === ')') { this.i++; return { kw: c }; }
    const w = this.word();
    if (!w) { this.i++; return { kw: c }; }
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(w)) {
      if (/^\d+$/.test(w)) {
        const save = this.i;
        this.skip();
        const w2 = this.word();
        this.skip();
        const w3 = this.word();
        if (/^\d+$/.test(w2) && w3 === 'R') return { ref: Number(w) };
        this.i = save;
      }
      return Number(w);
    }
    if (w === 'true') return true;
    if (w === 'false') return false;
    if (w === 'null') return null;
    return { kw: w };
  }
}

// ---------- 流滤镜 ----------
async function flate(data) {
  try { return unzlibSync(data); } catch { /* 试 raw deflate */ }
  try { return inflateSync(data); } catch { /* 两种包装都不行 */ }
  throw new Error('FlateDecode 数据无法解压');
}

function asciiHex(data) {
  let s = latin1(data).replace(/[^0-9a-fA-F]/g, '');
  const gt = s.indexOf('>');
  if (gt >= 0) s = s.slice(0, gt);
  if (s.length % 2) s += '0';
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function ascii85(data) {
  const s = latin1(data);
  const out = [];
  let g = [];
  const flush = (pad) => {
    while (g.length < 5) g.push(84);
    let n = 0;
    for (const v of g) n = n * 85 + v;
    const b = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    out.push(...b.slice(0, 4 - pad));
    g = [];
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '~') break;
    if (WS.has(s.charCodeAt(i))) continue;
    if (ch === 'z' && g.length === 0) { out.push(0, 0, 0, 0); continue; }
    const v = s.charCodeAt(i) - 33;
    if (v < 0 || v > 84) continue;
    g.push(v);
    if (g.length === 5) flush(0);
  }
  if (g.length) flush(5 - g.length);
  return new Uint8Array(out);
}

function runLength(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const n = data[i++];
    if (n === 128) break;
    if (n < 128) { for (let k = 0; k <= n && i < data.length; k++) out.push(data[i++]); }
    else if (i < data.length) { const b = data[i++]; for (let k = 0; k < 257 - n; k++) out.push(b); }
  }
  return new Uint8Array(out);
}

function lzw(data, early = 1) {
  let table = [], next = 258, size = 9, bit = 0, prev = null;
  const reset = () => {
    table = [];
    for (let i = 0; i < 256; i++) table[i] = [i];
    table[256] = null; table[257] = null;
    next = 258; size = 9; prev = null;
  };
  const code = () => {
    let v = 0;
    for (let k = 0; k < size; k++) {
      const b = data[bit >> 3];
      if (b === undefined) return null;
      v = (v << 1) | ((b >> (7 - (bit & 7))) & 1);
      bit++;
    }
    return v;
  };
  reset();
  const out = [];
  while (true) {
    const c = code();
    if (c === null) break;
    if (c === 256) { reset(); continue; }
    if (c === 257) break;
    let entry;
    if (c < next && table[c]) entry = table[c];
    else if (c === next && prev) entry = [...prev, prev[0]];
    else break;
    out.push(...entry);
    if (prev) {
      table[next++] = [...prev, entry[0]];
      if (next + early >= (1 << size) && size < 12) size++;
    }
    prev = entry;
  }
  return new Uint8Array(out);
}

function undoPredictor(data, predictor, columns, colors = 1, bpc = 8) {
  const bpp = Math.max(1, Math.ceil(colors * bpc / 8));
  const row = Math.max(1, Math.ceil(columns * colors * bpc / 8));
  if (predictor === 2) {
    const out = data.slice();
    for (let i = bpp; i < out.length; i++) out[i] = (out[i] + out[i - bpp]) & 255;
    return out;
  }
  if (predictor < 10) return data;
  const stride = row + 1;
  if (stride <= 1 || data.length < stride) return data;
  const rows = Math.floor(data.length / stride);
  const out = new Uint8Array(rows * row);
  let prior = new Uint8Array(row);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * stride];
    const cur = new Uint8Array(row);
    for (let i = 0; i < row; i++) {
      const raw = data[r * stride + 1 + i];
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prior[i];
      const c = i >= bpp ? prior[i - bpp] : 0;
      let v = raw;
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    out.set(cur, r * row);
    prior = cur;
  }
  return out;
}

// ---------- 文档对象表 ----------
function resolveLength(doc, v) {
  if (typeof v === 'number') return v;
  if (isTag(v, 'ref')) {
    const st = doc.starts.get(v.ref);
    if (st !== undefined) {
      const lx = new Lexer(doc.s, st);
      const n = lx.value();
      if (typeof n === 'number') return n;
    }
  }
  return NaN;
}

function parseObjectAt(doc, start) {
  const lx = new Lexer(doc.s, start);
  const v = lx.value();
  if (v === null) return null;
  const d = dictOf(v);
  lx.skip();
  if (doc.s.startsWith('stream', lx.i)) {
    let p = lx.i + 6;
    if (doc.s[p] === '\r') { p++; if (doc.s[p] === '\n') p++; }
    else if (doc.s[p] === '\n') p++;
    const len = resolveLength(doc, d.Length);
    let end = Number.isFinite(len) && len >= 0 ? p + len : -1;
    if (end < 0 || end > doc.s.length) {
      const e = doc.s.indexOf('endstream', p);
      end = e >= 0 ? e : doc.s.length;
      while (end > p && (doc.s[end - 1] === '\n' || doc.s[end - 1] === '\r')) end--;
    }
    // 图片流（DCT/JPX 等）浏览器可直接显示，只需记录原文件偏移与长度，
    // 不复制整块字节 —— 扫描版 PDF 动辄几十 MB，全量复制会白白吃掉内存。
    const fv = d.Filter;
    const fn = (Array.isArray(fv) ? fv : [fv]).map((x) => nameOf(x)).join(',');
    if (/DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode/.test(fn)
      || nameOf(d.Subtype) === 'Image') {
      return { value: v, streamRaw: null, streamOffset: p, streamLength: end - p };
    }
    const raw = strBytes(doc.s.slice(p, end));
    return { value: v, streamRaw: raw, streamOffset: p, streamLength: end - p };
  }
  return { value: v, streamRaw: null };
}

function makeDoc(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const doc = { s: latin1(u8), starts: new Map(), objs: new Map() };
  const re = /(\d{1,10})\s+(\d{1,5})\s+obj\b/g;
  const found = [];
  let m;
  while ((m = re.exec(doc.s))) found.push({ num: Number(m[1]), start: re.lastIndex });
  for (const f of found) if (!doc.starts.has(f.num)) doc.starts.set(f.num, f.start);
  for (const f of found) {
    if (doc.objs.has(f.num)) continue;
    let o;
    try { o = parseObjectAt(doc, f.start); } catch { continue; }
    if (!o) continue;
    doc.objs.set(f.num, { num: f.num, value: o.value, dict: dictOf(o.value),
      streamRaw: o.streamRaw, streamOffset: o.streamOffset ?? null,
      streamLength: o.streamLength ?? null, decoded: null });
  }
  doc.resolve = (v) => {
    let cur = v, guard = 0;
    while (isTag(cur, 'ref') && guard++ < 12) {
      const o = doc.objs.get(cur.ref);
      if (!o) return null;
      cur = o.value;
    }
    return cur;
  };
  doc.resolveObj = (v) => (isTag(v, 'ref') ? doc.objs.get(v.ref) || null : null);
  doc.stream = async (o) => {
    if (!o || o.streamRaw === null || o.streamRaw === undefined) return null;
    if (o.decoded) return o.decoded;
    const d = o.dict || {};
    const fv = doc.resolve(d.Filter);
    const names = (Array.isArray(fv) ? fv : [fv]).map((x) => nameOf(doc.resolve(x))).filter(Boolean);
    let data = o.streamRaw;
    for (const f of names) {
      if (/^(FlateDecode|Fl)$/.test(f)) data = await flate(data);
      else if (/^(ASCIIHexDecode|AHx)$/.test(f)) data = asciiHex(data);
      else if (/^(ASCII85Decode|A85)$/.test(f)) data = ascii85(data);
      else if (/^(RunLengthDecode|RL)$/.test(f)) data = runLength(data);
      else if (/^(LZWDecode|LZW)$/.test(f)) data = lzw(data);
      else if (/DCT|JPX|CCITT|JBIG2|Crypt/.test(f)) return null;
    }
    const dp = doc.resolve(d.DecodeParms) || doc.resolve(d.DP);
    const parms = Array.isArray(dp) ? dp[0] : dp;
    const pd = dictOf(parms);
    if (pd.Predictor) {
      data = undoPredictor(data, Number(doc.resolve(pd.Predictor) || 1),
        Number(doc.resolve(pd.Columns) || 1), Number(doc.resolve(pd.Colors) || 1),
        Number(doc.resolve(pd.BitsPerComponent) || 8));
    }
    o.decoded = data;
    return data;
  };
  return doc;
}

async function expandObjectStreams(doc) {
  for (const o of [...doc.objs.values()]) {
    if (nameOf(doc.resolve(o.dict?.Type)) !== 'ObjStm') continue;
    let buf;
    try { buf = await doc.stream(o); } catch { continue; }
    if (!buf) continue;
    const n = Number(doc.resolve(o.dict.N) || 0);
    const first = Number(doc.resolve(o.dict.First) || 0);
    if (!n || first > buf.length) continue;
    const head = latin1(buf.subarray(0, first));
    const pairs = [...head.matchAll(/(\d+)\s+(\d+)/g)].slice(0, n);
    const body = latin1(buf.subarray(first));
    for (const p of pairs) {
      const num = Number(p[1]), off = Number(p[2]);
      if (doc.objs.has(num) || off >= body.length) continue;
      try {
        const v = new Lexer(body, off).value();
        if (v !== null) doc.objs.set(num, { num, value: v, dict: dictOf(v), streamRaw: null, decoded: null });
      } catch { /* 跳过损坏的内部对象 */ }
    }
  }
}

// ---------- 字体 / 编码 ----------
function utf16be(b) {
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) {
    const c = (b[i] << 8) | b[i + 1];
    if (c >= 0xd800 && c <= 0xdbff && i + 3 < b.length) {
      const c2 = (b[i + 2] << 8) | b[i + 3];
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        s += String.fromCodePoint(0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00));
        i += 2;
        continue;
      }
    }
    if (c >= 32 || c === 10 || c === 13 || c === 9) s += String.fromCharCode(c);
  }
  return s;
}

const WINANSI = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡',
  0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘',
  0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜',
  0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};
const winAnsi = (b) => WINANSI[b] ?? String.fromCharCode(b);

function hexToUnicode(hex) {
  const h = hex.replace(/\s/g, '');
  if (!h || h.length % 2) return '';
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return utf16be(b);
}
const hexNum = (hex) => parseInt(hex.replace(/\s/g, ''), 16);

function parseCMap(s) {
  const map = new Map();
  let codeLen = 0;
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/i.exec(s);
  if (cs) {
    for (const h of cs[1].matchAll(/<([0-9a-fA-F\s]+)>/g)) {
      codeLen = Math.max(codeLen, Math.floor(h[1].replace(/\s/g, '').length / 2));
    }
  }
  const bc = /beginbfchar([\s\S]*?)endbfchar/i.exec(s);
  if (bc) {
    const hs = [...bc[1].matchAll(/<([0-9a-fA-F\s]+)>/g)].map((x) => x[1].replace(/\s/g, ''));
    for (let i = 0; i + 1 < hs.length; i += 2) {
      const src = hexNum(hs[i]);
      if (!Number.isFinite(src)) continue;
      map.set(src, hexToUnicode(hs[i + 1]));
      if (!codeLen) codeLen = Math.floor(hs[i].length / 2);
    }
  }
  const br = /beginbfrange([\s\S]*?)endbfrange/i.exec(s);
  if (br) {
    const re = /<([0-9a-fA-F\s]+)>\s*<([0-9a-fA-F\s]+)>\s*(?:<([0-9a-fA-F\s]+)>|\[([\s\S]*?)\])/g;
    for (const g of br[1].matchAll(re)) {
      const lo = hexNum(g[1]), hi = hexNum(g[2]);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo > 65535) continue;
      if (g[3]) {
        const start = hexNum(g[3]);
        for (let c = lo; c <= hi; c++) {
          const h = (start + c - lo).toString(16).padStart(g[3].replace(/\s/g, '').length, '0');
          map.set(c, hexToUnicode(h));
        }
      } else if (g[4]) {
        const items = [...g[4].matchAll(/<([0-9a-fA-F\s]+)>/g)].map((x) => hexToUnicode(x[1]));
        for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, items[c - lo]);
      }
    }
  }
  return { map, codeLen: codeLen || 1 };
}

function glyphNameToUnicode(n) {
  const uni = /^uni([0-9a-fA-F]{4})$/.exec(n) || /^u([0-9a-fA-F]{4,6})$/i.exec(n);
  if (uni) { try { return String.fromCodePoint(parseInt(uni[1], 16)); } catch { return ''; } }
  if (n.length === 1 && /[A-Za-z0-9]/.test(n)) return n;
  return ({ space: ' ', hyphen: '-', period: '.', comma: ',', quoteright: '’',
    quoteleft: '‘', quotedblright: '”', quotedblleft: '“', emdash: '—', endash: '–',
    bullet: '•', ellipsis: '…' })[n] || '';
}

function decodeSimple(bytes, font) {
  if (!bytes.length) return '';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return utf16be(bytes.subarray(2));
  if (font.differences?.size) {
    return [...bytes].map((b) => font.differences.get(b) || winAnsi(b)).join('');
  }
  const enc = font.encName || '';
  if (/GB|UniGB|GBK|Adobe-GB1|Chinese|STSong|HYSMyeongJo/i.test(enc)) {
    try { return new TextDecoder('gb18030').decode(bytes); } catch { /* 继续 */ }
  }
  if (font.type0 || /Identity|UTF16|UCS2|UniJIS|UniKS|Adobe-Japan/i.test(enc)) {
    const gb = new TextDecoder('gb18030').decode(bytes);
    // 启发：GB18030 解出大量替换符/控制符时改走 UTF-16BE
    const bad = (gb.match(/[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) || []).length;
    return bad > gb.length * 0.15 ? utf16be(bytes) : gb;
  }
  return [...bytes].map(winAnsi).join('');
}

function decodeGlyphs(bytes, font = {}) {
  if (!bytes.length) return '';
  const cmap = font.cmap;
  if (!cmap) return decodeSimple(bytes, font);
  const len = cmap.codeLen || (font.type0 ? 2 : 1);
  let out = '', i = 0;
  for (; i + len <= bytes.length; i += len) {
    let code = 0;
    for (let k = 0; k < len; k++) code = (code << 8) | bytes[i + k];
    const s = cmap.map.get(code);
    if (s !== undefined) out += s;
    else if (len === 2) out += decodeSimple(bytes.subarray(i, i + 2), { ...font, cmap: null });
    else out += winAnsi(code);
  }
  if (i < bytes.length) out += decodeSimple(bytes.subarray(i), { ...font, cmap: null });
  return out;
}

async function fontsOf(doc, page) {
  const fonts = new Map();
  let node = page, res = null, guard = 0;
  while (node && guard++ < 20) {
    if (node.dict?.Resources) { res = doc.resolve(node.dict.Resources); break; }
    node = doc.resolveObj(node.dict?.Parent);
  }
  const fd = dictOf(res).Font;
  const fontDict = dictOf(doc.resolve(fd));
  for (const [key, ref] of Object.entries(fontDict)) {
    const o = doc.resolveObj(ref);
    const d = o?.dict || dictOf(doc.resolve(ref));
    const subtype = nameOf(doc.resolve(d.Subtype));
    let touni = d.ToUnicode;
    if (!touni) {
      const desc = doc.resolve(d.DescendantFonts);
      if (Array.isArray(desc) && desc.length) {
        const d0 = doc.resolveObj(desc[0]);
        touni = d0?.dict?.ToUnicode;
      }
    }
    let cmap = null;
    if (touni) {
      try {
        const raw = await doc.stream(doc.resolveObj(touni));
        if (raw) cmap = parseCMap(latin1(raw));
      } catch { /* 无 CMap 走启发式 */ }
    }
    const encVal = doc.resolve(d.Encoding);
    const encName = nameOf(encVal);
    const differences = new Map();
    const diff = dictOf(encVal).Differences;
    if (Array.isArray(diff)) {
      let code = 0;
      for (const it of diff) {
        if (typeof it === 'number') code = it;
        else if (isTag(it, 'name')) { differences.set(code, glyphNameToUnicode(it.name)); code++; }
      }
    }
    fonts.set(key, { type0: subtype === 'Type0', cmap, encName, differences, subtype });
  }
  // 兜底：某些生成器把 ToUnicode 挂在未被页面资源引用的字体对象上
  if (!fonts.size) {
    for (const o of doc.objs.values()) {
      if (!o.dict || !o.dict.ToUnicode) continue;
      try {
        const raw = await doc.stream(doc.resolveObj(o.dict.ToUnicode));
        if (raw) { fonts.set('default', { type0: true, cmap: parseCMap(latin1(raw)), encName: 'Identity-H', differences: new Map() }); break; }
      } catch { /* noop */ }
    }
  }
  return fonts;
}

// ---------- 文本内容流解释 ----------
class TextBuilder {
  constructor() { this.lines = []; this.cur = ''; this.y = null; this.x = 0; this.endX = 0; this.size = 12; }
  flush() { this.lines.push(this.cur.replace(/[ \t]+$/, '')); this.cur = ''; }
  moveTo(x, y, size) {
    this.size = size || this.size;
    if (this.y !== null && Math.abs(y - this.y) > 0.6) this.flush();
    else if (this.y !== null && x > this.endX + this.size * 0.15) this.cur += ' ';
    this.y = y; this.x = x; this.endX = x;
  }
  moveRel(tx, ty, size) { this.moveTo(this.x + tx, (this.y ?? 0) + ty, size); }
  nextLine(leading, size) { this.moveTo(this.x, (this.y ?? 0) - Math.abs(leading || size * 1.2), size); }
  append(s) {
    this.cur += s;
    let w = 0;
    for (const ch of s) w += /[\u2e80-\uffff]/.test(ch) ? 1 : 0.5;
    this.endX = this.x + w * this.size;
    this.x = this.endX;
  }
  finish() { if (this.cur.trim()) this.flush(); return this.lines.join('\n'); }
}

async function pageText(doc, page, fonts) {
  // 注意：这里不能先 resolve —— /Contents 8 0 R 解引用后会变成字典，
  // 就再也拿不到承载 streamRaw 的对象记录了。必须保留原始引用。
  const cv = page.dict?.Contents;
  const refs = Array.isArray(cv) ? cv : [cv];
  const chunks = [];
  for (const r of refs) {
    const o = doc.resolveObj(r);
    if (!o || o.streamRaw === null || o.streamRaw === undefined) continue;
    try { const b = await doc.stream(o); if (b) chunks.push(latin1(b)); } catch { /* 跳过坏流 */ }
  }
  if (!chunks.length) return '';
  const lx = new Lexer(chunks.join('\n'), 0);
  const tb = new TextBuilder();
  let font = null, size = 12, leading = 0;
  const operands = [];
  const at = (k) => operands[operands.length - k];
  const show = (t) => { if (t && t.bytes) tb.append(decodeGlyphs(t.bytes, font || {})); };

  while (true) {
    let t;
    try { t = lx.value(); } catch { break; }
    if (t === null) break;
    if (!isKw(t)) { operands.push(t); continue; }
    const op = t.kw;
    switch (op) {
      case 'BT': if (tb.cur.trim()) tb.flush(); tb.y = null; break;
      case 'ET': break;
      case 'Tf': {
        const nm = nameOf(at(2));
        if (nm) font = fonts.get(nm) || font;
        if (typeof at(1) === 'number') size = at(1);
        break;
      }
      case 'Tm': {
        const a = operands.slice(-6);
        if (a.length === 6 && a.every((x) => typeof x === 'number')) tb.moveTo(a[4], a[5], size);
        break;
      }
      case 'Td': case 'TD': {
        const tx = Number(at(2)), ty = Number(at(1));
        if (Number.isFinite(tx) && Number.isFinite(ty)) {
          tb.moveRel(tx, ty, size);
          if (op === 'TD') leading = -ty;
        }
        break;
      }
      case 'T*': tb.nextLine(leading || size * 1.2, size); break;
      case 'TL': if (typeof at(1) === 'number') leading = at(1); break;
      case "'": tb.nextLine(leading || size * 1.2, size); show(at(1)); break;
      case '"': tb.nextLine(leading || size * 1.2, size); show(at(1)); break;
      case 'Tj': show(at(1)); break;
      case 'TJ': {
        const arr = at(1);
        if (Array.isArray(arr)) {
          for (const it of arr) {
            if (it && it.bytes) show(it);
            else if (typeof it === 'number' && it <= -120) tb.append(' ');
          }
        }
        break;
      }
      case 'ID': { // 内联图像的二进制数据直接跳过
        const rest = lx.s.slice(lx.i);
        const e = /\bEI\b/.exec(rest);
        if (e) lx.i += e.index + 2;
        break;
      }
      default: break;
    }
    operands.length = 0;
  }
  return tb.finish();
}

// ---------- 页面树 / 输出 ----------
function collectPages(doc) {
  const all = [...doc.objs.values()];
  const typeOf = (o) => nameOf(doc.resolve(o?.dict?.Type));
  const roots = all.filter((o) => typeOf(o) === 'Pages' && !o.dict.Parent);
  const out = [], seen = new Set();
  const walk = (o) => {
    if (!o || seen.has(o.num)) return;
    seen.add(o.num);
    if (typeOf(o) === 'Page') { out.push(o); return; }
    const kids = doc.resolve(o.dict?.Kids);
    if (Array.isArray(kids)) for (const k of kids) {
      const ko = doc.resolveObj(k);
      if (ko) walk(ko);
      else if (isTag(k, 'dict')) walk({ num: -Math.random(), dict: k.dict });
    }
  };
  for (const r of roots) walk(r);
  for (const o of all.filter((x) => typeOf(x) === 'Page').sort((a, b) => a.num - b.num)) {
    if (!seen.has(o.num)) { out.push(o); seen.add(o.num); }
  }
  return out;
}

// 扫描版页面：找到该页最大的、浏览器能直接显示的 JPEG 图片对象。
// 只记录它在原 PDF 里的字节区间，不复制数据，也不落地副本。
function pageImage(doc, page, num) {
  let node = page, res = null, guard = 0;
  while (node && guard++ < 20) {
    if (node.dict?.Resources) { res = doc.resolve(node.dict.Resources); break; }
    node = doc.resolveObj(node.dict?.Parent);
  }
  const xobj = dictOf(doc.resolve(dictOf(res).XObject));
  let best = null;
  for (const [, ref] of Object.entries(xobj)) {
    const io = doc.resolveObj(ref);
    if (!io || !io.streamOffset || !io.streamLength) continue;
    if (nameOf(doc.resolve(io.dict?.Subtype)) !== 'Image') continue;
    const fv = doc.resolve(io.dict.Filter);
    const fn = (Array.isArray(fv) ? fv : [fv]).map((x) => nameOf(doc.resolve(x))).join(',');
    const mime = /DCTDecode/.test(fn) ? 'image/jpeg' : /JPXDecode/.test(fn) ? 'image/jp2' : null;
    if (!mime) continue;
    if (!best || io.streamLength > best.length) {
      best = { offset: io.streamOffset, length: io.streamLength, mime };
    }
  }
  return best ? { page: num, ...best } : null;
}

function normalize(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+$/gm, '')
    .split('\n').map((x) => x.replace(/\s+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function infoOf(doc) {
  for (const o of doc.objs.values()) {
    const d = o.dict;
    if (!d || (!d.Title && !d.Author)) continue;
    const str = (v) => {
      const r = doc.resolve(v);
      if (!r || !r.bytes) return '';
      if (r.bytes.length >= 2 && r.bytes[0] === 0xfe && r.bytes[1] === 0xff) return utf16be(r.bytes.subarray(2));
      try { return new TextDecoder('utf-8', { fatal: true }).decode(r.bytes); }
      catch { return [...r.bytes].map(winAnsi).join(''); }
    };
    return { title: str(d.Title).slice(0, 120), author: str(d.Author).slice(0, 120) };
  }
  return { title: '', author: '' };
}

const unsupported = (error) => ({ text: '', chapters: [], encoding: null,
  parse_status: 'unsupported', title: '', author: '', error });

export async function parsePdf(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (latin1(u8.subarray(0, 5)).indexOf('%PDF-') !== 0) {
    return unsupported('不是有效的 PDF 文件，原件已完整保留');
  }
  let doc;
  try { doc = makeDoc(u8); } catch (e) {
    return unsupported('PDF 结构无法解析：' + (e?.message || String(e)));
  }
  if (/\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(doc.s)) {
    return unsupported('加密 PDF 暂不解析（不做破解），原件已完整保留，可点「导出」取回');
  }
  await expandObjectStreams(doc);
  const pages = collectPages(doc);
  if (!pages.length) return unsupported('未找到 PDF 页面对象，原件已完整保留');

  const outputs = [];
  for (let i = 0; i < pages.length; i++) {
    const fonts = await fontsOf(doc, pages[i]);
    let text = '';
    try { text = await pageText(doc, pages[i], fonts); } catch { /* 单页失败不拖垮全书 */ }
    outputs.push({ page: i + 1, text: normalize(text) });
  }
  const withText = outputs.filter((p) => p.text);
  if (!withText.length) {
    // 没有文字层时退化为「原页图片浏览」：扫描书也能翻页看，不做 OCR、不伪造正文。
    const imagePages = [];
    for (let i = 0; i < pages.length; i++) {
      const im = pageImage(doc, pages[i], i + 1);
      if (im) imagePages.push(im);
    }
    if (imagePages.length) {
      const chunks = [];
      let text = '';
      for (const p of imagePages) {
        const prefix = chunks.length ? '\n\n' : '';
        const label = `第 ${p.page} 页（扫描图片）`;
        chunks.push({ title: label, start: text.length + prefix.length,
          image: { kind: 'pdf_image', offset: p.offset, length: p.length, mime: p.mime } });
        text += prefix + label;
      }
      const chapters = chunks.map((c, i) => ({
        id: uuid(), index: i, title: c.title, image: c.image,
        locator: { kind: 'txt_offset', start: c.start,
          end: i + 1 < chunks.length ? chunks[i + 1].start : text.length },
      }));
      const info = infoOf(doc);
      return { text, chapters, encoding: 'pdf/image', parse_status: 'ok',
        title: info.title, author: info.author,
        notice: '扫描版 PDF：按原页图片显示，无文字层，不支持全文检索' };
    }
    return unsupported('未检测到文字层，也没有浏览器可直接显示的页面图片；扫描版 OCR 不在支持范围内，原件已完整保留');
  }

  const chunks = [];
  let text = '';
  for (const p of withText) {
    const prefix = chunks.length ? '\n\n' : '';
    const first = p.text.split('\n').find((x) => x.trim())?.trim() || '';
    const title = `第 ${p.page} 页` + (first && first.length <= 18 ? ` · ${first}` : '');
    chunks.push({ title, start: text.length + prefix.length });
    text += prefix + p.text;
  }
  const chapters = chunks.map((c, i) => ({
    id: uuid(), index: i, title: c.title,
    locator: { kind: 'txt_offset', start: c.start,
      end: i + 1 < chunks.length ? chunks[i + 1].start : text.length },
  }));
  const info = infoOf(doc);
  return { text, chapters, encoding: 'pdf/text', parse_status: 'ok',
    title: info.title, author: info.author,
    notice: outputs.length > withText.length
      ? `共 ${outputs.length} 页，其中 ${outputs.length - withText.length} 页无文字层（已跳过）` : '' };
}
