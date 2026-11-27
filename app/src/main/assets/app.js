/* 开放书库 · 浏览器 / Electron 共用前端。核心只通过 /api/* 通信，
   因此同一份代码在 Android WebView 中亦可直接运行。 */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const desktop = window.desktopAPI || null;

const PALETTES = [
  ['#5b7fc7', '#3a569c'], ['#7c6bb8', '#544a91'], ['#4e9c94', '#2f726c'],
  ['#c08a55', '#96663a'], ['#b2657a', '#8a4557'], ['#5f8a5b', '#3d633d'],
  ['#4f7fa8', '#2f587d'], ['#9a7a4e', '#6f5533'],
];
function paletteOf(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

let state = null;
let bookmarks = [];
let view = 'shelf';
let filter = { nav: 'all', collectionId: null, q: '' };
let current = { id: null, chapterId: null, offset: 0, nextOffset: 0, total: 0,
  done: true, chapterIndex: 0, chapterCount: 1, chapters: [] };
// 扫描版 PDF 的连续滚动页流：一次渲染若干页，滚到底自动追加下一批
let scan = { active: false, nextIndex: 0, pages: [], observer: null, onScroll: null, ticking: false };
// 文字书的连续滚动阅读：按章拼接，滚到底自动续章；DOM 只保留可见窗口，避免老 WebView 卡死。
// 连续滚动：按章追加、滑到底自动续章。与仿真翻页、扫描版 PDF 三种正文流互斥。
let stream = { active: false, blocks: [], nextIndex: 0, onScroll: null,
  ticking: false, loading: false, end: false };

/* 仿真书页：按视口高度把正文切成一屏一页，翻动时做 3D 纸张动画。
   pages[] 里每页都记着它在整章里的绝对字符偏移，重排 / 存进度都靠它。 */
let book = {
  active: false, pages: [], index: 0, effect: 'book', animating: false,
  stage: null, front: null, base: null, measure: null,
  textW: 0, textH: 0, end: false, loading: false,
  cursor: null, headCursor: null, firstIndex: 0,
  tapTimer: null, lastTap: 0, lastX: -999, lastY: -999, tapCount: 0, swiped: false,
  resizeTimer: null, flipTimer: null,
};
// 老 WebView 没有 3D transform 时自动降级成横向滑动，不能硬上 rotateY。
const HAS_3D = (() => {
  const s = document.documentElement.style;
  return ('transform' in s || 'webkitTransform' in s)
    && ('perspective' in s || 'webkitPerspective' in s);
})();
const BOOK_FLIP_MS = 400;
let readMode = 'scroll';
let saveTimer = null, searchTimer = null;
// 滚轮翻页：只有滚到边界后继续滚才翻页，累计阈值 + 冷却，避免触控板惯性连翻
const wheel = { dir: 0, acc: 0, until: 0, busy: false };
// 全屏（沉浸）阅读：隐藏侧栏 / 目录 / 工具条，正文独占窗口
let immersive = false;

/* 书架排列与封面密度。值全部写在 body 的 data-* 上，CSS 用固定 px 声明，
   老 WebView 不需要 var() / min() / :has() 也能正确渲染。 */
const SHELF_VIEWS = ['grid', 'list'];
const SHELF_DENSITIES = ['large', 'medium', 'small'];
const DEFAULT_SHELF_VIEW = 'grid';
const DEFAULT_SHELF_DENSITY = 'medium';
const DENSITY_LABEL = { large: '大图', medium: '中图', small: '小图' };

/* 批量整理：勾选与底部操作条走普通 click，两端一致。 */
let bulkMode = false;
let bulkSelected = new Set();

/* 手机端长按书卡 → 与桌面右键相同的操作菜单。
   longPressFired 用来吞掉松手后浏览器补发的 click，避免菜单刚弹出就被关掉。 */
let longPressTimer = null;
let longPressFired = false;
let lastMenuAt = 0;

async function api(action, body = {}) {
  const r = await fetch('/api/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ error: '响应不是 JSON' }));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

/* ---------- 设置 ---------- */
function applySettings(s) {
  document.body.dataset.theme = s.theme || 'light';
  const c = $('content');
  c.style.fontSize = (s.font_size || 18) + 'px';
  c.style.lineHeight = String(s.line_height || 1.8);
  c.style.fontFamily = s.font_family === 'sans'
    ? '"Microsoft YaHei", "PingFang SC", sans-serif'
    : 'Georgia, "Microsoft YaHei", "PingFang SC", serif';
  readMode = s.read_mode === 'page' ? 'page' : 'scroll';
  book.effect = s.page_effect === 'slide' || s.page_effect === 'none'
    ? s.page_effect : 'book';
  if (book.effect === 'book' && !HAS_3D) book.effect = 'slide';
  const modeBtn = $('btn-read-mode');
  if (modeBtn) {
    modeBtn.textContent = readMode === 'scroll' ? '⇅ 连续' : '▤ 翻书';
    modeBtn.title = readMode === 'scroll'
      ? '当前：连续滚动（上下滑动自动续章），点此切换为仿真翻书'
      : '当前：仿真翻书（左右滑动 / 点屏幕两侧翻页），点此切换为连续滚动';
  }
  if (book.active) scheduleBookRelayout();
  applyShelfAppearance(s);
}

/* ---------- 书架排列 / 封面密度 ---------- */
function shelfAppearance(s) {
  const o = s || {};
  return {
    view: SHELF_VIEWS.indexOf(o.shelf_view) >= 0 ? o.shelf_view : DEFAULT_SHELF_VIEW,
    density: SHELF_DENSITIES.indexOf(o.shelf_density) >= 0 ? o.shelf_density : DEFAULT_SHELF_DENSITY,
  };
}
function applyShelfAppearance(s) {
  const a = shelfAppearance(s);
  document.body.dataset.shelfView = a.view;
  document.body.dataset.shelfDensity = a.density;
  const vb = $('btn-shelf-view');
  if (vb) {
    vb.textContent = a.view === 'list' ? '☰ 列表' : '▦ 网格';
    vb.title = a.view === 'list'
      ? '当前：紧凑列表（一行一本），点此切换为封面网格'
      : '当前：封面网格，点此切换为紧凑列表（一行一本）';
  }
  const db = $('btn-shelf-density');
  if (db) {
    const label = DENSITY_LABEL[a.density];
    db.textContent = '尺寸 ' + label;
    db.title = a.view === 'list'
      ? '列表视图行高固定，先切回封面网格才能调尺寸'
      : '当前：' + label + '，点此循环切换大 / 中 / 小';
    db.disabled = a.view === 'list';
  }
}
// 与排序一样串行提交：两个按钮连点时 set-settings 的返回值不会互相回退。
let shelfSave = Promise.resolve();
function setShelfAppearance(patch) {
  shelfSave = shelfSave.then(async () => {
    const cur = shelfAppearance(state && state.settings);
    const next = { shelf_view: patch.view || cur.view, shelf_density: patch.density || cur.density };
    state.settings = await api('set-settings', { patch: next });
    applyShelfAppearance(state.settings);
    renderShelf();
  }).catch((e) => toast('书架样式保存失败：' + e.message));
  return shelfSave;
}
function cycleShelfDensity() {
  const a = shelfAppearance(state && state.settings);
  const next = SHELF_DENSITIES[(SHELF_DENSITIES.indexOf(a.density) + 1) % SHELF_DENSITIES.length];
  return setShelfAppearance({ density: next });
}

async function changeFont(delta) {
  const size = Math.max(14, Math.min(32, (state.settings.font_size || 18) + delta));
  state.settings = await api('set-settings', { patch: { font_size: size } });
  applySettings(state.settings);
}
async function cycleTheme() {
  const order = ['light', 'sepia', 'dark'];
  const next = order[(order.indexOf(state.settings.theme || 'light') + 1) % order.length];
  state.settings = await api('set-settings', { patch: { theme: next } });
  applySettings(state.settings);
  toast('主题：' + ({ light: '明亮', sepia: '护眼', dark: '深夜' })[next]);
}

/* ---------- 弹窗（不使用 prompt / confirm，Electron 中不可靠） ---------- */
function showModal(html, onMount) {
  $('modal').innerHTML = html;
  $('modal-mask').classList.remove('hidden');
  if (onMount) onMount($('modal'));
}
function closeModal() { $('modal-mask').classList.add('hidden'); }
$('modal-mask').addEventListener('click', (e) => { if (e.target === $('modal-mask')) closeModal(); });

function askText(title, label, def = '') {
  return new Promise((resolve) => {
    showModal(`<h2>${esc(title)}</h2><p class="mdesc">${esc(label)}</p>
      <input type="text" id="m-input" value="${esc(def)}" autocomplete="off">
      <div class="modal-actions"><button id="m-cancel">取消</button><button id="m-ok" class="solid">确定</button></div>`,
      (m) => {
        const inp = m.querySelector('#m-input');
        inp.focus(); inp.select();
        const done = (v) => { closeModal(); resolve(v); };
        m.querySelector('#m-ok').onclick = () => done(inp.value.trim());
        m.querySelector('#m-cancel').onclick = () => done(null);
        inp.onkeydown = (e) => { if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); };
      });
  });
}
function askConfirm(title, desc, danger = false) {
  return new Promise((resolve) => {
    showModal(`<h2>${esc(title)}</h2><p class="mdesc">${esc(desc)}</p>
      <div class="modal-actions"><button id="m-cancel">取消</button>
      <button id="m-ok" class="solid" ${danger ? 'style="background:#cf4b4b;border-color:#cf4b4b"' : ''}>确定</button></div>`,
      (m) => {
        m.querySelector('#m-ok').onclick = () => { closeModal(); resolve(true); };
        m.querySelector('#m-cancel').onclick = () => { closeModal(); resolve(false); };
      });
  });
}

/* ---------- 数据加载与渲染 ---------- */
async function loadState() {
  state = await api('state');
  bookmarks = await api('list-bookmarks');
  applySettings(state.settings);
  $('lib-path').textContent = '书库：' + state.root;
  $('lib-path').title = state.root + '\n索引引擎：' + state.index.kind +
    (state.index.tokenizer ? ' / ' + state.index.tokenizer : '');
  renderNavCounts();
  renderCollections();
  renderShelf();
  renderBookmarks();
}

function allBooks() { return state?.books || []; }

/* ---------- 书架排序：中文拼音序 + 数字自然序，设置持久化 ---------- */
const zhCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
function sortValue(b, by) {
  switch (by) {
    case 'title': return String(b.title || '');
    case 'author': return String(b.author || '');
    case 'size': return Number(b.size_bytes) || 0;
    case 'recent': return String(b.progress?.updated_at || '');
    case 'format': return String(b.format || '');
    case 'chapters': return Number(b.chapterCount) || 0;
    default: return String(b.added_at || '');
  }
}
function sortBooks(list, fallback = null) {
  const s = state?.settings || {};
  const by = fallback?.by || s.sort_by || 'added';
  const dir = (fallback?.dir || s.sort_dir || 'asc') === 'desc' ? -1 : 1;
  const blank = (v) => v === '' || v == null;
  return [...list].sort((a, b) => {
    const x = sortValue(a, by), y = sortValue(b, by);
    const tie = zhCollator.compare(String(a.title || ''), String(b.title || ''));
    if (blank(x) && blank(y)) return tie;
    if (blank(x)) return 1;       // 空值恒排最后，不随升降翻转
    if (blank(y)) return -1;
    const r = typeof x === 'number' ? Math.sign(x - y) : zhCollator.compare(String(x), String(y));
    return (r || tie) * dir;
  });
}

// 连续快速操作两个排序控件时，两个 set-settings 请求会并发覆盖彼此。
// 串行提交，且每次都带上完整的两个键，保证界面与 settings.json 永远一致。
let sortSave = Promise.resolve();
function setSort(patch) {
  sortSave = sortSave.then(async () => {
    const cur = state?.settings || {};
    const next = { ...cur, ...patch };
    if (patch.toggle_dir) {
      next.sort_dir = (cur.sort_dir || 'asc') === 'asc' ? 'desc' : 'asc';
      delete next.toggle_dir;
    }
    state.settings = await api('set-settings', {
      patch: { sort_by: next.sort_by || 'added', sort_dir: next.sort_dir || 'asc' },
    });
    renderShelf();
  }).catch((e) => toast('排序设置保存失败：' + e.message));
  return sortSave;
}

function visibleBooks() {
  let list = allBooks();
  const cid = filter.collectionId;
  if (cid === '__recent') {
    list = list.filter((b) => b.progress?.percent > 0);
  } else if (cid === '__unfiled') {
    list = list.filter((b) => !(b.collection_ids || []).length);
  } else if (cid) {
    list = list.filter((b) => (b.collection_ids || []).includes(cid));
  }
  if (filter.q) {
    const q = filter.q.toLowerCase();
    list = list.filter((b) => (b.title || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q));
  }
  // 分类、未分类、搜索结果统一按当前排序；「最近阅读」在用户没设过排序时保持默认倒序
  const fallback = cid === '__recent' && !state?.settings?.sort_by
    ? { by: 'recent', dir: 'desc' } : null;
  return sortBooks(list, fallback);
}

function flatten(nodes, depth = 0, out = []) {
  for (const n of nodes || []) { out.push({ ...n, depth }); flatten(n.children, depth + 1, out); }
  return out;
}
function collectionName(id) {
  return flatten(state.collections?.root || []).find((n) => n.id === id)?.name || '未命名分类';
}

function renderNavCounts() {
  const bs = allBooks();
  $('count-all').textContent = bs.length;
  $('count-recent').textContent = bs.filter((b) => b.progress?.percent > 0).length;
  $('count-bookmarks').textContent = bookmarks.length;
  $('count-unfiled').textContent = bs.filter((b) => !(b.collection_ids || []).length).length;
}

function renderCollections() {
  const box = $('collections');
  const nodes = flatten(state.collections?.root || []);
  if (!nodes.length) {
    box.innerHTML = '<div class="col-empty">还没有分类，点 ＋ 新建一个</div>';
    return;
  }
  box.innerHTML = nodes.map((n) => {
    const num = allBooks().filter((b) => (b.collection_ids || []).includes(n.id)).length;
    return `<div class="col-node${filter.collectionId === n.id ? ' active' : ''}"
      data-id="${esc(n.id)}" style="padding-left:${10 + n.depth * 14}px" title="${esc(n.name)}">
      <span class="dot"></span><span class="cname">${n.hidden ? '🔒 ' : ''}${esc(n.name)}</span>
      <span class="cnum">${num}</span><button class="cog" data-cog="${esc(n.id)}">⋯</button></div>`;
  }).join('');
  box.querySelectorAll('.col-node').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.dataset.cog) return;
      filter.nav = 'collection';           // 顶部导航不高亮，避免误以为在「全部书籍」
      filter.collectionId = el.dataset.id;
      switchView('shelf');                 // 只能传 shelf/bookmarks/reader/request/shuku
      renderAll();
    };
    el.ondragover = (e) => { e.preventDefault(); el.style.background = 'var(--accent-soft)'; };
    el.ondragleave = () => { el.style.background = ''; };
    el.ondrop = async (e) => {
      e.preventDefault(); el.style.background = '';
      const id = e.dataTransfer.getData('text/book-id');
      if (!id) return;
      const b = allBooks().find((x) => x.id === id);
      if (!b) return;
      const ids = [...new Set([...(b.collection_ids || []), el.dataset.id])];
      await api('set-book-collections', { id, collectionIds: ids });
      toast(`已加入「${collectionName(el.dataset.id)}」`);
      await loadState();
    };
  });
  box.querySelectorAll('[data-cog]').forEach((btn) => {
    btn.onclick = (e) => { e.stopPropagation(); collectionMenu(e, btn.dataset.cog); };
  });
}

