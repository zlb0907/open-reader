// MOBI / AZW3 的 HUFF/CDIC 解压（零依赖、纯 Number 位运算，兼容 ES2016）。
//
// 字典不是随程序分发的固定表，而是每本书自带的 PDB 记录：1 个 HUFF + N 个 CDIC。
// 算法参照 KindleUnpack lib/mobi_uncompress.py 的 HuffReader：
//   - HUFF 记录含 256 项 dict1（码长 / 是否终结 / maxcode）与 64 项 dict2（min/max code）；
//   - CDIC 记录含若干「短语」，短语可能是字面量，也可能还要递归解压一次；
//   - 文本记录是位流：每次取 32 位窗口，按 dict1 求码长，算出短语索引，拼接输出。
// 原实现用 Python 大整数 / 64 位窗口；这里改成两个 32 位字 hi/lo，避免 BigInt，
// 因为安卓端 bundle 的 esbuild target 是 ES2016（不支持 BigInt）。
//
// 每个压缩文本记录末尾可能挂 1~N 个「尾部条目」以及多字节重叠字节，
// 解压前必须按 record0 的 extra_flags 裁掉，否则位流尾部会多出乱码。

const POW2 = new Array(33);
for (let i = 0; i <= 32; i++) POW2[i] = Math.pow(2, i);

function magicIs(b, sig) {
  if (!b || b.length < 8) return false;
  for (let i = 0; i < 8; i++) if (b[i] !== sig.charCodeAt(i)) return false;
  return true;
}

/** 按 MOBI extra_flags 裁掉压缩记录尾部的 trailing data entries 与多字节重叠。 */
export function trimTrailingEntries(data, extraFlags) {
  const flags = extraFlags >>> 0;
  if (!flags) return data;
  let trailers = 0;
  for (let bit = 1; bit < 16; bit++) if (flags & (1 << bit)) trailers++;
  let end = data.length;
  for (let k = 0; k < trailers; k++) {
    let num = 0;
    for (let i = Math.max(0, end - 4); i < end; i++) {
      const v = data[i];
      if (v & 0x80) num = 0;
      num = (num * 128) | (v & 0x7f);
    }
    if (num <= 0 || num > end) throw new Error('HUFF/CDIC 尾部条目长度异常');
    end -= num;
  }
  if (flags & 1) {
    if (end < 1) throw new Error('HUFF/CDIC 多字节重叠标记缺失');
    const cut = (data[end - 1] & 3) + 1;
    if (cut > end) throw new Error('HUFF/CDIC 多字节重叠长度异常');
    end -= cut;
  }
  return end === data.length ? data : data.subarray(0, end);
}

/**
 * 装载 HUFF/CDIC 字典，返回 { unpack(data) }。
 * @param {function} rec      取第 i 个 PDB 记录，返回 Uint8Array
 * @param {number} huffOffset 第一个字典记录的索引（record0 偏移 0x70）
 * @param {number} huffNumber 字典记录总数（record0 偏移 0x74）
 */
