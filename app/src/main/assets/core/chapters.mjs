import { uuid } from './util.mjs';

const CHAPTER_RE = /^[ \t\u3000]*(?:(?:第[零〇一二三四五六七八九十百千两0-9０-９]{1,12}[章节回卷部篇集])|(?:卷[零〇一二三四五六七八九十百千0-9]{1,12})|(?:Chapter[ \t]+\d+)|(?:序章|楔子|引子|尾声|后记|番外))[ \t\u3000]*[^\n]{0,60}$/gmu;

// 中文数字章号 / 分节号 → 阿拉伯数字。够覆盖 0~9999，网文章号不会超过这个范围。
const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function cnNumber(s) {
  const t = String(s ?? '').replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10));
  if (/^\d+$/.test(t)) return Number(t);
  if (!/^[零〇一二两三四五六七八九十百千]+$/.test(t)) return null;
  let total = 0, section = 0, digit = 0;
  for (const ch of t) {
    if (ch === '百' || ch === '千') {
      section += (digit || 1) * (ch === '百' ? 100 : 1000);
      digit = 0;
    } else if (ch === '十') {
      section += (digit || 1) * 10;
      digit = 0;
    } else {
      digit = CN_DIGITS[ch] ?? 0;
    }
  }
  return total + section + digit;
}

// 章号前缀：第N章 / 第N回 / 第N卷 ...
const LEAD_RE = /^[ \t\u3000]*第([零〇一二三四五六七八九十百千两0-9０-９]{1,12})([章节回卷部篇集])/;
// 尾部分节号：全角（1）/ 半角(1) / 中文（四）/ 缺右括号「（19」都要认。
const PART_RE = /[ \t\u3000]*[（(][ \t\u3000]*([零〇一二三四五六七八九十百千两0-9０-９]{1,3})[ \t\u3000]*[）)]?[ \t\u3000]*$/;

/**
 * 拆解一行章节标题。网络小说 TXT 常把一章拆成「第N章 主标题（1）…（10）」，
 * 每行都带独立章号；base 去掉章号与分节号后才是真正的章名。
 * 返回 num(章号)、partNum(分节号)、base(归一化主标题)、clean(去掉分节号的展示标题)。
 */
export function describeChapterTitle(raw) {
  const title = String(raw ?? '').trim().slice(0, 60);
  const lead = LEAD_RE.exec(title);
  const num = lead ? cnNumber(lead[1]) : null;
  const afterLead = lead ? title.slice(lead[0].length) : title;
  const partOnTitle = PART_RE.exec(title);
  const partOnBase = PART_RE.exec(afterLead);
  const partNum = partOnBase ? cnNumber(partOnBase[1]) : null;
  const base = (partOnBase ? afterLead.slice(0, partOnBase.index) : afterLead)
    .replace(/[ \t\u3000]+/g, '').trim();
  const clean = (partOnTitle ? title.slice(0, partOnTitle.index) : title).trim();
  return { title, num, partNum, base, clean };
}

// 判定两个相邻标题是否属于同一章的分节：章号连续 + 主标题相同 + 分节号不逆序。
function sameGroup(prev, cur) {
  if (!prev || !cur || prev.num == null || cur.num == null) return false;
  if (cur.num !== prev.num + 1) return false;
  if (!prev.base || !cur.base || prev.base !== cur.base) return false;
  if (prev.partNum != null && cur.partNum != null && cur.partNum !== prev.partNum + 1) return false;
  return true;
}

// 编码检测：UTF-8 BOM / UTF-8 strict / GB18030 兜底。
// TextDecoder 是 Web 标准，Node 与 Android WebView 均可用。
export function decodeText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const hadBom = u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf;
  let encoding = 'utf-8';
  let text;
  if (hadBom) {
    text = new TextDecoder('utf-8').decode(u8.subarray(3));
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(u8);
    } catch {
      encoding = 'gb18030';
      text = new TextDecoder('gb18030').decode(u8);
    }
  }
  text = text.replace(/\r\n?/g, '\n');
  return { text, encoding, hadBom };
}

// 自动分章：匹配行首章节标题，切分为字符偏移区间（locator 与格式无关）。
// 分节体会被合并成一章（见 sameGroup），避免目录出现成百上千条重复标题。
export function splitChapters(text) {
  const hits = [];
  for (const m of text.matchAll(CHAPTER_RE)) {
    hits.push({ start: m.index, ...describeChapterTitle(m[0]) });
  }
  const groups = [];
  for (const h of hits) {
    const last = groups[groups.length - 1];
    const tail = last && last.members[last.members.length - 1];
    if (last && sameGroup(tail, h)) last.members.push(h);
    else groups.push({ members: [h] });
  }

  const marks = [];
  if (hits.length === 0) {
    marks.push({ start: 0, title: '全文' });
  } else {
    for (const g of groups) {
      const first = g.members[0];
      const last = g.members[g.members.length - 1];
      // 只有「多节且至少一节带分节号」才认定是分节体；普通同标题章节保持原样。
      const merged = g.members.length >= 2 && g.members.some((x) => x.partNum != null);
      if (merged && first.num != null && last.num != null && first.base) {
        // 目录标题写出章号范围，读者仍能按原书章号定位；num / numEnd 供页码跳转使用。
        marks.push({ start: first.start, title: `第${first.num}–${last.num}章 ${first.base}`,
          num: first.num, numEnd: last.num });
      } else {
        marks.push({ start: first.start, title: first.title,
          ...(first.num != null ? { num: first.num } : {}) });
      }
    }
    // 前言（书名 / 简介 / 标签）并入第一章，不单独占一个「开篇」条目——
    // 否则目录序号会比标题里的章号大一，也不丢开头任何字符。
    marks[0] = { ...marks[0], start: 0 };
  }
  return marks.map((m, i) => ({
    id: uuid(),
    index: i,
    title: m.title,
    ...(m.num != null ? { num: m.num } : {}),
    ...(m.numEnd != null ? { numEnd: m.numEnd } : {}),
    locator: {
      kind: 'txt_offset',
      start: m.start,
      end: i + 1 < marks.length ? marks[i + 1].start : text.length,
    },
  }));
}

// 章节内按相对偏移分页，避免把整本书读进 UI。
export function sliceChapter(fullText, chapter, offset = 0, limit = 6000) {
  const start = chapter.locator.start ?? 0;
  const end = chapter.locator.end ?? fullText.length;
  const a = Math.min(end, start + Math.max(0, offset | 0));
  const b = Math.min(end, a + Math.max(1, limit | 0));
  return {
    text: fullText.slice(a, b),
    offset: a - start,
    nextOffset: b - start,
    total: end - start,
    done: b >= end,
  };
}