function coverHtml(b) {
  const [c1, c2] = paletteOf(b.id);
  const pct = Math.round((b.progress?.percent || 0) * 100);
  const img = b.hasCover
    ? `<img class="cover-img" src="/api/cover?id=${encodeURIComponent(b.id)}" alt="">`
    : '';
  return `<div class="book-card" data-id="${esc(b.id)}" draggable="true">
    <span class="bulk-check" aria-hidden="true">✓</span>
    <div class="cover${b.hasCover ? ' has-img' : ''}" style="--c1:${c1};--c2:${c2}">
      ${img}<span class="badge">${esc((b.format || 'txt').toUpperCase())}</span>
      <div class="ct">${esc(b.title)}</div>
      <div class="cf">${esc(b.author || b.chapterCount + ' 章')}</div>
    </div>
    <div class="card-title" title="${esc(b.title)}">${esc(b.title)}</div>
    <div class="card-sub">${b.chapterCount} 章 · ${(b.size_bytes / 1024).toFixed(1)} KB${pct ? ' · 已读 ' + pct + '%' : ''}</div>
    <div class="bar"><div style="width:${pct}%"></div></div>
  </div>`;
}

/* 紧凑列表：仍用 .book-card 外壳，点击 / 右键 / 拖到分类的事件绑定完全复用。
   一行一本，封面缩成 40×56，书名、作者、格式、章节、大小、进度全部可见。 */
function listCardHtml(b) {
  const [c1, c2] = paletteOf(b.id);
  const pct = Math.round((b.progress?.percent || 0) * 100);
  const img = b.hasCover
    ? `<img class="cover-img" src="/api/cover?id=${encodeURIComponent(b.id)}" alt="">`
    : '';
  const initial = esc((b.title || '书').trim().charAt(0) || '书');
  return `<div class="book-card list-card" data-id="${esc(b.id)}" draggable="true">
    <span class="bulk-check" aria-hidden="true">✓</span>
    <div class="list-cover${b.hasCover ? ' has-img' : ''}" style="--c1:${c1};--c2:${c2}">
      ${img}<span class="list-initial">${initial}</span>
    </div>
    <div class="list-main">
      <div class="list-title" title="${esc(b.title)}">${esc(b.title)}</div>
      <div class="list-author">${esc(b.author || '佚名')} · ${esc((b.format || 'txt').toUpperCase())}</div>
      <div class="list-sub">${b.chapterCount} 章 · ${(b.size_bytes / 1024).toFixed(1)} KB${pct ? ' · 已读 ' + pct + '%' : ''}</div>
      <div class="bar"><div style="width:${pct}%"></div></div>
    </div>
    <span class="list-arrow">›</span>
  </div>`;
}