export function createHuffCdic(rec, huffOffset, huffNumber) {
  if (!(huffOffset > 0 && huffNumber >= 2 && huffNumber <= 4096)) {
    throw new Error('HUFF/CDIC 字典偏移不合法');
  }
  const huff = rec(huffOffset);
  if (!magicIs(huff, 'HUFF\u0000\u0000\u0000\u0018')) {
    throw new Error('不是有效的 HUFF 记录');
  }
  const dvh = new DataView(huff.buffer, huff.byteOffset, huff.byteLength);
  const off1 = dvh.getUint32(8, false);
  const off2 = dvh.getUint32(12, false);
  if (off1 + 1024 > huff.length || off2 + 256 > huff.length) {
    throw new Error('HUFF 字典表越界');
  }

  // dict1[c]：码长 cl、是否终结 term、上限 maxcode（可能超过 32 位，用 Number 而非位运算）
  const dict1 = new Array(256);
  for (let i = 0; i < 256; i++) {
    const v = dvh.getUint32(off1 + i * 4, false);
    const cl = v & 0x1f;
    dict1[i] = {
      cl: cl === 0 ? 32 : cl,
      term: (v & 0x80) !== 0,
      max: ((v >>> 8) + 1) * POW2[32 - cl] - 1,
    };
  }
  // dict2 交错存 min/max，各 32 项；下标 0 恒为 0
  const mincode = new Array(33);
  const maxcode = new Array(33);
  mincode[0] = 0;
  maxcode[0] = 0;
  for (let i = 1; i <= 32; i++) {
    const lo = dvh.getUint32(off2 + (i - 1) * 8, false);
    const hi = dvh.getUint32(off2 + (i - 1) * 8 + 4, false);
    mincode[i] = lo * POW2[32 - i];
    maxcode[i] = (hi + 1) * POW2[32 - i] - 1;
  }

  // 短语表：{ data, literal }。literal=false 表示该短语本身还是压缩位流，用时递归解开。
  const dict = [];
  for (let n = 1; n < huffNumber; n++) {
    const c = rec(huffOffset + n);
    if (!magicIs(c, 'CDIC\u0000\u0000\u0000\u0010')) {
      throw new Error('不是有效的 CDIC 记录（第 ' + n + ' 个）');
    }
    const dv = new DataView(c.buffer, c.byteOffset, c.byteLength);
    const phrases = dv.getUint32(8, false);
    const bits = dv.getUint32(12, false);
    const count = Math.min(POW2[Math.min(bits, 31)], phrases - dict.length);
    if (count < 0 || 16 + count * 2 > c.length) throw new Error('CDIC 短语表越界');
    for (let k = 0; k < count; k++) {
      const off = dv.getUint16(16 + k * 2, false);
      if (16 + off + 2 > c.length) throw new Error('CDIC 短语偏移越界');
      const bl = dv.getUint16(16 + off, false);
      const len = bl & 0x7fff;
      if (18 + off + len > c.length) throw new Error('CDIC 短语长度越界');
      dict.push({ data: c.subarray(18 + off, 18 + off + len), literal: (bl & 0x8000) !== 0 });
    }
  }
  if (!dict.length) throw new Error('CDIC 字典为空');

  function unpack(data) {
    // 8 字节零填充，保证位流窗口读到末尾也不越界（等价于 Python 的 data += b'\0'*8）
    const padded = new Uint8Array(data.length + 8);
    padded.set(data);
    const dv = new DataView(padded.buffer);
    let bitsLeft = data.length * 8;
    let pos = 0;
    let nb = 32;
    let hi = dv.getUint32(0, false);
    let lo = dv.getUint32(4, false);
    const parts = [];
    let total = 0;
    // 防止损坏文件导致死循环：每个输入字节最多产出若干短语
    const guard = Math.max(64, data.length * 64);
    for (let step = 0; step < guard; step++) {
      if (nb <= 0) {
        pos += 4;
        hi = lo;
        lo = dv.getUint32(pos + 4, false);
        nb += 32;
      }
      // (x >> nb) & 0xffffffff，x 是 pos 起 8 字节大端整数，nb ∈ [1,32]
      const code = nb === 32 ? hi : (((hi << (32 - nb)) | (lo >>> nb)) >>> 0);
      const d = dict1[code >>> 24];
      let cl = d.cl;
      let max = d.max;
      if (!d.term) {
        while (cl < 32 && code < mincode[cl]) cl++;
        max = maxcode[cl];
      }
      nb -= cl;
      bitsLeft -= cl;
      if (bitsLeft < 0) break;
      const idx = Math.floor((max - code) / POW2[32 - cl]);
      if (idx < 0 || idx >= dict.length) {
        throw new Error('HUFF/CDIC 短语索引越界：' + idx);
      }
      let entry = dict[idx];
      if (!entry) throw new Error('HUFF/CDIC 字典项缺失：' + idx);
      if (!entry.literal) {
        dict[idx] = null;                 // 防循环引用
        entry = { data: unpack(entry.data), literal: true };
        dict[idx] = entry;
      }
      parts.push(entry.data);
      total += entry.data.length;
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (let i = 0; i < parts.length; i++) { out.set(parts[i], at); at += parts[i].length; }
    return out;
  }

  return { unpack, size: dict.length };
}
