/* Android 业务入口。顺序不能变：先装 /api/* 桥，再加载 app.js，
   否则它第一次 loadState() 会真的发网络请求。
   本文件由 sync-web.mjs 用 esbuild 打成 classic bundle.js（ES2017，IIFE），
   真机不再依赖 <script type="module">，兼容老版本 Android System WebView。
   导航壳由 shell.js 独立负责，这里不碰 DOM 结构。 */

import { initBridge } from './api-bridge.mjs';

function fatal(e) {
  const msg = e && (e.stack || e.message) ? String(e.stack || e.message) : String(e);
  console.error('[openreader] bootstrap failed', e);
  if (window.__orErrors) window.__orErrors.push('bootstrap: ' + msg.slice(0, 200));
  const box = document.getElementById('or-diag');
  if (box) {
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    box.innerHTML = '<b>开放书库启动失败</b><div>可尝试：设置 → 应用 → 开放书库 → 清除数据后重新打开。</div>'
      + '<pre style="white-space:pre-wrap;word-break:break-all;font-size:11px;margin:6px 0 0">'
      + esc(msg.slice(0, 1200)) + '</pre>';
    box.classList.remove('hidden');
    return;
  }
  document.body.innerHTML =
    '<div style="padding:24px;font:14px/1.7 sans-serif;color:#333">' +
    '<h2>开放书库启动失败</h2><pre style="white-space:pre-wrap;word-break:break-all">' +
    msg.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) +
    '</pre></div>';
}

/* <img src="/api/cover?..."> 与 /api/page-image 是资源加载，不走 fetch()。
   DOM 变化时把它们换成 blob URL。 */
function installImageHydrator() {
  const hydrate = () => {
    const imgs = document.querySelectorAll('img[src^="/api/"]');
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (!src || img.dataset.hydrated === src) continue;
      img.dataset.hydrated = src;
      fetch(src).then((r) => (r.ok ? r.blob() : null)).then((blob) => {
        if (!blob) return;
        const u = URL.createObjectURL(blob);
        img.src = u;
        img.addEventListener('load', () => URL.revokeObjectURL(u), { once: true });
        img.addEventListener('error', () => URL.revokeObjectURL(u), { once: true });
      }).catch(() => {});
    }
  };
  new MutationObserver(hydrate).observe(document.documentElement, { childList: true, subtree: true });
  hydrate();
}

/* 桌面版导出用 location.href 导航；Android 上会通过 Java 的文件保存桥写出。 */
function installExport() {
  window.androidExport = async (url) => {
    try {
      const isLib = url.indexOf('export-library') >= 0;
      // 设置弹窗里用户自定义的文件名（仅整库备份）。用一次即清，避免影响单本导出。
      const custom = isLib ? (window.__orBackupName || '') : '';
      if (isLib) window.__orBackupName = '';
      const r = await fetch(url);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        if (window.AndroidNative?.toast) window.AndroidNative.toast('导出失败：' + (j.error || r.status));
        return;
      }
      const cd = r.headers.get('Content-Disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      const name = custom || (m ? decodeURIComponent(m[1])
        : (isLib ? 'my-library.openlib' : 'book.txt'));
      const bytes = new Uint8Array(await r.arrayBuffer());
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, bytes.length)));
      }
      if (isLib && window.AndroidNative?.saveBackup) {
        // 系统保存窗口：用户自己选目录、还能再改一次文件名。
        window.AndroidNative.saveBackup(name, btoa(bin));
      } else if (window.AndroidNative?.saveFile) {
        window.AndroidNative.saveFile(name, btoa(bin));
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes]));
        a.download = name;
        a.click();
      }
    } catch (e) {
      console.error('[openreader] export failed', e);
      if (window.AndroidNative?.toast) window.AndroidNative.toast('导出失败：' + e.message);
    }
  };
}

/* 桌面空状态文案提到拖放和「左上角」，手机上不对；只改这一段。 */
function installAndroidCopy() {
  const patch = () => {
    const p = document.querySelector('#shelf-grid .empty-state p');
    if (!p || p.dataset.orCopy === '1') return;
    if (!/拖进窗口|点左上角/.test(p.textContent)) return;
    p.dataset.orCopy = '1';
    p.innerHTML = '点顶部「＋ 导入」或菜单里的「导入书籍」。<br>'
      + '支持 PDF / EPUB / MOBI / DOCX / DOC / RTF / ODT / FB2 / TXT 等。';
  };
  new MutationObserver(patch).observe(document.documentElement, { childList: true, subtree: true });
  patch();
}

(async () => {
  try {
    await initBridge();
    installImageHydrator();
    installExport();
    installAndroidCopy();
    window.__orBootOK = true;                 // 通知 shell.js：业务已启动，别弹自检条
    await import('./app.js');                // esbuild 会把它内联进 bundle.js
    if (window.innerWidth <= 860) {
      document.getElementById('btn-toc-collapse')?.click();
    }
  } catch (e) {
    fatal(e);
  }
})();
