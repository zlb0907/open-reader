/* 开放书库 · 老 WebView 运行时补丁（纯 ES5 classic script）
 * 必须在 shell.js / bundle.js 之前执行。桌面 Chrome 上一律走原生实现，不生效。
 * 覆盖：Android 7~10 出厂 WebView、华为/小米/OPPO/vivo 定制内核、
 *       虚拟 https origin 被判为非安全上下文时 crypto.subtle 缺失的情况。
 */
(function () {
  'use strict';

  /* ---- globalThis（Chrome 71 之前没有） ---- */
  if (typeof globalThis === 'undefined') { window.globalThis = window; }

  /* ---- String ---- */
  function pad(that, targetLength, padString, atStart) {
    var s = String(that);
    var n = Number(targetLength) || 0;
    var p = padString === undefined ? ' ' : String(padString);
    if (n <= s.length || p === '') return s;
    var need = n - s.length;
    var fill = '';
    while (fill.length < need) fill += p;
    fill = fill.slice(0, need);
    return atStart ? fill + s : s + fill;
  }
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (n, p) { return pad(this, n, p, true); };
  }
  if (!String.prototype.padEnd) {
    String.prototype.padEnd = function (n, p) { return pad(this, n, p, false); };
  }
  if (!String.prototype.trimStart) {
    String.prototype.trimStart = function () { return String(this).replace(/^\s+/, ''); };
  }
  if (!String.prototype.trimEnd) {
    String.prototype.trimEnd = function () { return String(this).replace(/\s+$/, ''); };
  }
  if (!String.prototype.matchAll) {
    String.prototype.matchAll = function (re) {
      if (!re.global) throw new TypeError('matchAll 需要带 g 标志的正则');
      var rx = new RegExp(re.source, re.flags || (re.global ? 'g' : ''));
      var out = [], m, s = String(this);
      while ((m = rx.exec(s)) !== null) {
        out.push(m);
        if (m[0] === '') rx.lastIndex++;
      }
      return out[Symbol.iterator] ? out[Symbol.iterator]() : out;
    };
  }

  /* ---- Object / Array / Promise ---- */
  if (!Object.entries) {
    Object.entries = function (o) {
      var r = [];
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r.push([k, o[k]]);
      return r;
    };
  }
  if (!Object.values) {
    Object.values = function (o) {
      var r = [];
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r.push(o[k]);
      return r;
    };
  }
  if (!Object.fromEntries) {
    Object.fromEntries = function (it) {
      var o = {}, e, i = 0;
      var iter = typeof it.next === 'function' ? it : {
        next: function () {
          return i < it.length ? { value: it[i++], done: false } : { value: undefined, done: true };
        }
      };
      while ((e = iter.next()) && !e.done) o[e.value[0]] = e.value[1];
      return o;
    };
  }
  if (!Array.prototype.includes) {
    Array.prototype.includes = function (v, from) {
      var i = from === undefined ? 0 : Number(from) || 0;
      if (i < 0) i = Math.max(0, this.length + i);
      for (; i < this.length; i++) {
        if (this[i] === v || (v !== v && this[i] !== this[i])) return true;
      }
      return false;
    };
  }
  if (!Promise.prototype.finally) {
    Promise.prototype.finally = function (fn) {
      var P = this.constructor || Promise;
      return this.then(
        function (v) { return P.resolve(fn && fn()).then(function () { return v; }); },
        function (e) { return P.resolve(fn && fn()).then(function () { throw e; }); }
      );
    };
  }

  /* ---- IntersectionObserver：老内核没有时退化成「立即视为可见」 ---- */
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = function (cb) {
      this.observe = function (el) {
        setTimeout(function () {
          cb([{ target: el, isIntersecting: true, intersectionRatio: 1 }], this);
        }, 0);
      };
      this.unobserve = function () {};
      this.disconnect = function () {};
      this.takeRecords = function () { return []; };
    };
  }

  /* ---- crypto.subtle.digest('SHA-256') ----
     WebView 的 https://openreader.local 是本地拦截出来的虚拟源，部分 ROM
     会把它判成非安全上下文，crypto.subtle 直接 undefined。书导入 / 去重靠
     sha256Hex，缺了会整本导入失败。这里补一个纯 JS 实现（只实现 SHA-256）。 */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var H0 = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256(bytes) {
    var len = bytes.length;
    var total = Math.ceil((len + 9) / 64) * 64;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    var bits = len * 8;
    var dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(total - 4, bits >>> 0);
    var H = H0.slice(0);
    var w = new Uint32Array(64);
    for (var off = 0; off < total; off += 64) {
      var t;
      for (t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        var s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
        var s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3],
          e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = new Uint8Array(32);
    var odv = new DataView(out.buffer);
    for (var j = 0; j < 8; j++) odv.setUint32(j * 4, H[j]);
    return out;
  }
  function digest(alg, data) {
    var name = String(typeof alg === 'string' ? alg : (alg && alg.name) || '');
    if (name.toUpperCase().replace('-', '').indexOf('SHA256') < 0) {
      return Promise.reject(new Error('compat: 仅支持 SHA-256'));
    }
    var u8;
    if (data instanceof ArrayBuffer) u8 = new Uint8Array(data);
    else if (data && data.buffer) u8 = new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
    else u8 = new Uint8Array(data);
    try { return Promise.resolve(sha256(u8).buffer); }
    catch (err) { return Promise.reject(err); }
  }
  try {
    var co = window.crypto;
    if (!co) { window.crypto = co = {}; }
    if (!co.subtle || !co.subtle.digest) {
      var sub = co.subtle && typeof co.subtle === 'object' ? co.subtle : {};
      try { Object.defineProperty(sub, 'digest', { value: digest, configurable: true, writable: true }); }
      catch (e1) { sub.digest = digest; }
      sub.__orPoly = true;
      try { Object.defineProperty(co, 'subtle', { value: sub, configurable: true, writable: true }); }
      catch (e2) { co.subtle = sub; }
      window.__orSha256Polyfilled = true;
    }
  } catch (e3) { /* 极端 ROM 上 crypto 完全不可写，业务会按无 subtle 降级 */ }

  // 供自检条显示：本次到底用了原生还是补丁。
  window.__orCompat = {
    sha256Polyfill: window.__orSha256Polyfilled === true,
    es5: true
  };
})();