function renderShelf() {
  const list = visibleBooks();
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  const grid = $('shelf-grid');
  const cid = filter.collectionId;
  const s = state?.settings || {};
  const sb = $('sort-by');
  if (sb) {
    sb.value = s.sort_by || 'added';
    const desc = (s.sort_dir || 'asc') === 'desc';
    $('btn-sort-dir').textContent = desc ? '↓ 降序' : '↑ 升序';
    $('btn-sort-dir').title = desc ? '当前降序，点击切换为升序' : '当前升序，点击切换为降序';
  }
  const titles = { __recent: '最近阅读', __unfiled: '未分类' };
  $('shelf-title').textContent = cid === '__recent' ? '最近阅读'
    : cid === '__unfiled' ? '未分类' : cid ? collectionName(cid) : '全部书籍';
  $('shelf-sub').textContent = `${list.length} 本 · 原件原样保留，索引可随时重建`;
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><div class="big">▤</div>
      <h2>${allBooks().length ? '这里还没有书' : '书库还是空的'}</h2>
      <p>${allBooks().length ? '换个分类看看，或长按书卡（电脑上点右键）把它加入分类。' :
      '点左上角「导入书籍」，或直接把文件拖进窗口。<br>支持 PDF / EPUB / MOBI / AZW3 / DOCX / DOC / RTF / ODT / FB2 / TXT 等。'}</p></div>`;
    return;
  }
  const appearance = shelfAppearance(s);
  grid.innerHTML = list.map(appearance.view === 'list' ? listCardHtml : coverHtml).join('');
  grid.querySelectorAll('.cover-img').forEach((im) => {
    // 网格里父节点是 .cover，列表里是 .list-cover；统一按父节点处理，不用 closest 选择器。
    im.onerror = () => {
      const box = im.parentNode;
      if (box) box.classList.remove('has-img');
      im.remove();
    };
  });
  grid.querySelectorAll('.book-card').forEach((el) => {
    const id = el.dataset.id;
    el.classList.toggle('bulk-on', bulkSelected.has(id));
    el.onclick = (e) => {
      // 长按已弹过菜单：松手后补发的 click 必须吞掉，否则会打开书并关掉菜单。
      if (longPressFired) { longPressFired = false; e.stopPropagation(); return; }
      if (bulkMode) { toggleBulk(id); return; }
      openBook(id);
    };
    el.oncontextmenu = (e) => { e.preventDefault(); bookMenu(e, id); };
    el.ondragstart = (e) => { e.dataTransfer.setData('text/book-id', id); e.dataTransfer.effectAllowed = 'move'; };
    bindLongPress(el, id);
  });
  const bar = $('bulk-bar');
  if (bar) {
    bar.classList.toggle('hidden', !bulkMode);
    $('bulk-count').textContent = '已选 ' + bulkSelected.size + ' 本';
    $('btn-bulk').textContent = bulkMode ? '☑ 整理中' : '☑ 批量整理';
  }
}

function renderBookmarks() {
  const box = $('bookmark-list');
  if (!bookmarks.length) {
    box.innerHTML = '<div class="empty-state"><div class="big">☆</div><h2>还没有书签</h2><p>阅读时点右上角「☆ 书签」即可记录当前位置。</p></div>';
    return;
  }
  box.innerHTML = bookmarks.map((b) => `<div class="bm-item" data-book="${esc(b.bookId)}"
      data-chapter="${esc(b.chapter_id || '')}" data-offset="${Number(b.offset) || 0}">
      <span class="bm-icon">☆</span><div class="bm-main"><b>${esc(b.note || b.bookTitle)}</b>
      <small>${esc(b.bookTitle)} · ${esc(String(b.created_at || '').replace('T', ' ').slice(0, 16))}</small></div>
      <button class="bm-del" data-del="${esc(b.id)}" data-book-del="${esc(b.bookId)}" title="删除书签">✕</button></div>`).join('');
  box.querySelectorAll('.bm-item').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.dataset.del) return;
      openBook(el.dataset.book, el.dataset.chapter || null, Number(el.dataset.offset) || 0);
    };
  });
  box.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      await api('remove-bookmark', { id: btn.dataset.bookDel, bookmarkId: btn.dataset.del });
      toast('书签已删除'); await loadState();
    };
  });
}

function renderAll() { renderNavCounts(); renderCollections(); renderShelf(); renderBookmarks(); }

/* ---------- 全屏（沉浸）阅读 ---------- */
function setImmersive(on) {
  if (on && view !== 'reader') { toast('请先打开一本书再进入全屏阅读'); return; }
  const c = $('content');
  // 书页模式不滚动，scrolling 位置由页锚点保存，重排时自然回到原处。
  const ratio = book.active || c.scrollHeight <= c.clientHeight
    ? 0 : c.scrollTop / (c.scrollHeight - c.clientHeight);
  immersive = !!on;
  document.body.classList.toggle('immersive', immersive);
  // 浏览器版没有这个 API，静默降级为纯 CSS 沉浸
  desktop?.setFullscreen?.(immersive);
  requestAnimationFrame(() => {
    if (!book.active && c.scrollHeight > c.clientHeight) {
      c.scrollTop = ratio * (c.scrollHeight - c.clientHeight);
    }
  });
  if (immersive) toast('全屏阅读 · 双击正文 / F11 / Esc 退出');
  // 顶栏 / 底栏隐藏后正文变高，必须按新视口重新分页，否则会裁字或大片留白。
  scheduleBookRelayout();
}
function toggleImmersive() { setImmersive(!immersive); }

function switchView(v) {
  view = v;
  if (v !== 'shelf' && bulkMode) {
    bulkMode = false; bulkSelected.clear();
    document.body.classList.remove('bulk-mode');
    const bar = $('bulk-bar'); if (bar) bar.classList.add('hidden');
    const btn = $('btn-bulk'); if (btn) btn.textContent = '☑ 批量整理';
  }
  if (v !== 'reader' && immersive) setImmersive(false);
  if (v !== 'reader') { stopStream(); stopBook(); }
  $('view-shelf').classList.toggle('hidden', v !== 'shelf');
  $('view-bookmarks').classList.toggle('hidden', v !== 'bookmarks');
  $('view-reader').classList.toggle('hidden', v !== 'reader');
  $('view-request').classList.toggle('hidden', v !== 'request');
  $('view-shuku').classList.toggle('hidden', v !== 'shuku');
  $('view-suggest').classList.toggle('hidden', v !== 'suggest');
  document.querySelectorAll('.nav-item').forEach((n) =>
    n.classList.toggle('active', n.dataset.view ===
      ({ shelf: filter.nav, bookmarks: 'bookmarks', request: 'request',
         shuku: 'shuku', suggest: 'suggest' })[v]));
}

/* ---------- 求书：内嵌在线求书页 ---------- */
function qiushuUrl() {
  const u = String(state?.settings?.qiushu_url || '').trim();
  return /^https?:\/\//i.test(u) ? u : '';
}
function renderRequest() {
  const box = $('request-body');
  const url = qiushuUrl();
  if (!url) {
    box.innerHTML = `<div class="empty-state"><div class="big">✎</div>
      <h2>求书通道暂未配置</h2>
      <p>请联系书库维护者开启在线求书。</p></div>`;
    return;
  }
  if (desktop) {
    // Electron\uff1awebview \u5d4c\u5165\u3002persist \u5206\u533a\u8ba9\u8868\u5355\u8bb0\u4f4f\u672c\u673a\u7528\u6237\uff0c\u4fbf\u4e8e\u56de\u770b\u300c\u6211\u7684\u63d0\u4ea4\u300d
    box.innerHTML = '';
    const wv = document.createElement('webview');
    wv.className = 'request-webview';
    wv.setAttribute('partition', 'persist:qiushu');
    // 不开 allowpopups 时 webview 会静默丢弃 target=_blank，求书页的「打开链接」点了没反应
    wv.setAttribute('allowpopups', '');
    wv.src = url;
    wv.addEventListener('dom-ready', () => {
      desktop.armWebview?.(wv.getWebContentsId());   // 主进程同时抄走设备编号
      setTimeout(refreshUnread, 600);                // 首次打开求书页后立刻点亮角标
    });
    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return;
      toast('\u6c42\u4e66\u9875\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u65b0\u70b9\u300c\u6c42\u4e66\u300d');
    });
    box.appendChild(wv);
  } else {
    // \u7eaf\u6d4f\u89c8\u5668\uff08\u542b Android WebView\uff09\uff1aiframe \u5156\u5e95\uff0c\u52a0\u8f7d\u5931\u8d25\u53ef\u5916\u90e8\u6253\u5f00
    box.innerHTML = `<iframe class="request-frame" src="${esc(url)}" referrerpolicy="no-referrer"></iframe>
      <p class="request-tip">\u6c42\u4e66\u9875\u82e5\u663e\u793a\u7a7a\u767d\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u6216\u76f4\u63a5\u7528\u6d4f\u89c8\u5668\u6253\u5f00\u3002</p>`;
  }
}

/* ---------- 云书库：内嵌站内检索页 ---------- */
function shukuUrl() {
  const u = String(state?.settings?.shuku_url || '').trim();
  return /^https?:\/\//i.test(u) ? u : '';
}
function renderShuku() {
  const box = $('shuku-body');
  const url = shukuUrl();
  if (!url) {
    box.innerHTML = `<div class="empty-state"><div class="big">☁</div>
      <h2>云书库暂未配置</h2>
      <p>请联系书库维护者开启在线书库。</p></div>`;
    return;
  }
  if (desktop) {
    box.innerHTML = '';
    const wv = document.createElement('webview');
    wv.className = 'request-webview';
    // 与求书共用分区：页内「没找到？去求书」跳转后设备编号不丢，到货角标照常。
    wv.setAttribute('partition', 'persist:qiushu');
    wv.setAttribute('allowpopups', '');          // 结果页「打开下载」要开外部链接
    wv.src = url;
    wv.addEventListener('dom-ready', () => { desktop.armWebview?.(wv.getWebContentsId()); });
    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return;
      toast('云书库加载失败，请检查网络后重新点「云书库」');
    });
    box.appendChild(wv);
  } else {
    // 纯浏览器（含 Android WebView）：iframe 兜底，不依赖 Electron。
    box.innerHTML = `<iframe class="request-frame" src="${esc(url)}" referrerpolicy="no-referrer"></iframe>
      <p class="request-tip">云书库若显示空白，请检查网络或直接用浏览器打开。</p>`;
  }
}

/* ---------- 用户建议：内嵌在线反馈页 ---------- */
function suggestUrl() {
  const u = String(state?.settings?.suggest_url || '').trim();
  return /^https?:\/\//i.test(u) ? u : '';
}
function renderSuggest() {
  const box = $('suggest-body');
  const url = suggestUrl();
  if (!url) {
    box.innerHTML = `<div class="empty-state"><div class="big">✎</div>
      <h2>反馈通道暂未配置</h2><p>请联系书库维护者开启在线反馈。</p></div>`;
    return;
  }
  // 带个版本号给反馈页，管理端能看到是哪一版用户在提意见。
  const ver = (document.querySelector('meta[name="or-version"]') || {}).content || 'desktop';
  const target = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(ver);
  if (desktop) {
    // 与求书共用分区：反馈页沿用同一个设备编号，管理端能对上号。
    box.innerHTML = '';
    const wv = document.createElement('webview');
    wv.className = 'request-webview';
    wv.setAttribute('partition', 'persist:qiushu');
    wv.setAttribute('allowpopups', '');
    wv.src = target;
    wv.addEventListener('dom-ready', () => { desktop.armWebview?.(wv.getWebContentsId()); });
    wv.addEventListener('did-fail-load', (e) => {
      if (e.errorCode !== -3) toast('反馈页加载失败，请检查网络后重新打开');
    });
    box.appendChild(wv);
  } else {
    box.innerHTML = `<iframe class="request-frame" src="${esc(target)}" referrerpolicy="no-referrer"></iframe>
      <p class="request-tip">反馈页若显示空白，请检查网络后重新点「设置 → 意见反馈」。</p>`;
  }
}

/* ---------- 求书到货角标（L2）：启动即显示，不必点进求书页 ---------- */
let unreadTimer = null;
function paintUnread(n) {
  const b = $('badge-qiushu');
  if (!b) return;
  const v = Math.max(0, Number(n) || 0);
  b.textContent = v > 99 ? '99+' : String(v);
  b.classList.toggle('hidden', v === 0);
}
async function refreshUnread() {
  // 浏览器版没有这个能力，静默降级；断网/超时也静默保留上次角标，不打扰阅读
  if (!desktop?.qiushuUnread) return;
  try {
    const r = await desktop.qiushuUnread();
    if (r && r.ok) paintUnread(r.unread_count);
  } catch { /* noop */ }
}
function startUnreadPolling() {
  if (unreadTimer) clearInterval(unreadTimer);
  // 求书页点「知道了」会自行 ack；这里最多 15s 把角标清零，后台标签暂停查询
  unreadTimer = setInterval(() => { if (!document.hidden) refreshUnread(); }, 15000);
}

/* ---------- 目录（左侧常驻，直接列出全部章节） ---------- */
// 安卓上目录是盖住正文的 76vw 浮层，选完章节必须收起，否则还要再点一次
// 「☰ 目录 / ‹」才能回到正文。桌面 exe 是常驻侧栏，保持展开不动。
function closeTocOnMobile() {
  if (!window.AndroidNative) return;
  const v = $('view-reader');
  if (!v || v.classList.contains('toc-collapsed')) return;
  v.classList.add('toc-collapsed');
  const btn = $('btn-toc-expand');
  if (btn) btn.classList.remove('hidden');
}

function renderToc(q = '') {
  const list = $('toc-list');
  const key = String(q || '').trim().toLowerCase();
  const numeric = /^\d+$/.test(key);
  $('toc-count').textContent = current.chapters.length ? current.chapters.length + ' 章' : '无章节';
  const items = current.chapters.map((c, i) => ({ c, i })).filter(({ c, i }) =>
    !key || (numeric
      ? String(i + 1).startsWith(key)
        || (c.num != null && (String(c.num).startsWith(key)
          || String(c.numEnd ?? c.num).startsWith(key)))
      : (c.title || '').toLowerCase().includes(key)));
  if (!items.length) {
    list.innerHTML = `<div class="toc-empty">${current.chapters.length ? '没有匹配的章节' : '这本书没有可解析正文'}</div>`;
    return;
  }
  list.innerHTML = items.map(({ c, i }) => `<div class="toc-item${c.id === current.chapterId ? ' active' : ''}"
      data-id="${esc(c.id)}" data-index="${i}" title="${esc(c.title)}">
      <span class="toc-num">${i + 1}</span><span class="toc-name">${esc(c.title)}</span></div>`).join('');
  list.querySelectorAll('.toc-item').forEach((el) => {
    el.onclick = () => {
      $('toc-filter').value = ''; renderToc();
      gotoChapter(Number(el.dataset.index), 0);
    };
  });
}

// 目录里输入原书章号（如 115）时，优先落到包含该章号的合并章，其次按目录序号。
function tocChapterForNumber(n) {
  const hit = current.chapters.find((c) => c.num != null
    && n >= c.num && n <= (c.numEnd ?? c.num));
  return hit || (n >= 1 && n <= current.chapterCount ? current.chapters[n - 1] : null);
}

function setActiveChapter(chapterId, scrollToc = true) {
  const list = $('toc-list');
  let el = null;
  list.querySelectorAll('.toc-item').forEach((n) => {
    const on = n.dataset.id === chapterId;
    n.classList.toggle('active', on);
    if (on) el = n;
  });
  if (!el || !scrollToc) return;
  const lr = list.getBoundingClientRect(), er = el.getBoundingClientRect();
  if (er.top < lr.top + 4 || er.bottom > lr.bottom - 4)
    list.scrollTop += (er.top - lr.top) - lr.height / 2 + er.height / 2;
}

/* ---------- 扫描版 PDF：连续滚动页流 ---------- */
function chapterImageUrl(c) {
  return `/api/page-image?id=${encodeURIComponent(current.id)}&chapterId=${encodeURIComponent(c.id)}`;
}
function stopScan() {
  if (scan.observer) { scan.observer.disconnect(); scan.observer = null; }
  if (scan.onScroll) { $('content').removeEventListener('scroll', scan.onScroll); scan.onScroll = null; }
  scan.active = false; scan.pages = []; scan.nextIndex = 0; scan.ticking = false;
  $('content').classList.remove('scan-stream');
}
function makeScanPage(i) {
  const c = current.chapters[i];
  const box = document.createElement('div');
  box.className = 'scan-page';
  box.dataset.index = String(i);
  box.dataset.chapterId = c.id;
  box.innerHTML = `<img data-src="${esc(chapterImageUrl(c))}" alt="${esc(c.title)}">
    <span class="scan-label">${esc(c.title)} · ${i + 1} / ${current.chapterCount}</span>`;
  const img = box.querySelector('img');
  img.onerror = () => { img.alt = '这一页图片加载失败'; };
  return box;
}
function observeScanPages(boxes) {
  if (!scan.observer) {
    scan.observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = e.target.querySelector('img');
        if (img && !img.getAttribute('src')) img.src = img.dataset.src;
      }
    }, { root: $('content'), rootMargin: '1000px 0px' });
  }
  for (const b of boxes) scan.observer.observe(b);
}
function appendScanPages(n) {
  if (!scan.active) return;
  const boxes = [];
  while (boxes.length < n && scan.nextIndex < current.chapters.length) {
    if (!current.chapters[scan.nextIndex].image) break;
    const box = makeScanPage(scan.nextIndex);
    boxes.push(box); scan.pages.push(box); scan.nextIndex++;
  }
  if (boxes.length) {
    const frag = document.createDocumentFragment();
    for (const b of boxes) frag.appendChild(b);
    const end = $('scan-end');
    if (end) $('content').insertBefore(frag, end);
    else $('content').appendChild(frag);
    observeScanPages(boxes);
  }
  const end = $('scan-end');
  if (end) end.classList.toggle('hidden', scan.nextIndex < current.chapters.length);
}
function updateScanInfo(i) {
  const total = current.chapterCount;
  const pct = Math.min(100, Math.round(((i + 1) / total) * 100));
  $('page-info').textContent = `第 ${i + 1} / ${total} 页 · 全书 ${pct}%`;
  $('progress-fill').style.width = pct + '%';
  $('btn-prev').disabled = i <= 0;
  $('btn-next').disabled = i >= total - 1;
}
function saveProgress(chapterId, percent, offset = 0) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api('set-progress', { id: current.id, chapter_id: chapterId,
    percent, locator: { kind: 'txt_offset', offset } }).catch(() => {}), 350);
}
function updateVisibleScanPage() {
  if (!scan.active || !scan.pages.length) return;
  const content = $('content');
  const cr = content.getBoundingClientRect();
  const mid = cr.top + Math.min(160, cr.height * 0.3);
  let best = null, bestDist = Infinity;
  for (const p of scan.pages) {
    const r = p.getBoundingClientRect();
    if (r.bottom < cr.top) continue;
    const d = Math.abs(r.top - mid);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  if (!best) return;
  const i = Number(best.dataset.index);
  const c = current.chapters[i];
  if (!c || c.id === current.chapterId) return;
  current.chapterId = c.id;
  current.chapterIndex = i;
  setActiveChapter(c.id, true);
  updateScanInfo(i);
  saveProgress(c.id, (i + 1) / current.chapterCount);
}
function startScan(startIndex, notice) {
  stopScan();
  stopStream();
  const content = $('content');
  scan.active = true;
  scan.nextIndex = startIndex;
  scan.pages = [];
  content.classList.add('scan-stream');
  content.innerHTML = `<p class="scan-notice">${esc(notice ||
    '扫描版 PDF：按原页图片连续显示，向下滚动会自动加载后续页；无文字层，不支持全文检索。')}</p>
    <div id="scan-end" class="scan-end hidden">— 已经是最后一页 —</div>`;
  appendScanPages(3);
  content.scrollTop = 0;
  current.chapterId = current.chapters[startIndex].id;
  current.chapterIndex = startIndex;
  current.done = true;
  setActiveChapter(current.chapterId, true);
  updateScanInfo(startIndex);
  saveProgress(current.chapterId, (startIndex + 1) / current.chapterCount);
  scan.onScroll = () => {
    if (scan.ticking) return;
    scan.ticking = true;
    requestAnimationFrame(() => {
      scan.ticking = false;
      if (!scan.active) return;
      if (content.scrollTop + content.clientHeight >= content.scrollHeight - 1000) appendScanPages(2);
      updateVisibleScanPage();
    });
  };
  content.addEventListener('scroll', scan.onScroll, { passive: true });
  requestAnimationFrame(updateVisibleScanPage);
}
function scanScroll(delta) {
  const content = $('content');
  const cr = content.getBoundingClientRect();
  let cur = scan.pages.length ? Number(scan.pages[0].dataset.index) : 0;
  for (const p of scan.pages) {
    if (p.getBoundingClientRect().top <= cr.top + cr.height * 0.3) cur = Number(p.dataset.index);
  }
  const target = Math.max(0, Math.min(current.chapterCount - 1, cur + delta));
  let guard = 0;
  while (target >= scan.nextIndex && scan.nextIndex < current.chapterCount && guard++ < 200)
    appendScanPages(3);
  const box = scan.pages.find((p) => Number(p.dataset.index) === target);
  if (box) {
    const r = box.getBoundingClientRect();
    content.scrollTo({ top: content.scrollTop + (r.top - cr.top) - 8, behavior: 'smooth' });
  }
  updateScanInfo(target);
}

/* ---------- 连续滚动阅读（R1）：按章拼接，滚到底自动续章 ---------- */
// 翻页模式另走 loadChapter / gotoNext，两者互斥，不会互相抢 scroll 事件。
const STREAM_CHUNK = 18000;   // 单章过长时按此长度切成多个文本节点，避免一个巨型布局块
const STREAM_MAX_BLOCKS = 6;  // DOM 中最多保留 6 章，滑过就裁掉并补偿 scrollTop

function stopStream() {
  const content = $('content');
  if (content && stream.onScroll) content.removeEventListener('scroll', stream.onScroll);
  stream.active = false; stream.blocks = []; stream.nextIndex = 0;
  stream.onScroll = null; stream.ticking = false; stream.loading = false; stream.end = false;
  if (content) content.classList.remove('stream');
}

// 整章读完（read-chapter 单次上限 50000 字，长章要循环拼接）。
async function readFullChapter(chapterId) {
  let text = '', offset = 0, guard = 0;
  while (guard++ < 16) {
    const r = await api('read-chapter', { id: current.id, chapterId, offset, limit: STREAM_CHUNK });
    if (!r.chapter) return null;
    text += r.text || '';
    if (r.done || !r.text) break;
    offset = r.nextOffset;
  }
  return { text };
}

function makeStreamBlock(i, data) {
  const c = current.chapters[i];
  const box = document.createElement('section');
  box.className = 'stream-block';
  box.dataset.index = String(i);
  box.dataset.chapterId = c.id;
  box.dataset.chars = String(data.text.length || 1);
  const h = document.createElement('h3');
  h.className = 'stream-title';
  h.textContent = c.title || ('第 ' + (i + 1) + ' 节');
  box.appendChild(h);
  // 长章拆成多个文本节点：老 WebView 布局一个 6 万字的巨型块会明显掉帧。
  if (!data.text.length) data.text = '（这一章没有正文）';
  for (let p = 0; p < data.text.length; p += STREAM_CHUNK) {
    const div = document.createElement('div');
    div.className = 'stream-text';
    div.textContent = data.text.slice(p, p + STREAM_CHUNK);
    box.appendChild(div);
  }
  return box;
}

async function appendStreamBlocks(n) {
  if (!stream.active || stream.loading || stream.end) return;
  stream.loading = true;
  try {
    const content = $('content');
    while (n-- > 0 && stream.nextIndex < current.chapters.length && stream.active) {
      const i = stream.nextIndex;
      const c = current.chapters[i];
      if (!c || c.image) { stream.end = true; break; }   // 扫描页交回翻页模式
      const data = await readFullChapter(c.id);
      if (!data) { stream.end = true; break; }
      if (!stream.active) return;                         // 期间用户切了模式
      const box = makeStreamBlock(i, data);
      const end = $('stream-end');
      if (end && end.parentNode === content) content.insertBefore(box, end);
      else content.appendChild(box);
      stream.blocks.push(box);
      stream.nextIndex++;
    }
    if (stream.nextIndex >= current.chapters.length) stream.end = true;
    const end = $('stream-end');
    if (end) end.classList.toggle('hidden', !stream.end);
  } finally {
    stream.loading = false;
  }
}

// 只保留可见窗口附近的章节。移除前置块后同步回退 scrollTop，视觉位置不跳。
function trimStream() {
  const content = $('content');
  const blocks = stream.blocks;
  if (!content || blocks.length <= STREAM_MAX_BLOCKS) return;
  const cr = content.getBoundingClientRect();
  let firstVisible = 0;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].getBoundingClientRect().bottom > cr.top - 80) { firstVisible = i; break; }
  }
  const cut = Math.max(0, Math.min(firstVisible - 1, blocks.length - STREAM_MAX_BLOCKS));
  if (cut <= 0) return;
  let h = 0;
  for (let i = 0; i < cut; i++) {
    h += blocks[i].offsetHeight;
    if (blocks[i].parentNode) blocks[i].parentNode.removeChild(blocks[i]);
  }
  stream.blocks = blocks.slice(cut);
  if (h > 0) content.scrollTop = Math.max(0, content.scrollTop - h);
}

function streamVisibleOffset(box) {
  const content = $('content');
  const cr = content.getBoundingClientRect();
  const r = box.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (cr.top - r.top) / Math.max(1, r.height)));
  return Math.round(ratio * (Number(box.dataset.chars) || 1));
}

function updateVisibleStream() {
  if (!stream.active || !stream.blocks.length) return;
  const content = $('content');
  const cr = content.getBoundingClientRect();
  const mid = cr.top + Math.min(120, cr.height * 0.25);
  let best = null, bestDist = Infinity;
  for (const b of stream.blocks) {
    const r = b.getBoundingClientRect();
    if (r.bottom < cr.top) continue;
    const d = Math.abs(r.top - mid);
    if (d < bestDist) { bestDist = d; best = b; }
  }
  if (!best) return;
  const i = Number(best.dataset.index);
  const c = current.chapters[i];
  if (!c) return;
  const changed = c.id !== current.chapterId;
  current.chapterId = c.id;
  current.chapterIndex = i;
  if (changed) setActiveChapter(c.id, true);
  const pct = Math.round(((i + 1) / current.chapterCount) * 100);
  $('page-info').textContent = `第 ${i + 1}/${current.chapterCount} 章 · 连续滚动 · 全书 ${pct}%`;
  $('progress-fill').style.width = Math.min(100, Math.max(0, pct)) + '%';
  $('btn-prev').disabled = false;
  $('btn-next').disabled = stream.end && i >= current.chapterCount - 1;
  if (changed) saveProgress(c.id, (i + 1) / current.chapterCount, streamVisibleOffset(best));
}

async function startStream(startIndex = 0, startOffset = 0) {
  stopScan();
  stopStream();
  const content = $('content');
  const i = Math.max(0, Math.min(current.chapterCount - 1, startIndex));
  stream.active = true;
  stream.nextIndex = i;
  stream.blocks = [];
  stream.end = false;
  content.classList.add('stream');
  content.textContent = '';
  const end = document.createElement('div');
  end.id = 'stream-end';
  end.className = 'stream-end hidden';
  end.textContent = '— 全书完 —';
  content.appendChild(end);
  await appendStreamBlocks(3);
  if (!stream.active) return;
  content.scrollTop = 0;
  current.chapterId = current.chapters[i]?.id || current.chapterId;
  current.chapterIndex = i;
  // 从书签 / 进度恢复：按「章内字符偏移占比」定位到大致位置。
  if (startOffset > 0 && stream.blocks.length) {
    const b = stream.blocks[0];
    const ratio = Math.min(0.95, startOffset / (Number(b.dataset.chars) || 1));
    const r = b.getBoundingClientRect(), cr = content.getBoundingClientRect();
    content.scrollTop = Math.max(0, content.scrollTop + (r.top - cr.top) + ratio * r.height);
  }
  stream.onScroll = () => {
    if (stream.ticking || !stream.active) return;
    stream.ticking = true;
    requestAnimationFrame(() => {
      stream.ticking = false;
      if (!stream.active) return;
      if (content.scrollTop + content.clientHeight >= content.scrollHeight - 1200) {
        Promise.resolve(appendStreamBlocks(2)).then(() => {
          if (!stream.active) return;
          trimStream();
          updateVisibleStream();
        }).catch(() => {});
      }
      updateVisibleStream();
    });
  };
  content.addEventListener('scroll', stream.onScroll, { passive: true });
  setActiveChapter(current.chapterId, true);
  updateVisibleStream();
}

// 连续模式下「下一页 / 上一页」按钮仍可用，语义变成滚动一屏。
function streamPage(delta) {
  const c = $('content');
  const step = Math.max(160, c.clientHeight - 64);
  c.scrollTop = Math.max(0, Math.min(c.scrollHeight - c.clientHeight, c.scrollTop + delta * step));
  updateVisibleStream();
}

/* ---------- 仿真翻页（read_mode = page） ----------
   一屏一页，不是按字数整段替换。每页都记着章内绝对字符偏移，
   所以全屏 / 横竖屏 / 改字号后重分页，阅读位置不会跑。            */

function bookEffect() {
  return book.effect === 'book' && !HAS_3D ? 'slide' : book.effect;
}
function stopBook() {
  clearTimeout(book.tapTimer);
  clearTimeout(book.resizeTimer);
  clearTimeout(book.flipTimer);
  const c = $('content');
  if (c) c.classList.remove('book-mode');
  book.active = false; book.pages = []; book.index = 0; book.animating = false;
  book.stage = null; book.front = null; book.base = null; book.measure = null;
  book.end = false; book.loading = false; book.cursor = null; book.headCursor = null;
  book.firstIndex = 0; book.lastTap = 0; book.tapCount = 0; book.swiped = false;
}
function makeBookPage(cls) {
  const el = document.createElement('div');
  el.className = 'book-page ' + cls;
  for (const k of ['book-head', 'book-text', 'book-foot']) {
    const part = document.createElement('div');
    part.className = k;
    el.appendChild(part);
  }
  return el;
}
function bookPercent(p) {
  return p ? Math.round(Math.min(100,
    ((p.chapterIndex + 0.5) / Math.max(1, current.chapterCount || 1)) * 100)) : 0;
}
function fillBookPage(el, p, idx) {
  if (!el || !p) return;
  el.querySelector('.book-head').textContent = p.chapterTitle || '';
  el.querySelector('.book-text').textContent = p.text;
  el.querySelector('.book-foot').textContent =
    '第 ' + (idx + 1) + ' 页 · 全书 ' + bookPercent(p) + '%';
}
// 测量容器与 .book-text 完全同宽、同字体，用 scrollHeight 判定一页能放多少字。
function bookMeasureGeometry() {
  if (!book.active || !book.front || !book.measure) return false;
  const t = book.front.querySelector('.book-text');
  book.textW = t.clientWidth;
  book.textH = t.clientHeight;
  if (book.textW < 40 || book.textH < 40) return false;
  book.measure.style.width = book.textW + 'px';
  return true;
}
function chunkMetaOf(part) {
  return { chapterId: part.chapterId, chapterIndex: part.chapterIndex,
    chapterTitle: part.chapterTitle, baseOffset: part.charStart };
}
// 把若干段（可以跨章）拼成一条连续文本再分页：短章不会各占一页留下空白。
// 每页保存 parts[]，逐段记录章内绝对偏移，重排 / 进度 / 自检都靠它。
function paginateChunks(chunks) {
  const m = book.measure;
  // 留 20px 余量：pre-wrap 末尾换行在「height:auto 的测量块」与
  // 「overflow:hidden 的真实页」里会差几像素，不留余量就会裁掉最后一行。
  const maxH = Math.max(60, book.textH - 20);
  const pieces = [], bounds = [];
  let at = 0;
  for (const c of chunks) {
    const t = c.text || '';
    if (!t.length) continue;
    bounds.push({ start: at, end: at + t.length, meta: c.meta });
    pieces.push(t);
    at += t.length;
  }
  const text = pieces.join('');
  const n = text.length;
  const out = [];
  if (!n) return out;
  const fs = state.settings.font_size || 18;
  const lh = fs * (state.settings.line_height || 1.8);
  const perLine = Math.max(6, book.textW / (fs * 0.92));
  const guess = Math.max(30, Math.floor((maxH / Math.max(12, lh)) * perLine * 1.05));
  let pos = 0, guard = 0;
  while (pos < n && guard++ < 500) {
    let lo = pos + 1;
    let hi = Math.min(n, pos + Math.max(24, Math.round(guess * 1.6)));
    let best = pos + 1;
    m.textContent = text.slice(pos, hi);
    if (m.scrollHeight <= maxH) best = hi;
    else {
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        m.textContent = text.slice(pos, mid);
        if (m.scrollHeight <= maxH) { best = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
    }
    let cut = best;
    if (cut < n) {
      const from = Math.max(pos + 1, pos + Math.floor((best - pos) * 0.72));
      const nl = text.lastIndexOf('\n', cut - 1);
      if (nl >= from) cut = nl + 1;
    }
    if (cut <= pos) cut = best;
    const parts = [];
    for (const b of bounds) {
      const s = Math.max(pos, b.start), e = Math.min(cut, b.end);
      if (e <= s) continue;
      parts.push({ text: text.slice(s, e), chapterId: b.meta.chapterId,
        chapterIndex: b.meta.chapterIndex, chapterTitle: b.meta.chapterTitle,
        charStart: b.meta.baseOffset + (s - b.start) });
    }
    out.push({ parts, text: text.slice(pos, cut), chapterId: parts[0].chapterId,
      chapterIndex: parts[0].chapterIndex, chapterTitle: parts[0].chapterTitle,
      charStart: parts[0].charStart });
    pos = cut;
  }
  m.textContent = '';
  return out;
}
async function bookFetch(ci, offset) {
  const ch = current.chapters[ci];
  if (!ch || ch.image) return null;
  return api('read-chapter', { id: current.id, chapterId: ch.id,
    offset: Math.max(0, offset), limit: state.settings.page_size || 6000 });
}
function bookMeta(ci, r) {
  const ch = current.chapters[ci] || {};
  return { chapterId: ch.id, chapterIndex: ci, chapterTitle: ch.title || '',
    baseOffset: Number(r.offset) || 0 };
}
// 向后翻到缓存末尾时，一次多读几段（可跨章）拼成连续文本再分页，
// 并把上一页没排满的尾部接上，让每一页都填满屏幕。
async function bookLoadMore() {
  if (book.loading || book.end || !book.active || !book.cursor) return;
  book.loading = true;
  try {
    let { ci, offset, done } = book.cursor;
    const fs = state.settings.font_size || 18;
    const perPage = Math.max(120, Math.round(
      (book.textH / Math.max(12, fs * (state.settings.line_height || 1.8)))
      * Math.max(6, book.textW / (fs * 0.92))));
    const target = perPage * 5;
    const chunks = [];
    let total = 0, guard = 0;
    while (guard++ < 12 && total < target) {
      if (done) {
        if (ci + 1 >= current.chapters.length) { book.end = true; break; }
        ci += 1; offset = 0; done = false;
      }
      const r = await bookFetch(ci, offset);
      if (!book.active) return;
      if (!r || !r.chapter) { book.end = true; break; }
      chunks.push({ text: r.text || '', meta: bookMeta(ci, r) });
      total += (r.text || '').length;
      done = !!r.done;
      offset = Number(r.nextOffset) || (offset + (r.text || '').length);
      if (done && ci + 1 >= current.chapters.length) { book.end = true; break; }
    }
    if (!chunks.length) return;
    book.cursor = { ci, offset, done };
    let keep = book.pages;
    if (book.pages.length) {
      const tail = book.pages[book.pages.length - 1];
      keep = book.pages.slice(0, -1);
      const head = [];
      for (const q of tail.parts) head.push({ text: q.text, meta: chunkMetaOf(q) });
      chunks.unshift.apply(chunks, head);
    }
    const fresh = paginateChunks(chunks);
    if (!fresh.length) return;
    book.pages = keep.concat(fresh);
    if (!book.animating && book.index >= keep.length) bookRender();
    bookUpdateInfo();
  } finally { book.loading = false; }
}
// 向前翻出缓存时，把上一段 / 上一章末尾的页补到数组前面，做到无缝回翻。
async function bookPrepend() {
  if (book.loading || !book.active || !book.headCursor) return false;
  book.loading = true;
  try {
    let { ci, offset } = book.headCursor;
    const size = state.settings.page_size || 6000;
    let r = null;
    if (offset <= 0) {
      if (ci <= 0) return false;
      ci -= 1;
      const probe = await bookFetch(ci, 0);
      if (!probe || !probe.chapter || !book.active) return false;
      const tail = Math.max(0, (Number(probe.total) || 0) - size);
      r = tail > 0 ? await bookFetch(ci, tail) : probe;
    } else {
      const prev = Math.max(0, offset - size);
      if (prev === offset) return false;
      r = await bookFetch(ci, prev);
    }
    if (!r || !r.chapter || !book.active) return false;
    const pages = paginateChunks([{ text: r.text || '', meta: bookMeta(ci, r) }]);
    if (!pages.length) return false;
    book.pages = pages.concat(book.pages);
    book.index += pages.length;
    book.headCursor = { ci, offset: Number(r.offset) || 0, done: false };
    bookUpdateInfo();
    return true;
  } finally { book.loading = false; }
}
async function startBook(startIndex = 0, startOffset = 0) {
  stopScan(); stopStream(); stopBook();
  const content = $('content');
  const i = Math.max(0, Math.min((current.chapterCount || 1) - 1, startIndex));
  const at = Math.max(0, startOffset);
  book.active = true;
  book.pages = []; book.index = 0; book.end = false; book.loading = false;
  book.cursor = { ci: i, offset: at, done: false };
  book.headCursor = { ci: i, offset: at, done: false };
  book.firstIndex = i;
  content.classList.add('book-mode');
  content.textContent = '';
  const stage = document.createElement('div');
  stage.className = 'book-stage'; stage.id = 'book-stage';
  const base = makeBookPage('book-base');
  const front = makeBookPage('book-front');
  base.style.display = 'none';
  stage.appendChild(base); stage.appendChild(front);
  content.appendChild(stage);
  const measure = document.createElement('div');
  measure.className = 'book-measure';
  content.appendChild(measure);
  book.stage = stage; book.base = base; book.front = front; book.measure = measure;
  bookMeasureGeometry();
  await bookLoadMore();
  if (!book.active) return;
  if (!book.pages.length) {
    content.classList.remove('book-mode');
    content.textContent = '这本书没有可解析的正文。原件已完整保留，可点「导出」取回。';
    return;
  }
  bookRender();
  bookSaveProgress();
  if (book.pages.length < 3) await bookLoadMore();   // 预取，避免刚翻开就卡
  if (book.active) bookUpdateInfo();
}
function bookSetTransform(el, v) {
  el.style.webkitTransform = v;
  el.style.transform = v;
}
function bookUpdateInfo() {
  if (!book.active) return;
  const p = book.pages[book.index];
  const n = book.pages.length;
  $('page-info').textContent = '第 ' + (book.index + 1) + '/' + n
    + (book.end ? '' : '+') + ' 页 · 全书 ' + bookPercent(p) + '%';
  $('progress-fill').style.width = bookPercent(p) + '%';
  $('btn-prev').disabled = false;
  $('btn-next').disabled = book.end && book.index >= n - 1;
}
function bookRender() {
  const p = book.pages[book.index];
  if (!book.active || !p || !book.front) return;
  clearTimeout(book.flipTimer);
  book.flipTimer = null;
  book.front.classList.remove('book-flipping');
  book.front.style.transition = 'none';
  bookSetTransform(book.front, '');
  book.base.style.display = 'none';
  book.front.style.display = '';
  fillBookPage(book.front, p, book.index);
  void book.front.offsetWidth;
  book.front.style.transition = '';
  book.animating = false;
  bookUpdateInfo();
}
function bookSaveProgress() {
  const p = book.pages[book.index];
  if (!p) return;
  const changed = current.chapterId !== p.chapterId;
  current.chapterId = p.chapterId;
  current.chapterIndex = p.chapterIndex;
  current.offset = p.charStart;
  if (changed) setActiveChapter(p.chapterId, true);
  saveProgress(p.chapterId,
    Math.min(1, (p.chapterIndex + 0.5) / Math.max(1, current.chapterCount || 1)), p.charStart);
}
function flipPage(delta) {
  if (!book.active || book.animating) return;
  const target = book.index + delta;
  if (target < 0) {
    if (book.loading) return;
    Promise.resolve(bookPrepend()).then((more) => {
      if (more && book.active && book.index + delta >= 0) flipPage(delta);
      else if (book.active) toast('已经是第一页');
    }).catch(() => {});
    return;
  }
  if (target >= book.pages.length) {
    if (book.end) { toast('已经是最后一页'); return; }
    Promise.resolve(bookLoadMore()).then(() => {
      if (!book.active || book.animating) return;
      if (book.index + delta < book.pages.length) flipPage(delta);
      else if (book.end) toast('已经是最后一页');
    }).catch(() => {});
    return;
  }
  const effect = bookEffect();
  if (effect === 'none') {
    book.index = target;
    bookRender();
    bookSaveProgress();
    if (book.index >= book.pages.length - 2) bookLoadMore();
    return;
  }
  book.animating = true;
  const front = book.front, base = book.base;
  const dest = book.pages[target];
  // 只翻到 88°：纸面全程可见（越过 90° 就会被 backface 裁掉，视觉上像突然消失），
  // 同时底下的下一页从书脊一侧露出来，配合渐变阴影就是仿真翻书。
  const turn = effect === 'book' ? 'rotateY(-88deg)' : 'translateX(-102%)';
  const still = effect === 'book' ? 'rotateY(0deg)' : 'translateX(0)';
  base.style.display = '';
  front.style.display = '';
  if (delta > 0) fillBookPage(base, dest, target);
  else fillBookPage(base, book.pages[book.index], book.index);
  front.style.transition = 'none';
  if (delta > 0) bookSetTransform(front, still);
  else { fillBookPage(front, dest, target); bookSetTransform(front, turn); }
  void front.offsetWidth;
  front.style.transition = '-webkit-transform ' + BOOK_FLIP_MS
    + 'ms cubic-bezier(.28,.72,.3,1), transform ' + BOOK_FLIP_MS + 'ms cubic-bezier(.28,.72,.3,1)';
  bookSetTransform(front, delta > 0 ? turn : still);
  front.classList.add('book-flipping');
  book.flipTimer = setTimeout(() => {
    book.flipTimer = null;
    if (!book.active) return;
    book.index = target;
    bookRender();
    bookSaveProgress();
    if (book.index >= book.pages.length - 2) bookLoadMore();
  }, BOOK_FLIP_MS + 25);
}
// 视口变化（全屏切换 / 旋转 / 改字号）后按新高度重新分页，并回到原来那一页。
function scheduleBookRelayout() {
  if (!book.active) return;
  clearTimeout(book.resizeTimer);
  book.resizeTimer = setTimeout(relayoutBook, 200);
}
function relayoutBook() {
  if (!book.active || book.animating || !book.pages.length) return;
  if (!bookMeasureGeometry()) return;
  // 用「缓存全文里的字符序号」定位：重排只改切点，不改文本，序号一定对得上。
  let anchorSeq = 0;
  for (let i = 0; i < book.index; i++) anchorSeq += book.pages[i].text.length;
  const chunks = [];
  for (const p of book.pages) {
    for (const q of p.parts) chunks.push({ text: q.text, meta: chunkMetaOf(q) });
  }
  const fresh = paginateChunks(chunks);
  if (!fresh.length) return;
  let acc = 0, idx = 0;
  for (let i = 0; i < fresh.length; i++) {
    if (acc + fresh[i].text.length > anchorSeq) { idx = i; break; }
    acc += fresh[i].text.length;
    idx = i;
  }
  book.pages = fresh;
  book.index = Math.max(0, Math.min(idx, fresh.length - 1));
  bookRender();
}
/* 自检 / 排障用：不影响正常阅读。 */
window.__orBookState = () => {
  // 把页展开成 parts：同章相邻片段必须首尾相接，多字 / 少字 / 重复都能抓到。
  const parts = [];
  for (const p of book.pages) for (const q of p.parts) parts.push(q);
  let gaps = 0;
  for (let i = 1; i < parts.length; i++) {
    const a = parts[i - 1], b = parts[i];
    if (a.chapterId === b.chapterId && a.charStart + a.text.length !== b.charStart) gaps++;
  }
  return {
    active: book.active, effect: bookEffect(), has3d: HAS_3D,
    count: book.pages.length, index: book.index, end: book.end, gaps,
    text: book.pages.map((p) => p.text).join(''),
    charStart: book.pages[book.index] ? book.pages[book.index].charStart : -1,
    immersive: immersive, animating: book.animating,
  };
};
window.__orSetPageEffect = (v) => { book.effect = v; return bookEffect(); };
window.__orRelayoutBook = () => { relayoutBook(); return book.pages.length; };

// 目录点击、页码跳转、打开书籍、切换模式统一走这里。
function gotoChapter(i, offset = 0) {
  const c = current.chapters[i];
  if (!c) return null;
  closeTocOnMobile();   // 目录点章节 / 筛选回车 / 书签跳章统一在这里收起，幂等
  // 扫描版 PDF 是整页图片，保持原有图片流，不套书页。
  if (readMode === 'page' && !c.image) return startBook(i, offset);
  stopBook();
  if (readMode === 'scroll' && !c.image) return startStream(i, offset);
  return loadChapter(c.id, offset);
}

async function toggleReadMode() {
  if (!current.id) { toast('请先打开一本书'); return; }
  const next = readMode === 'scroll' ? 'page' : 'scroll';
  const index = Math.max(0, current.chapters.findIndex((c) => c.id === current.chapterId));
  let offset = 0;
  if (stream.active) {
    const b = stream.blocks.find((x) => x.dataset.chapterId === current.chapterId)
      || stream.blocks[0];
    if (b) offset = streamVisibleOffset(b);
  } else {
    offset = Number(current.offset) || 0;
  }
  try {
    state.settings = await api('set-settings', { patch: { read_mode: next } });
  } catch (err) {
    toast('保存阅读方式失败：' + err.message); return;
  }
  readMode = next;
  applySettings(state.settings);
  await gotoChapter(index, offset);
  toast(next === 'scroll'
    ? '连续滚动：上下滑动自动续章，下一页按钮改为滚动一屏'
    : '仿真翻书：左右滑动 / 点屏幕两侧翻页，双击正文进入全屏');
}

/* ---------- 阅读 ---------- */
async function openBook(id, chapterId = null, offset = 0) {
  stopScan();
  const b = await api('get-book', { id });
  current.id = id;
  current.chapters = b.chapters || [];
  current.chapterCount = current.chapters.length || 1;
  switchView('reader');
  $('reader-title').textContent = b.title + (b.author ? ' · ' + b.author : '');
  $('toc-filter').value = '';
  const target = chapterId || b.progress?.chapter_id || current.chapters[0]?.id || null;
  current.chapterId = target;
  renderToc();
  const startIndex = Math.max(0, current.chapters.findIndex((c) => c.id === target));
  await gotoChapter(startIndex, offset || b.progress?.locator?.offset || 0);
  const fresh = await api('get-book', { id });
  const i = state.books.findIndex((x) => x.id === id);
  // 合并而非整体替换：get-book 的摘要不该抹掉书架列表独有的字段（如 hasCover）。
  if (i >= 0) state.books[i] = { ...state.books[i], ...fresh };
}

async function loadChapter(chapterId, offset = 0) {
  // 兜底：任何漏走 gotoChapter 的调用，在仿真书页模式下也要回到书页流。
  if (readMode === 'page' && !book.active) {
    const i = current.chapters.findIndex((c) => c.id === chapterId);
    if (i >= 0 && !current.chapters[i].image) return startBook(i, offset);
  }
  stopBook();
  stopStream();
  const content = $('content');
  if (!chapterId) {
    stopScan();
    const b = await api('get-book', { id: current.id });
    content.textContent = b.parse_error || '这本书没有可解析的正文。原件已完整保留，可点「导出」取回。';
    $('page-info').textContent = '';
    $('progress-fill').style.width = '0%';
    return;
  }
  const r = await api('read-chapter', { id: current.id, chapterId, offset,
    limit: state.settings.page_size || 6000 });
  const idx = current.chapters.findIndex((c) => c.id === chapterId);
  if ((r.chapter?.image || current.chapters[idx]?.image) && idx >= 0) {
    startScan(idx, r.notice);
    return;
  }
  stopScan();
  Object.assign(current, {
    chapterId, offset: r.offset, nextOffset: r.nextOffset, total: r.total,
    done: r.done, chapterIndex: r.chapterIndex || 0, chapterCount: r.chapterCount || current.chapterCount,
  });
  setActiveChapter(chapterId, true);
  content.textContent = r.text + (r.notice ? '\n\n［' + r.notice + '］' : '');
  content.scrollTop = 0;
  const chapterPct = r.total ? Math.round(((r.offset + r.text.length) / r.total) * 100) : 100;
  const bookPct = Math.round(((current.chapterIndex + chapterPct / 100) / current.chapterCount) * 100);
  $('page-info').textContent = `第 ${current.chapterIndex + 1}/${current.chapterCount} 章 · 本章 ${chapterPct}% · 全书 ${bookPct}%`;
  $('progress-fill').style.width = Math.min(100, Math.max(0, bookPct)) + '%';
  $('btn-prev').disabled = r.offset <= 0 && current.chapterIndex === 0;
  $('btn-next').disabled = r.done && current.chapterIndex >= current.chapterCount - 1;
  const percent = Math.min(1, (current.chapterIndex + (r.total ? (r.offset + r.text.length) / r.total : 1)) / current.chapterCount);
  saveProgress(chapterId, percent, r.offset);
}
function gotoNext() {
  if (book.active) return flipPage(1);
  if (stream.active) return streamPage(1);
  if (scan.active) return scanScroll(1);
  if (!current.done) return loadChapter(current.chapterId, current.nextOffset);
  const i = current.chapters.findIndex((c) => c.id === current.chapterId);
  if (i >= 0 && i + 1 < current.chapters.length) return loadChapter(current.chapters[i + 1].id, 0);
  toast('已经是最后一页');
}
function gotoPrev() {
  if (book.active) return flipPage(-1);
  if (stream.active) return streamPage(-1);
  if (scan.active) return scanScroll(-1);
  if (current.offset > 0) return loadChapter(current.chapterId,
    Math.max(0, current.offset - (state.settings.page_size || 6000)));
  const i = current.chapters.findIndex((c) => c.id === current.chapterId);
  if (i > 0) return loadChapter(current.chapters[i - 1].id, 0);
  toast('已经是第一页');
}

/* ---------- 导入 / 导出 ---------- */
const ZIP_RE = /\.(zip|openlib)$/i;
// 文件夹里常有封面图、说明、缓存，先按扩展名过滤，避免把杂项当书导入。
const BOOK_FILE_RE = /\.(txt|md|markdown|text|log|rst|tex|srt|csv|json|xml|nfo|epub|docx|doc|pdf|rtf|odt|ott|fb2|html?|xhtml|mht|mhtml|mobi|prc|pdb|azw3?|zip|openlib)$/i;

async function smartImport(file) {
  const r = await fetch('/api/import-smart', { method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) },
    body: await file.arrayBuffer() });
  const j = await r.json().catch(() => ({ error: '响应不是 JSON' }));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
}

// 非安全上下文里 crypto.subtle 不可用，此时跳过前端去重（后端整包导入仍会去重）。
async function fileBytesAndHash(f) {
  const buf = await f.arrayBuffer();
  if (!globalThis.crypto?.subtle) return { buf, hex: null };
  const d = await crypto.subtle.digest('SHA-256', buf);
  const hex = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { buf, hex };
}

function showImportReports(reports) {
  const rows = [];
  let skip = 0, fail = 0;
  for (const r of reports) {
    if (r.kind === 'library') {
      rows.push(`<div class="imp-row ok">✓ ${esc(r.file || '整库包')} · 合并 ${r.books || 0} 本（更新 ${r.merged || 0} 处）</div>`);
      continue;
    }
    for (const x of r.ok || []) rows.push(`<div class="imp-row ok">✓ ${esc(x.title || x.name)}</div>`);
    for (const x of r.skip || []) {
      skip++; rows.push(`<div class="imp-row skip">○ ${esc(x.name)} · ${esc(x.reason)}</div>`);
    }
    for (const x of r.fail || []) {
      fail++; rows.push(`<div class="imp-row fail">✕ ${esc(x.name)} · ${esc(x.error)}</div>`);
    }
  }
  if (!rows.length) { toast('压缩包里没有找到可导入的书籍'); return; }
  if (!skip && !fail) return;                 // 全部成功时只留汇总 toast
  showModal(`<h2>导入明细</h2><div class="imp-list">${rows.join('')}</div>
    <div class="modal-actions"><button id="m-close" class="solid">知道了</button></div>`,
    (m) => { m.querySelector('#m-close').onclick = closeModal; });
}

// 拖文件夹时 dataTransfer.files 只有目录本身，用 webkitGetAsEntry 递归展开成文件列表。
async function collectDroppedFiles(dt) {
  try {
    const entries = [...(dt.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
    if (!entries.length) return [...dt.files];
    const out = [];
    const walk = async (entry) => {
      if (entry.isFile) {
        out.push(await new Promise((res, rej) => entry.file(res, rej)));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const e of batch) await walk(e);
        }
      }
    };
    for (const e of entries) await walk(e);
    if (out.length) return out;
  } catch { /* 环境不支持时退回普通文件列表 */ }
  return [...dt.files];
}

async function importFiles(input) {
  const files = [...input].filter((f) => BOOK_FILE_RE.test(f.name)
    && !/^__MACOSX\//i.test(f.webkitRelativePath || '') && !/(^|\/)\./.test(f.webkitRelativePath || f.name));
  if (!files.length) { toast('没有找到可导入的书籍文件'); return; }
  let ok = 0, bad = 0, skip = 0;
  const reports = [];
  // 书库里已有书的 sha256，单本 / 文件夹导入也能直接去重
  const seen = new Set(allBooks().map((b) => b.sha256).filter(Boolean));
  for (const f of files) {
    try {
      if (ZIP_RE.test(f.name)) {
        toast(`正在解析 ${f.name}…`);
        const r = await smartImport(f);
        reports.push(r);
        ok += r.kind === 'library' ? (r.books || 0) : (r.ok?.length || 0);
        skip += r.skip?.length || 0;
        bad += r.fail?.length || 0;
        continue;
      }
      const { buf, hex } = await fileBytesAndHash(f);
      if (hex && seen.has(hex)) { skip++; continue; }
      const r = await fetch('/api/import-book', { method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': encodeURIComponent(f.name) },
        body: buf });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (hex) seen.add(hex);
      ok++;
      if (j.parse_status === 'unsupported') toast(`${j.title}：原件已保存，该格式暂不解析`);
    } catch (e) { bad++; console.error(e); toast('导入失败：' + e.message); }
  }
  const parts = [`已导入 ${ok} 本`];
  if (skip) parts.push(`跳过 ${skip} 本（重复）`);
  if (bad) parts.push(`失败 ${bad} 本`);
  if (ok || bad || reports.length) toast(parts.join('，'));
  if (reports.length) showImportReports(reports);
  await loadState();
}

async function importLibrary(file) {
  try {
    toast(`正在解析 ${file.name}…`);
    const r = await smartImport(file);
    toast(r.kind === 'library'
      ? `整库导入完成：${r.books} 本书，合并 ${r.merged} 处`
      : `已导入 ${r.ok.length} 本${r.skip.length ? '，跳过 ' + r.skip.length + ' 本（重复）' : ''}${r.fail.length ? '，失败 ' + r.fail.length + ' 本' : ''}`);
    showImportReports([r]);
  } catch (e) { toast('导入失败：' + e.message); }
  await loadState();
}

/* ---------- 分类 / 右键菜单 ---------- */
function treeRoot() { return JSON.parse(JSON.stringify(state.collections?.root || [])); }
function findNode(nodes, id) {
  for (const n of nodes) { if (n.id === id) return n; const r = findNode(n.children || [], id); if (r) return r; }
  return null;
}
function removeNode(nodes, id) {
  const i = nodes.findIndex((n) => n.id === id);
  if (i >= 0) return nodes.splice(i, 1)[0];
  for (const n of nodes) { const r = removeNode(n.children || [], id); if (r) return r; }
  return null;
}
async function saveTree(tree) {
  await api('set-collections', { tree });
  await loadState();
}
async function addCollection(parentId = null) {
  const name = await askText('新建分类', '给书架起个名字，例如「小说」「技术」「待读」');
  if (!name) return;
  const tree = treeRoot();
  const node = { id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, children: [], hidden: false };
  if (parentId) { const p = findNode(tree, parentId); (p.children = p.children || []).push(node); }
  else tree.push(node);
  await saveTree(tree);
  toast('已创建「' + name + '」');
}
function collectionMenu(e, id) {
  const n = findNode(treeRoot(), id);
  if (!n) return;
  menu(e.clientX, e.clientY, [
    ['在此下新建子分类', () => addCollection(id)],
    ['重命名', async () => {
      const v = await askText('重命名分类', '新的分类名称', n.name);
      if (!v) return;
      const tree = treeRoot(); findNode(tree, id).name = v; await saveTree(tree);
    }],
    [n.hidden ? '取消隐藏标记' : '标记为隐藏', async () => {
      const tree = treeRoot(); findNode(tree, id).hidden = !n.hidden; await saveTree(tree);
      toast(n.hidden ? '已取消隐藏' : '已标记隐藏（仅 UI 隐藏，不加密）');
    }],
    null,
    ['删除分类', async () => {
      if (!await askConfirm('删除分类', `确定删除「${n.name}」吗？书籍本身不会被删除，只会解除分类关系。`, true)) return;
      const tree = treeRoot(); removeNode(tree, id); await saveTree(tree);
      const affected = allBooks().filter((b) => (b.collection_ids || []).includes(id));
      for (const b of affected) await api('set-book-collections', { id: b.id,
        collectionIds: b.collection_ids.filter((x) => x !== id) });
      if (filter.collectionId === id) filter.collectionId = null;
      await loadState();
    }, true],
  ]);
}
/* ---------- 手动封面：选图 → canvas 等比缩到 800px → JPEG → 后端 ---------- */
function imageToCoverDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 800;
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);   // 透明 PNG 转 JPEG 不出黑底
        ctx.drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.82));
      } catch (err) { reject(err); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取这张图片')); };
    img.src = url;
  });
}

function pickCover(id) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif';
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('cancel', () => inp.remove());
  inp.onchange = async () => {
    const f = inp.files?.[0];
    inp.remove();
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { toast('图片太大，请换一张 15 MB 以内的'); return; }
    try {
      const dataUrl = await imageToCoverDataUrl(f);
      await api('set-book-cover', { id, dataUrl });
      toast('封面已设置'); await loadState();
    } catch (err) { toast('设置封面失败：' + err.message); }
  };
  inp.click();
}

function bookMenu(e, id) {
  const b = allBooks().find((x) => x.id === id);
  if (!b) return;
  const items = [
    ['打开阅读', () => openBook(id)],
    ['重命名', async () => {
      const v = await askText('重命名书籍', '新的书名', b.title);
      if (!v) return;
      await api('rename-book', { id, title: v }); await loadState();
    }],
    ['设置封面…', () => pickCover(id)],
    ...(b.hasCover ? [['移除封面', async () => {
      await api('remove-book-cover', { id }); toast('封面已移除'); await loadState();
    }]] : []),
    null,
  ];
  items.push(['调整分类…', () => openCategoryPicker([id])]);
  items.push(['移出全部分类', async () => {
    await api('set-book-collections', { id, collectionIds: [] }); await loadState();
  }]);
  items.push(null);
  items.push(['导出原始文件', () => { androidExport('/api/export-book?id=' + encodeURIComponent(id)); }]);
  items.push(['删除这本书', async () => {
    if (!await askConfirm('删除书籍', `确定从书库移除「${b.title}」吗？这会删除书库内的原件副本，操作不可撤销。`, true)) return;
    await api('delete-book', { id });
    if (current.id === id) { current.id = null; switchView('shelf'); }
    toast('已删除'); await loadState();
  }, true]);
  menu(e.clientX, e.clientY, items);
}
function menu(x, y, items) {
  // 长按与系统 contextmenu 可能先后触发；600ms 内只弹一次。
  const now = Date.now();
  if (now - lastMenuAt < 600) return;
  lastMenuAt = now;
  const el = $('context-menu');
  el.innerHTML = items.map((it) => !it ? '<div class="sep"></div>'
    : `<button class="${it[2] ? 'danger' : ''}">${esc(it[0])}</button>`).join('');
  el.classList.remove('hidden');
  const w = 180, h = items.length * 32 + 12;
  el.style.left = Math.min(x, innerWidth - w - 8) + 'px';
  el.style.top = Math.min(y, innerHeight - h - 8) + 'px';
  const active = items.filter(Boolean);
  el.querySelectorAll('button').forEach((btn, i) => {
    btn.onclick = (e) => { e.stopPropagation(); el.classList.add('hidden'); active[i][1](); };
  });
}
document.addEventListener('click', (e) => {
  if (longPressFired) { longPressFired = false; e.stopPropagation(); return; }
  $('context-menu').classList.add('hidden');
});

/* 手机端主入口：长按书卡 ~480ms 弹出和桌面右键一样的操作菜单。
   滑动超过 10px 视为滚屏并取消；松手后补发的 click 由 longPressFired 吞掉。 */
function bindLongPress(el, id) {
  let start = null;
  const cancel = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    start = null;
  };
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY };
    longPressFired = false;
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (!start) return;
      longPressFired = true;
      bookMenu({ clientX: start.x, clientY: start.y }, id);
      start = null;
    }, 480);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!start || !e.touches.length) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) cancel();
  }, { passive: true });
  el.addEventListener('touchend', () => {
    cancel();
    // 有些老 WebView 长按后不补发 click，兜底清标志，别吞掉下一次正常点击。
    if (longPressFired) setTimeout(() => { longPressFired = false; }, 700);
  }, { passive: true });
  el.addEventListener('touchcancel', cancel, { passive: true });
}


/* ---------- 分类整理：长按/右键菜单 / 批量多选 / 分类勾选弹层 ----------
   桌面右键、安卓长按进入单本操作；批量勾选与分类弹层全部是普通 click。 */
function setBulkMode(on) {
  bulkMode = !!on;
  if (!bulkMode) bulkSelected.clear();
  document.body.classList.toggle('bulk-mode', bulkMode);
  renderShelf();
}
function toggleBulk(id) {
  if (bulkSelected.has(id)) bulkSelected.delete(id); else bulkSelected.add(id);
  $('shelf-grid').querySelectorAll('.book-card').forEach((el) => {
    el.classList.toggle('bulk-on', bulkSelected.has(el.dataset.id));
  });
  $('bulk-count').textContent = '已选 ' + bulkSelected.size + ' 本';
}
/* 批量删除：确认框显示本数与前三个书名，逐本删除并报告失败数。
   成功后把已删 id 从选中集合移除，留在批量模式里继续操作。 */
async function bulkDeleteSelected() {
  const ids = [...bulkSelected];
  if (!ids.length) { toast('先勾选要删除的书'); return; }
  const byId = new Map(allBooks().map((b) => [b.id, b]));
  const names = ids.map((id) => (byId.get(id) || {}).title || '（已不在书架）');
  const preview = names.slice(0, 3).join('、') + (names.length > 3 ? ` 等 ${names.length} 本` : '');
  const desc = `确定从书库删除选中的 ${ids.length} 本书吗？（${preview}）这会删除书库内的原件副本，操作不可撤销。`;
  if (!await askConfirm('批量删除书籍', desc, true)) return;
  let done = 0, failed = 0;
  for (const id of ids) {
    try { await api('delete-book', { id }); bulkSelected.delete(id); done++; }
    catch (e) { failed++; console.warn('批量删除失败', id, e); }
  }
  if (current.id && ids.includes(current.id)) { current.id = null; switchView('shelf'); }
  await loadState();
  toast(failed ? `已删除 ${done} 本，${failed} 本删除失败` : `已删除 ${done} 本`);
}
function openCategoryPicker(bookIds) {
  const byId = new Map(allBooks().map((b) => [b.id, b]));
  const ids = [...new Set(bookIds)].filter((id) => byId.has(id));
  if (!ids.length) { toast('请先选择要整理的书'); return; }
  const checked = new Set();
  // 只有全部选中书都属于该分类时才预勾，避免「部分属于」的歧义
  for (const c of flatten(state.collections?.root || [])) {
    if (ids.every((id) => (byId.get(id).collection_ids || []).includes(c.id))) checked.add(c.id);
  }
  const title = ids.length === 1 ? '调整分类 · ' + (byId.get(ids[0]).title || '')
    : '调整分类 · 已选 ' + ids.length + ' 本';
  function paint() {
    const cols = flatten(state.collections?.root || []);
    const rows = cols.length ? cols.map((c) => {
      const num = allBooks().filter((b) => (b.collection_ids || []).includes(c.id)).length;
      return `<label class="cat-row" style="padding-left:${8 + c.depth * 14}px">
        <input type="checkbox" data-cat="${esc(c.id)}" ${checked.has(c.id) ? 'checked' : ''}>
        <span class="cat-name">${esc(c.name)}</span><span class="cat-num">${num} 本</span></label>`;
    }).join('') : '<div class="cat-empty">还没有分类，在下面输入名字新建一个</div>';
    showModal(`<h2>${esc(title)}</h2>
      <p class="mdesc">勾选要把这些书放进去的分类；取消勾选即从该分类移出（批量时会作用于所选的全部书）。
        一本书可以同时属于多个分类。</p>
      <div class="cat-list">${rows}</div>
      <div class="cat-new">
        <input type="text" id="cat-new-name" placeholder="新分类名称" autocomplete="off">
        <button id="cat-new-add" class="ghost">＋ 新建并勾选</button>
      </div>
      <div class="modal-actions">
        <button id="cat-cancel">取消</button><button id="cat-ok" class="solid">保存</button>
      </div>`,
      (m) => {
        m.querySelectorAll('[data-cat]').forEach((cb) => {
          cb.onchange = () => {
            if (cb.checked) checked.add(cb.dataset.cat); else checked.delete(cb.dataset.cat);
          };
        });
        m.querySelector('#cat-new-add').onclick = async () => {
          const inp = m.querySelector('#cat-new-name');
          const name = inp.value.trim();
          if (!name) { toast('先输入分类名'); inp.focus(); return; }
          const tree = treeRoot();
          const node = { id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name, children: [], hidden: false };
          tree.push(node);
          await api('set-collections', { tree });
          await loadState();
          checked.add(node.id);
          paint();
        };
        m.querySelector('#cat-cancel').onclick = closeModal;
        m.querySelector('#cat-ok').onclick = async () => {
          const colIds = flatten(state.collections?.root || []).map((c) => c.id);
          let changed = 0;
          for (const id of ids) {
            const b = allBooks().find((x) => x.id === id);
            if (!b) continue;
            const keep = (b.collection_ids || []).filter((x) => !colIds.includes(x));
            const next = [...new Set([...keep, ...colIds.filter((x) => checked.has(x))])];
            if (next.slice().sort().join('|') !== (b.collection_ids || []).slice().sort().join('|')) {
              await api('set-book-collections', { id, collectionIds: next });
              changed++;
            }
          }
          closeModal();
          await loadState();
          toast(changed ? '已更新 ' + changed + ' 本书的分类' : '分类没有变化');
        };
      });
  }
  paint();
}

/* ---------- 设置 / 关于弹窗 ---------- */
/* ---------- 整库备份：安卓先自定义文件名，再由系统保存窗口选位置 ---------- */
function defaultBackupName() {
  const d = new Date();
  const p = (n) => ('0' + n).slice(-2);
  return '开放书库备份-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + '-' + p(d.getHours()) + p(d.getMinutes()) + '.openlib';
}
async function exportLibrary() {
  if (window.AndroidNative) {
    const last = (typeof window.AndroidNative.lastBackupName === 'function'
      && window.AndroidNative.lastBackupName()) || '';
    const name = await askText('导出整库备份',
      '给备份起个名字，下一步在系统保存窗口里选保存位置' + (last ? '；上次备份：' + last : ''),
      defaultBackupName());
    if (!name) return;
    // 安卓端 sync-web 会把下面的导航换成 androidExport()，名字从这里带走。
    window.__orBackupName = name;
  }
  androidExport('/api/export-library');
}

async function openSettings() {
  const s = state.settings;
  const a = shelfAppearance(s);
  // 只有安卓原生层带更新能力；桌面 Electron 里隐藏这一行，不影响原有设置。
  const updater = !!(window.AndroidNative && typeof window.AndroidNative.checkUpdate === 'function');
  const isAndroid = !!window.AndroidNative;
  const statsOn = isAndroid && typeof window.AndroidNative.statsOptIn === 'function'
    && window.AndroidNative.statsOptIn();
  const appVersion = (document.querySelector('meta[name="or-version"]') || {}).content || '';
  // 安卓的「书库目录」是 IndexedDB 虚拟路径，对用户没有任何意义：
  // 改成看得懂的书籍数量 / 原件体积 + 真正能用的备份与恢复按钮。
  const bookCount = (state.books || []).length;
  const totalBytes = (state.books || []).reduce((n, b) => n + (Number(b.size_bytes) || 0), 0);
  const lastBackup = isAndroid && typeof window.AndroidNative.lastBackupName === 'function'
    ? (window.AndroidNative.lastBackupName() || '') : '';
  const humanBytes = (n) => n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB'
    : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB'
    : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
  showModal(`<h2>设置</h2><p class="mdesc">偏好保存在书库目录的 <b>settings.json</b>，随书库一起备份、一起迁移。</p>
    <div class="setting-row"><span>书架排列</span><span class="sv">
      ${[['grid', '封面网格'], ['list', '紧凑列表']].map(([v, t]) =>
        `<button class="chip-btn ${a.view === v ? 'on' : ''}" data-shelf-v="${v}">${t}</button>`).join('')}</span></div>
    <div class="setting-row"><span>封面尺寸</span><span class="sv">
      ${SHELF_DENSITIES.map((v) =>
        `<button class="chip-btn ${a.density === v ? 'on' : ''}" data-density-v="${v}">${DENSITY_LABEL[v]}</button>`).join('')}</span></div>
    <div class="setting-row"><span>阅读主题</span><span class="sv">
      ${[['light', '明亮'], ['sepia', '护眼'], ['dark', '深夜']].map(([v, t]) =>
        `<button class="chip-btn ${s.theme === v ? 'on' : ''}" data-theme-v="${v}">${t}</button>`).join('')}</span></div>
    <div class="setting-row"><span>字体</span><span class="sv">
      <button class="chip-btn ${s.font_family !== 'sans' ? 'on' : ''}" data-font="serif">衬线</button>
      <button class="chip-btn ${s.font_family === 'sans' ? 'on' : ''}" data-font="sans">黑体</button></span></div>
    <div class="setting-row"><span>字号</span><span class="sv">
      <button class="chip-btn" id="s-minus">−</button><b id="s-fsize">${s.font_size}px</b>
      <button class="chip-btn" id="s-plus">＋</button></span></div>
    <div class="setting-row"><span>行距</span><span class="sv">
      <input type="number" id="s-lh" min="1.2" max="3" step="0.1" value="${s.line_height}"></span></div>
    <div class="setting-row"><span>每页字数</span><span class="sv">
      <input type="number" id="s-page" min="500" max="50000" step="500" value="${s.page_size}"></span></div>
    <div class="setting-row"><span>阅读方式</span><span class="sv">
      ${[['scroll', '连续滚动'], ['page', '仿真翻书']].map(([v, t]) =>
        `<button class="chip-btn ${readMode === v ? 'on' : ''}" data-mode-v="${v}">${t}</button>`).join('')}</span></div>
    <div class="setting-row"><span>翻书动画</span><span class="sv">
      ${[['book', '仿真'], ['slide', '滑动'], ['none', '无动画']].map(([v, t]) =>
        `<button class="chip-btn ${(s.page_effect || 'book') === v ? 'on' : ''}" data-effect-v="${v}">${t}</button>`).join('')}</span></div>
    <div class="setting-row"><span>全屏阅读</span><span class="sv">
      <span class="muted">双击正文 / F11 / Esc</span></span></div>
    <div class="setting-row"><span>全文索引</span><span class="sv">
      <span class="muted">${esc(state.index.kind)}${state.index.tokenizer ? ' / ' + esc(state.index.tokenizer) : ''}</span>
      <button class="chip-btn" id="s-reindex">重建</button></span></div>
    ${isAndroid ? `<label>书库数据（全部保存在本机，卸载会清空）</label>
    <div class="path-box lib-stat">共 <b>${bookCount}</b> 本书 · 原件约 ${humanBytes(totalBytes)}<br>
      书库在本机私有存储，文件管理器里看不到。备份可自己起名字、选保存位置；
      恢复时会自动打开上次备份所在的位置。${lastBackup ? `<br>上次备份：<b>${esc(lastBackup)}</b>` : ''}</div>
    <div class="setting-row"><span>数据管理</span><span class="sv">
      <button class="chip-btn" id="s-export">导出整库备份</button>
      <button class="chip-btn" id="s-import">从备份恢复</button></span></div>` : `<label>书库目录（数据全部在这里，换电脑整个拷走即可）</label>
    <div class="path-box">${esc(state.root)}</div>
    <div class="setting-row"><span>数据管理</span><span class="sv">
      <button class="chip-btn" id="s-export">导出整库</button>
      <button class="chip-btn" id="s-open-dir">打开目录</button></span></div>`}
    ${suggestUrl() ? `<div class="setting-row"><span>意见反馈</span><span class="sv">
      <button class="chip-btn" id="s-suggest">提建议 / 看反馈</button></span></div>` : ''}
    ${isAndroid ? `<div class="setting-row"><span>匿名使用统计</span><span class="sv">
      <button class="chip-btn ${statsOn ? 'on' : ''}" id="s-stats" title="只上报匿名设备号、版本、机型，不含书名与文件">${statsOn ? '已开启' : '已关闭'}</button></span></div>
    <p class="mdesc" style="margin:-6px 0 10px">统计只记录设备数与使用活跃度，不上传书名、路径或书籍内容，可随时关闭。</p>` : ''}
    ${updater ? `<div class="setting-row"><span>应用更新</span><span class="sv">
      <span class="muted">v${esc(appVersion)}</span>
      <button class="chip-btn" id="s-update">检查更新</button></span></div>` : ''}
    <div class="modal-actions"><button id="m-close" class="solid">完成</button></div>`, (m) => {
    const patch = async (p) => { state.settings = await api('set-settings', { patch: p }); applySettings(state.settings); };
    m.querySelectorAll('[data-shelf-v]').forEach((b) => b.onclick = async () => {
      if (b.dataset.shelfV === a.view) return;
      await setShelfAppearance({ view: b.dataset.shelfV }); openSettings();
    });
    m.querySelectorAll('[data-density-v]').forEach((b) => b.onclick = async () => {
      if (b.dataset.densityV === a.density) return;
      await setShelfAppearance({ density: b.dataset.densityV }); openSettings();
    });
    m.querySelectorAll('[data-theme-v]').forEach((b) => b.onclick = async () => {
      await patch({ theme: b.dataset.themeV }); openSettings();
    });
    m.querySelectorAll('[data-font]').forEach((b) => b.onclick = async () => {
      await patch({ font_family: b.dataset.font }); openSettings();
    });
    m.querySelector('#s-minus').onclick = async () => { await changeFont(-2); openSettings(); };
    m.querySelector('#s-plus').onclick = async () => { await changeFont(2); openSettings(); };
    m.querySelector('#s-lh').onchange = async (e) => patch({ line_height: Number(e.target.value) || 1.8 });
    m.querySelector('#s-page').onchange = async (e) => patch({ page_size: Number(e.target.value) || 6000 });
    m.querySelectorAll('[data-mode-v]').forEach((b) => b.onclick = async () => {
      if (b.dataset.modeV === readMode) return;
      await toggleReadMode();
      openSettings();
    });
    m.querySelectorAll('[data-effect-v]').forEach((b) => b.onclick = async () => {
      await patch({ page_effect: b.dataset.effectV });
      openSettings();
    });
    m.querySelector('#s-reindex').onclick = async () => {
      const r = await api('reindex', { full: true }); toast(`索引重建完成：${r.indexed} 本`);
    };
    m.querySelector('#s-export').onclick = () => exportLibrary();
    const openDirBtn = m.querySelector('#s-open-dir');
    if (openDirBtn) openDirBtn.onclick = () => desktop?.openLibraryDir();
    const importBtn = m.querySelector('#s-import');
    if (importBtn) importBtn.onclick = () => {
      closeModal();
      if (lastBackup) toast('已打开上次备份所在位置，选择 .openlib 文件即可');
      $('lib-input').click();
    };
    const suggestBtn = m.querySelector('#s-suggest');
    if (suggestBtn) suggestBtn.onclick = () => {
      closeModal(); switchView('suggest'); renderSuggest();
    };
    const statsBtn = m.querySelector('#s-stats');
    if (statsBtn) statsBtn.onclick = () => {
      const on = !window.AndroidNative.statsOptIn();
      window.AndroidNative.setStatsOptIn(on);
      toast(on ? '已开启匿名使用统计' : '已关闭匿名使用统计');
      openSettings();
    };
    const upBtn = m.querySelector('#s-update');
    if (upBtn) upBtn.onclick = () => { closeModal(); window.AndroidNative.checkUpdate(true); };
    m.querySelector('#m-close').onclick = closeModal;
  });
}
function openAbout() {
  showModal(`<h2>关于 开放书库</h2>
    <p class="mdesc">版本 1.17.1 · 免费、离线、开放格式的个人电子书管理器。<br>
    本软件为独立作品，不隶属于任何第三方阅读器，也不包含任何内置书库。</p>
    <div class="setting-row"><span>数据归属</span><span class="muted">全部在书库目录，可随时拷走</span></div>
    <div class="setting-row"><span>支持格式</span><span class="muted" style="text-align:right">PDF / EPUB / MOBI / AZW3 / DOCX / DOC / RTF / ODT / FB2 / MHTML / TXT / MD / HTML</span></div>
    <div class="setting-row"><span>扫描版 PDF</span><span class="muted">按原页图片连续浏览，无 OCR</span></div>
    <div class="setting-row"><span>求书</span><span class="muted">由维护者统一配置，仅提交与查询时联网</span></div>
    <div class="setting-row"><span>账号 / 收费</span><span class="muted">均无</span></div>
    <div class="setting-row"><span>索引引擎</span><span class="muted">${esc(state.index.kind)}</span></div>
    <p class="mdesc" style="margin-top:16px">原件不改写，<b>.index/</b> 可随时删除重建；
      <b>.openlib</b> 是标准 ZIP，任何解压软件都能打开。书库格式规范与程序一起提供，
      后续 Android 端将直接读取同一份目录。</p>
    <div class="modal-actions"><button id="m-close" class="solid">知道了</button></div>`,
    (m) => { m.querySelector('#m-close').onclick = closeModal; });
}

/* ---------- 事件绑定 ---------- */
function bind() {
  $('btn-import').onclick = () => $('file-input').click();
  $('file-input').onchange = async (e) => { await importFiles([...e.target.files]); e.target.value = ''; };
  $('btn-import-dir').onclick = () => $('dir-input').click();
  $('dir-input').onchange = async (e) => { await importFiles([...e.target.files]); e.target.value = ''; };
  $('btn-import-lib').onclick = () => $('lib-input').click();
  $('lib-input').onchange = async (e) => { if (e.target.files[0]) await importLibrary(e.target.files[0]); e.target.value = ''; };
  const shelfViewBtn = $('btn-shelf-view');
  if (shelfViewBtn) shelfViewBtn.onclick = () => {
    const a = shelfAppearance(state && state.settings);
    setShelfAppearance({ view: a.view === 'list' ? 'grid' : 'list' });
  };
  const shelfDensityBtn = $('btn-shelf-density');
  if (shelfDensityBtn) shelfDensityBtn.onclick = () => cycleShelfDensity();
  $('sort-by').onchange = (e) => setSort({ sort_by: e.target.value });
  $('btn-sort-dir').onclick = () => setSort({ toggle_dir: true });
  $('btn-export-lib').onclick = () => exportLibrary();
  $('btn-reindex').onclick = async () => {
    const r = await api('reindex', { full: true }); toast(`索引重建完成：扫描 ${r.scanned} 本，更新 ${r.indexed} 本`);
  };
  $('btn-settings').onclick = openSettings;
  $('btn-help').onclick = () => {
    $('help-sheet').classList.add('show');
    $('help-sheet').setAttribute('aria-hidden', 'false');
    $('help-mask').classList.add('show');
  };
  const closeHelp = () => {
    $('help-sheet').classList.remove('show');
    $('help-sheet').setAttribute('aria-hidden', 'true');
    $('help-mask').classList.remove('show');
  };
  $('btn-close-help').onclick = closeHelp;
  $('help-mask').onclick = closeHelp;
  // 安卓物理返回键：MainActivity.onBackPressed() 调 window.__orBack()，
  // 返回 true = 前端已处理（原生层不再走"双击退出"）。顺序与 Esc 一致。
  window.__orBack = () => {
    if ($('help-sheet').classList.contains('show')) { closeHelp(); return true; }
    if (!$('modal-mask').classList.contains('hidden')) { closeModal(); return true; }
    if (immersive) { setImmersive(false); return true; }
    if (view === 'reader') { stopScan(); switchView('shelf'); current.id = null; renderAll(); return true; }
    return false;
  };
  $('btn-about').onclick = openAbout;
  $('btn-add-collection').onclick = () => addCollection();
  $('btn-bulk').onclick = () => setBulkMode(!bulkMode);
  $('bulk-exit').onclick = () => setBulkMode(false);
  $('bulk-all').onclick = () => {
    const list = visibleBooks();
    if (bulkSelected.size >= list.length) bulkSelected.clear();
    else list.forEach((b) => bulkSelected.add(b.id));
    renderShelf();
  };
  $('bulk-invert').onclick = () => {
    bulkSelected = new Set(visibleBooks().filter((b) => !bulkSelected.has(b.id)).map((b) => b.id));
    renderShelf();
  };
  $('bulk-cat').onclick = () => {
    if (!bulkSelected.size) { toast('先勾选要整理的书'); return; }
    openCategoryPicker([...bulkSelected]);
  };
  $('bulk-delete').onclick = () => bulkDeleteSelected();
  $('bulk-clear').onclick = async () => {
    if (!bulkSelected.size) { toast('先勾选要整理的书'); return; }
    if (!await askConfirm('移出全部分类',
      '把选中的 ' + bulkSelected.size + ' 本书移出所有分类？书籍本身不会被删除。', true)) return;
    for (const id of bulkSelected) await api('set-book-collections', { id, collectionIds: [] });
    await loadState();
    toast('已移出全部分类');
  };

  document.querySelectorAll('.nav-item').forEach((n) => n.onclick = () => {
    const v = n.dataset.view;
    const from = view;
    filter.collectionId = null;
    if (v === 'bookmarks') { switchView('bookmarks'); }
    else if (v === 'request') { switchView('request'); renderRequest(); }
    else if (v === 'shuku') { switchView('shuku'); renderShuku(); }
    else { filter.nav = v; filter.collectionId = v === 'recent' ? '__recent'
      : v === 'unfiled' ? '__unfiled' : null; switchView('shelf'); }
    renderAll();
    if (from === 'request' && v !== 'request') refreshUnread();  // 看完提醒离开时立刻清零
  });
  window.addEventListener('focus', () => refreshUnread());

  $('btn-back').onclick = () => { stopScan(); switchView('shelf'); current.id = null; renderAll(); };
  $('btn-suggest-back').onclick = () => { switchView('shelf'); renderAll(); };
  $('btn-toc-collapse').onclick = () => {
    $('view-reader').classList.add('toc-collapsed');
    $('btn-toc-expand').classList.remove('hidden');
  };
  $('btn-toc-expand').onclick = () => {
    $('view-reader').classList.remove('toc-collapsed');
    $('btn-toc-expand').classList.add('hidden');
    if (current.chapterId) setActiveChapter(current.chapterId, true);
  };
  const tocFilter = $('toc-filter');
  tocFilter.oninput = () => renderToc(tocFilter.value);
  tocFilter.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = tocFilter.value.trim();
    const n = Number(raw);
    const first = $('toc-list').querySelector('.toc-item');
    const byNumber = /^\d+$/.test(raw) && n >= 1 ? tocChapterForNumber(n) : null;
    const idx = byNumber ? current.chapters.indexOf(byNumber)
      : Number(first?.dataset.index ?? -1);
    tocFilter.value = ''; renderToc();
    if (idx >= 0) gotoChapter(idx, 0);
  };
  $('btn-next').onclick = gotoNext;
  $('btn-prev').onclick = gotoPrev;
  $('btn-read-mode').onclick = toggleReadMode;
  $('btn-immersive').onclick = toggleImmersive;
  $('btn-exit-immersive').onclick = () => setImmersive(false);

  // 滚轮翻页：正文滚到底后继续下滚 → 下一页；回到顶后继续上滚 → 上一页。
  // 扫描版 PDF 本来就是连续滚动页流，不介入，避免和自动追加页打架。
  const contentEl = $('content');

  /* 正文手势：双击 → 全屏；单击左右热区 / 左右滑动 → 翻书页。
     多数 Android WebView 不派发 dblclick（双击被缩放手势吃掉），
     所以统一用 click 的时间戳与位移自己判定，桌面鼠标同样适用。 */
  contentEl.addEventListener('click', (e) => {
    if (view !== 'reader' || !$('modal-mask').classList.contains('hidden')) return;
    if (book.swiped) { book.swiped = false; return; }
    if (e.target && e.target.closest && e.target.closest('button, a, input, select')) return;
    const x = Number(e.clientX) || 0, y = Number(e.clientY) || 0, t = Date.now();
    const near = Math.abs(x - book.lastX) < 34 && Math.abs(y - book.lastY) < 34;
    if (book.tapCount && t - book.lastTap < 360 && near) {
      clearTimeout(book.tapTimer); book.tapTimer = null;
      book.tapCount = 0; book.lastTap = 0;
      toggleImmersive();
      return;
    }
    book.tapCount = 1; book.lastTap = t; book.lastX = x; book.lastY = y;
    clearTimeout(book.tapTimer);
    book.tapTimer = setTimeout(() => {
      book.tapTimer = null; book.tapCount = 0;
      if (!book.active || view !== 'reader') return;
      const w = $('content').clientWidth;
      if (x < w * 0.32) flipPage(-1);
      else if (x > w * 0.68) flipPage(1);
    }, 360);
  });
  let touchStart = null;
  contentEl.addEventListener('touchstart', (e) => {
    touchStart = e.touches.length === 1
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  contentEl.addEventListener('touchend', (e) => {
    if (!touchStart || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (!book.active || view !== 'reader') return;
    if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      book.swiped = true;
      clearTimeout(book.tapTimer); book.tapTimer = null;
      book.tapCount = 0; book.lastTap = 0;
      flipPage(dx < 0 ? 1 : -1);
      setTimeout(() => { book.swiped = false; }, 450);
    }
  }, { passive: true });
  window.addEventListener('resize', scheduleBookRelayout);

  contentEl.addEventListener('wheel', (e) => {
    // 连续滚动模式交给原生滚动，不在边界劫持成「翻页」。
    if (view !== 'reader' || scan.active || stream.active || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('modal-mask').classList.contains('hidden')) return;
    const t = Date.now();
    if (wheel.busy || t < wheel.until) return;
    const dir = Math.sign(e.deltaY);
    if (!dir) return;
    const atEnd = contentEl.scrollTop + contentEl.clientHeight >= contentEl.scrollHeight - 2;
    const atStart = contentEl.scrollTop <= 0;
    if ((dir > 0 && !atEnd) || (dir < 0 && !atStart)) { wheel.dir = dir; wheel.acc = 0; return; }
    if (dir !== wheel.dir) { wheel.dir = dir; wheel.acc = 0; }
    wheel.acc += Math.abs(e.deltaY);
    if (wheel.acc < 120) return;              // 约两格鼠标滚轮，避免误触
    wheel.acc = 0;
    wheel.busy = true;
    e.preventDefault();                       // 抑制边界回弹
    const p = dir > 0 ? gotoNext() : gotoPrev();
    Promise.resolve(p).catch(() => {}).finally(() => {
      wheel.busy = false;
      wheel.until = Date.now() + 600;          // 冷却期内丢弃惯性事件
      wheel.acc = 0;
    });
  }, { passive: false });

  $('btn-font-lg').onclick = () => changeFont(2);
  $('btn-font-sm').onclick = () => changeFont(-2);
  $('btn-theme').onclick = cycleTheme;
  $('btn-export-book').onclick = () => { if (current.id) androidExport('/api/export-book?id=' + encodeURIComponent(current.id)); };
  $('btn-bookmark').onclick = async () => {
    if (!current.id || !current.chapterId) return;
    await api('add-bookmark', { id: current.id, chapter_id: current.chapterId,
      offset: current.offset,
      note: current.chapters.find((c) => c.id === current.chapterId)?.title || '' });
    toast('已添加书签'); await loadState();
  };

  $('search').oninput = (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    filter.q = q;
    renderShelf();
    const box = $('search-result');
    if (!q) { box.classList.add('hidden'); return; }
    searchTimer = setTimeout(async () => {
      try {
        const r = await api('search', { q });
        box.classList.remove('hidden');
        box.innerHTML = `<div class="muted" style="font-size:11px;padding:2px 10px 6px">全文命中 ${r.results.length} 条</div>` +
          (r.results.length ? r.results.map((h) =>
            `<div class="hit" data-id="${esc(h.bookId)}"><b>${esc(h.title)}</b><p>${esc(h.snippet)}</p></div>`).join('')
            : '<div class="hit muted">没有匹配结果</div>');
        box.querySelectorAll('.hit[data-id]').forEach((el) => el.onclick = () => openBook(el.dataset.id));
      } catch (err) { toast('搜索失败：' + err.message); }
    }, 250);
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('help-sheet').classList.contains('show')) { closeHelp(); return; }
      if (!$('modal-mask').classList.contains('hidden')) { closeModal(); return; }
      $('context-menu').classList.add('hidden');
      if (immersive) { setImmersive(false); return; }   // 全屏时 Esc 先退出全屏，不直接回书架
      if (view === 'reader') { stopScan(); switchView('shelf'); current.id = null; renderAll(); }
      return;
    }
    if (e.key === 'F11' || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f')) {
      if (view === 'reader') { e.preventDefault(); toggleImmersive(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('search').focus(); return; }
    if (view !== 'reader' || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); gotoNext(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); gotoPrev(); }
  });

  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    dragDepth++; $('drop-mask').classList.remove('hidden');
  });
  document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop-mask').classList.add('hidden'); } });
  document.addEventListener('drop', async (e) => {
    if (!e.dataTransfer?.files?.length && !e.dataTransfer?.items?.length) return;
    e.preventDefault(); dragDepth = 0; $('drop-mask').classList.add('hidden');
    const files = await collectDroppedFiles(e.dataTransfer);  // 文件夹会被递归展开
    await importFiles(files);
  });

  if (desktop) {
    desktop.onLibraryChanged(() => loadState().catch((e) => toast('刷新失败：' + e.message)));
    desktop.onMenu((action) => {
      const map = {
        'import': () => $('file-input').click(),
        'export-library': () => exportLibrary(),
        'import-library': () => $('lib-input').click(),
        'settings': openSettings, 'about': openAbout,
        'font-up': () => changeFont(2), 'font-down': () => changeFont(-2),
        'theme': cycleTheme, 'reindex': () => api('reindex', { full: true }).then(() => loadState()),
        'back': () => { switchView('shelf'); current.id = null; renderAll(); },
        'bookmark': () => $('btn-bookmark').click(),
        'fullscreen': toggleImmersive,
      };
      map[action]?.();
    });
  }
}

bind();
refreshUnread();        // 启动即查：开 exe 就能看到「求书」上的到货角标
startUnreadPolling();
loadState().catch((e) => { toast('初始化失败：' + e.message); console.error(e); });

/* ---------- 应用内更新（仅安卓；桌面无原生桥时整段静默） ---------- */
const UPDATE_THROTTLE_MS = 24 * 60 * 60 * 1000;
const hasUpdater = () => !!(window.AndroidNative
  && typeof window.AndroidNative.checkUpdate === 'function');

function showUpdateDialog(p) {
  const cur = (document.querySelector('meta[name="or-version"]') || {}).content || '';
  showModal(`<h2>发现新版本 ${esc(p.name || '')}</h2>
    <p class="mdesc">当前版本 ${esc(cur)}　→　${esc(p.name || '')}</p>
    <p class="mdesc">${esc(p.notes || '修复与优化')}</p>
    <p class="mdesc">安装包约 200 KB，覆盖安装不会清空本地书库。首次更新需允许一次「安装未知应用」。</p>
    <div class="modal-actions"><button id="m-cancel">稍后</button>
      <button id="m-update" class="solid">下载并安装</button></div>`, (m) => {
    m.querySelector('#m-cancel').onclick = closeModal;
    m.querySelector('#m-update').onclick = () => {
      closeModal();
      window.AndroidNative.downloadAndInstall(p.url || '', p.sha256 || '');
      toast('正在下载更新…');
    };
  });
}

function showPermissionDialog() {
  showModal(`<h2>需要允许安装</h2>
    <p class="mdesc">系统要求先允许本应用安装未知来源应用。已为你打开设置页，
      勾选「允许」后返回，点下面按钮重试（安装包已下载，不会重复下载）。</p>
    <div class="modal-actions"><button id="m-cancel">取消</button>
      <button id="m-retry" class="solid">重试安装</button></div>`, (m) => {
    m.querySelector('#m-cancel').onclick = closeModal;
    m.querySelector('#m-retry').onclick = () => {
      closeModal(); window.AndroidNative.installNow();
    };
  });
}

/* 原生层回调入口：Java 通过 evaluateJavascript 传入一个 JSON 对象。 */
window.__orUpdateResult = (p) => {
  if (!p || !p.state) return;
  const manual = !!p.manual;
  if (p.state === 'available') { showUpdateDialog(p); return; }
  if (p.state === 'latest') { if (manual) toast('已是最新版本'); return; }
  if (p.state === 'error') {
    // 静默检查失败（站点休眠 / 无网络 / 清单损坏）一律不打扰，手动检查才反馈。
    if (manual) toast(p.message || '检查更新失败，请稍后重试');
    return;
  }
  if (p.state === 'need-permission') { showPermissionDialog(); return; }
  if (p.state === 'downloaded') { toast('下载完成，正在打开安装界面…'); return; }
  if (p.state === 'installing') { toast('已打开安装界面，确认后即完成更新'); return; }
};

/* 启动检查已由安卓原生层 startupUpdateCheck() 接管（强制更新门，每次冷启动都查）。
   前端不再自动发请求，避免同一次启动两个请求、两层弹窗；
   「设置 → 检查更新」手动入口（checkUpdate(true)）仍然可用。 */
function autoCheckUpdate() {
  // Intentionally empty on Android; desktop has no native bridge anyway.
  // Kept as a named hook so the manual path and self-tests stay unchanged.
}
autoCheckUpdate();
