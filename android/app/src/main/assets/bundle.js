(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x2) => x2.done ? resolve(x2.value) : Promise.resolve(x2.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // app/src/main/assets/app.js
  var require_app = __commonJS({
    "app/src/main/assets/app.js"() {
      var $ = (id) => document.getElementById(id);
      var esc = (s) => String(s != null ? s : "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
      var desktop = window.desktopAPI || null;
      var PALETTES = [
        ["#5b7fc7", "#3a569c"],
        ["#7c6bb8", "#544a91"],
        ["#4e9c94", "#2f726c"],
        ["#c08a55", "#96663a"],
        ["#b2657a", "#8a4557"],
        ["#5f8a5b", "#3d633d"],
        ["#4f7fa8", "#2f587d"],
        ["#9a7a4e", "#6f5533"]
      ];
      function paletteOf(id) {
        let h = 0;
        for (const c of String(id)) h = h * 31 + c.charCodeAt(0) >>> 0;
        return PALETTES[h % PALETTES.length];
      }
      var state = null;
      var bookmarks = [];
      var view = "shelf";
      var filter = { nav: "all", collectionId: null, q: "" };
      var current = {
        id: null,
        chapterId: null,
        offset: 0,
        nextOffset: 0,
        total: 0,
        done: true,
        chapterIndex: 0,
        chapterCount: 1,
        chapters: []
      };
      var scan = { active: false, nextIndex: 0, pages: [], observer: null, onScroll: null, ticking: false };
      var stream = {
        active: false,
        blocks: [],
        nextIndex: 0,
        onScroll: null,
        ticking: false,
        loading: false,
        end: false
      };
      var book = {
        active: false,
        pages: [],
        index: 0,
        effect: "book",
        animating: false,
        stage: null,
        front: null,
        base: null,
        measure: null,
        textW: 0,
        textH: 0,
        end: false,
        loading: false,
        cursor: null,
        headCursor: null,
        firstIndex: 0,
        tapTimer: null,
        lastTap: 0,
        lastX: -999,
        lastY: -999,
        tapCount: 0,
        swiped: false,
        resizeTimer: null,
        flipTimer: null
      };
      var HAS_3D = (() => {
        const s = document.documentElement.style;
        return ("transform" in s || "webkitTransform" in s) && ("perspective" in s || "webkitPerspective" in s);
      })();
      var BOOK_FLIP_MS = 400;
      var readMode = "scroll";
      var saveTimer = null;
      var searchTimer = null;
      var wheel = { dir: 0, acc: 0, until: 0, busy: false };
      var immersive = false;
      var SHELF_VIEWS = ["grid", "list"];
      var SHELF_DENSITIES = ["large", "medium", "small"];
      var DEFAULT_SHELF_VIEW = "grid";
      var DEFAULT_SHELF_DENSITY = "medium";
      var DENSITY_LABEL = { large: "\u5927\u56FE", medium: "\u4E2D\u56FE", small: "\u5C0F\u56FE" };
      var bulkMode = false;
      var bulkSelected = /* @__PURE__ */ new Set();
      var longPressTimer = null;
      var longPressFired = false;
      var lastMenuAt = 0;
      function api(_0) {
        return __async(this, arguments, function* (action, body = {}) {
          const r = yield fetch("/api/" + action, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          const j = yield r.json().catch(() => ({ error: "\u54CD\u5E94\u4E0D\u662F JSON" }));
          if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
          return j;
        });
      }
      function toast(msg) {
        const el = $("toast");
        el.textContent = msg;
        el.classList.add("show");
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove("show"), 2500);
      }
      function applySettings(s) {
        document.body.dataset.theme = s.theme || "light";
        const c = $("content");
        c.style.fontSize = (s.font_size || 18) + "px";
        c.style.lineHeight = String(s.line_height || 1.8);
        c.style.fontFamily = s.font_family === "sans" ? '"Microsoft YaHei", "PingFang SC", sans-serif' : 'Georgia, "Microsoft YaHei", "PingFang SC", serif';
        readMode = s.read_mode === "page" ? "page" : "scroll";
        book.effect = s.page_effect === "slide" || s.page_effect === "none" ? s.page_effect : "book";
        if (book.effect === "book" && !HAS_3D) book.effect = "slide";
        const modeBtn = $("btn-read-mode");
        if (modeBtn) {
          modeBtn.textContent = readMode === "scroll" ? "\u21C5 \u8FDE\u7EED" : "\u25A4 \u7FFB\u4E66";
          modeBtn.title = readMode === "scroll" ? "\u5F53\u524D\uFF1A\u8FDE\u7EED\u6EDA\u52A8\uFF08\u4E0A\u4E0B\u6ED1\u52A8\u81EA\u52A8\u7EED\u7AE0\uFF09\uFF0C\u70B9\u6B64\u5207\u6362\u4E3A\u4EFF\u771F\u7FFB\u4E66" : "\u5F53\u524D\uFF1A\u4EFF\u771F\u7FFB\u4E66\uFF08\u5DE6\u53F3\u6ED1\u52A8 / \u70B9\u5C4F\u5E55\u4E24\u4FA7\u7FFB\u9875\uFF09\uFF0C\u70B9\u6B64\u5207\u6362\u4E3A\u8FDE\u7EED\u6EDA\u52A8";
        }
        if (book.active) scheduleBookRelayout();
        applyShelfAppearance(s);
      }
      function shelfAppearance(s) {
        const o = s || {};
        return {
          view: SHELF_VIEWS.indexOf(o.shelf_view) >= 0 ? o.shelf_view : DEFAULT_SHELF_VIEW,
          density: SHELF_DENSITIES.indexOf(o.shelf_density) >= 0 ? o.shelf_density : DEFAULT_SHELF_DENSITY
        };
      }
      function applyShelfAppearance(s) {
        const a = shelfAppearance(s);
        document.body.dataset.shelfView = a.view;
        document.body.dataset.shelfDensity = a.density;
        const vb = $("btn-shelf-view");
        if (vb) {
          vb.textContent = a.view === "list" ? "\u2630 \u5217\u8868" : "\u25A6 \u7F51\u683C";
          vb.title = a.view === "list" ? "\u5F53\u524D\uFF1A\u7D27\u51D1\u5217\u8868\uFF08\u4E00\u884C\u4E00\u672C\uFF09\uFF0C\u70B9\u6B64\u5207\u6362\u4E3A\u5C01\u9762\u7F51\u683C" : "\u5F53\u524D\uFF1A\u5C01\u9762\u7F51\u683C\uFF0C\u70B9\u6B64\u5207\u6362\u4E3A\u7D27\u51D1\u5217\u8868\uFF08\u4E00\u884C\u4E00\u672C\uFF09";
        }
        const db = $("btn-shelf-density");
        if (db) {
          const label = DENSITY_LABEL[a.density];
          db.textContent = "\u5C3A\u5BF8 " + label;
          db.title = a.view === "list" ? "\u5217\u8868\u89C6\u56FE\u884C\u9AD8\u56FA\u5B9A\uFF0C\u5148\u5207\u56DE\u5C01\u9762\u7F51\u683C\u624D\u80FD\u8C03\u5C3A\u5BF8" : "\u5F53\u524D\uFF1A" + label + "\uFF0C\u70B9\u6B64\u5FAA\u73AF\u5207\u6362\u5927 / \u4E2D / \u5C0F";
          db.disabled = a.view === "list";
        }
      }
      var shelfSave = Promise.resolve();
      function setShelfAppearance(patch) {
        shelfSave = shelfSave.then(() => __async(null, null, function* () {
          const cur = shelfAppearance(state && state.settings);
          const next = { shelf_view: patch.view || cur.view, shelf_density: patch.density || cur.density };
          state.settings = yield api("set-settings", { patch: next });
          applyShelfAppearance(state.settings);
          renderShelf();
        })).catch((e) => toast("\u4E66\u67B6\u6837\u5F0F\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message));
        return shelfSave;
      }
      function cycleShelfDensity() {
        const a = shelfAppearance(state && state.settings);
        const next = SHELF_DENSITIES[(SHELF_DENSITIES.indexOf(a.density) + 1) % SHELF_DENSITIES.length];
        return setShelfAppearance({ density: next });
      }
      function changeFont(delta) {
        return __async(this, null, function* () {
          const size = Math.max(14, Math.min(32, (state.settings.font_size || 18) + delta));
          state.settings = yield api("set-settings", { patch: { font_size: size } });
          applySettings(state.settings);
        });
      }
      function cycleTheme() {
        return __async(this, null, function* () {
          const order = ["light", "sepia", "dark"];
          const next = order[(order.indexOf(state.settings.theme || "light") + 1) % order.length];
          state.settings = yield api("set-settings", { patch: { theme: next } });
          applySettings(state.settings);
          toast("\u4E3B\u9898\uFF1A" + { light: "\u660E\u4EAE", sepia: "\u62A4\u773C", dark: "\u6DF1\u591C" }[next]);
        });
      }
      function showModal(html, onMount) {
        $("modal").innerHTML = html;
        $("modal-mask").classList.remove("hidden");
        if (onMount) onMount($("modal"));
      }
      function closeModal() {
        $("modal-mask").classList.add("hidden");
      }
      $("modal-mask").addEventListener("click", (e) => {
        if (e.target === $("modal-mask")) closeModal();
      });
      function askText(title, label, def = "") {
        return new Promise((resolve) => {
          showModal(
            `<h2>${esc(title)}</h2><p class="mdesc">${esc(label)}</p>
      <input type="text" id="m-input" value="${esc(def)}" autocomplete="off">
      <div class="modal-actions"><button id="m-cancel">\u53D6\u6D88</button><button id="m-ok" class="solid">\u786E\u5B9A</button></div>`,
            (m) => {
              const inp = m.querySelector("#m-input");
              inp.focus();
              inp.select();
              const done = (v) => {
                closeModal();
                resolve(v);
              };
              m.querySelector("#m-ok").onclick = () => done(inp.value.trim());
              m.querySelector("#m-cancel").onclick = () => done(null);
              inp.onkeydown = (e) => {
                if (e.key === "Enter") done(inp.value.trim());
                if (e.key === "Escape") done(null);
              };
            }
          );
        });
      }
      function askConfirm(title, desc, danger = false) {
        return new Promise((resolve) => {
          showModal(
            `<h2>${esc(title)}</h2><p class="mdesc">${esc(desc)}</p>
      <div class="modal-actions"><button id="m-cancel">\u53D6\u6D88</button>
      <button id="m-ok" class="solid" ${danger ? 'style="background:#cf4b4b;border-color:#cf4b4b"' : ""}>\u786E\u5B9A</button></div>`,
            (m) => {
              m.querySelector("#m-ok").onclick = () => {
                closeModal();
                resolve(true);
              };
              m.querySelector("#m-cancel").onclick = () => {
                closeModal();
                resolve(false);
              };
            }
          );
        });
      }
      function loadState() {
        return __async(this, null, function* () {
          state = yield api("state");
          bookmarks = yield api("list-bookmarks");
          applySettings(state.settings);
          $("lib-path").textContent = "\u4E66\u5E93\uFF1A" + state.root;
          $("lib-path").title = state.root + "\n\u7D22\u5F15\u5F15\u64CE\uFF1A" + state.index.kind + (state.index.tokenizer ? " / " + state.index.tokenizer : "");
          renderNavCounts();
          renderCollections();
          renderShelf();
          renderBookmarks();
        });
      }
      function allBooks() {
        return (state == null ? void 0 : state.books) || [];
      }
      var zhCollator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });
      function sortValue(b, by) {
        var _a2;
        switch (by) {
          case "title":
            return String(b.title || "");
          case "author":
            return String(b.author || "");
          case "size":
            return Number(b.size_bytes) || 0;
          case "recent":
            return String(((_a2 = b.progress) == null ? void 0 : _a2.updated_at) || "");
          case "format":
            return String(b.format || "");
          case "chapters":
            return Number(b.chapterCount) || 0;
          default:
            return String(b.added_at || "");
        }
      }
      function sortBooks(list, fallback = null) {
        const s = (state == null ? void 0 : state.settings) || {};
        const by = (fallback == null ? void 0 : fallback.by) || s.sort_by || "added";
        const dir = ((fallback == null ? void 0 : fallback.dir) || s.sort_dir || "asc") === "desc" ? -1 : 1;
        const blank = (v) => v === "" || v == null;
        return [...list].sort((a, b) => {
          const x2 = sortValue(a, by), y = sortValue(b, by);
          const tie = zhCollator.compare(String(a.title || ""), String(b.title || ""));
          if (blank(x2) && blank(y)) return tie;
          if (blank(x2)) return 1;
          if (blank(y)) return -1;
          const r = typeof x2 === "number" ? Math.sign(x2 - y) : zhCollator.compare(String(x2), String(y));
          return (r || tie) * dir;
        });
      }
      var sortSave = Promise.resolve();
      function setSort(patch) {
        sortSave = sortSave.then(() => __async(null, null, function* () {
          const cur = (state == null ? void 0 : state.settings) || {};
          const next = __spreadValues(__spreadValues({}, cur), patch);
          if (patch.toggle_dir) {
            next.sort_dir = (cur.sort_dir || "asc") === "asc" ? "desc" : "asc";
            delete next.toggle_dir;
          }
          state.settings = yield api("set-settings", {
            patch: { sort_by: next.sort_by || "added", sort_dir: next.sort_dir || "asc" }
          });
          renderShelf();
        })).catch((e) => toast("\u6392\u5E8F\u8BBE\u7F6E\u4FDD\u5B58\u5931\u8D25\uFF1A" + e.message));
        return sortSave;
      }
      function visibleBooks() {
        var _a2;
        let list = allBooks();
        const cid = filter.collectionId;
        if (cid === "__recent") {
          list = list.filter((b) => {
            var _a3;
            return ((_a3 = b.progress) == null ? void 0 : _a3.percent) > 0;
          });
        } else if (cid === "__unfiled") {
          list = list.filter((b) => !(b.collection_ids || []).length);
        } else if (cid) {
          list = list.filter((b) => (b.collection_ids || []).includes(cid));
        }
        if (filter.q) {
          const q = filter.q.toLowerCase();
          list = list.filter((b) => (b.title || "").toLowerCase().includes(q) || (b.author || "").toLowerCase().includes(q));
        }
        const fallback = cid === "__recent" && !((_a2 = state == null ? void 0 : state.settings) == null ? void 0 : _a2.sort_by) ? { by: "recent", dir: "desc" } : null;
        return sortBooks(list, fallback);
      }
      function flatten(nodes, depth = 0, out = []) {
        for (const n of nodes || []) {
          out.push(__spreadProps(__spreadValues({}, n), { depth }));
          flatten(n.children, depth + 1, out);
        }
        return out;
      }
      function collectionName(id) {
        var _a2, _b2;
        return ((_b2 = flatten(((_a2 = state.collections) == null ? void 0 : _a2.root) || []).find((n) => n.id === id)) == null ? void 0 : _b2.name) || "\u672A\u547D\u540D\u5206\u7C7B";
      }
      function renderNavCounts() {
        const bs = allBooks();
        $("count-all").textContent = bs.length;
        $("count-recent").textContent = bs.filter((b) => {
          var _a2;
          return ((_a2 = b.progress) == null ? void 0 : _a2.percent) > 0;
        }).length;
        $("count-bookmarks").textContent = bookmarks.length;
        $("count-unfiled").textContent = bs.filter((b) => !(b.collection_ids || []).length).length;
      }
      function renderCollections() {
        var _a2;
        const box = $("collections");
        const nodes = flatten(((_a2 = state.collections) == null ? void 0 : _a2.root) || []);
        if (!nodes.length) {
          box.innerHTML = '<div class="col-empty">\u8FD8\u6CA1\u6709\u5206\u7C7B\uFF0C\u70B9 \uFF0B \u65B0\u5EFA\u4E00\u4E2A</div>';
          return;
        }
        box.innerHTML = nodes.map((n) => {
          const num = allBooks().filter((b) => (b.collection_ids || []).includes(n.id)).length;
          return `<div class="col-node${filter.collectionId === n.id ? " active" : ""}"
      data-id="${esc(n.id)}" style="padding-left:${10 + n.depth * 14}px" title="${esc(n.name)}">
      <span class="dot"></span><span class="cname">${n.hidden ? "\u{1F512} " : ""}${esc(n.name)}</span>
      <span class="cnum">${num}</span><button class="cog" data-cog="${esc(n.id)}">\u22EF</button></div>`;
        }).join("");
        box.querySelectorAll(".col-node").forEach((el) => {
          el.onclick = (e) => {
            if (e.target.dataset.cog) return;
            filter.nav = "collection";
            filter.collectionId = el.dataset.id;
            switchView("shelf");
            renderAll();
          };
          el.ondragover = (e) => {
            e.preventDefault();
            el.style.background = "var(--accent-soft)";
          };
          el.ondragleave = () => {
            el.style.background = "";
          };
          el.ondrop = (e) => __async(null, null, function* () {
            e.preventDefault();
            el.style.background = "";
            const id = e.dataTransfer.getData("text/book-id");
            if (!id) return;
            const b = allBooks().find((x2) => x2.id === id);
            if (!b) return;
            const ids = [.../* @__PURE__ */ new Set([...b.collection_ids || [], el.dataset.id])];
            yield api("set-book-collections", { id, collectionIds: ids });
            toast(`\u5DF2\u52A0\u5165\u300C${collectionName(el.dataset.id)}\u300D`);
            yield loadState();
          });
        });
        box.querySelectorAll("[data-cog]").forEach((btn) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            collectionMenu(e, btn.dataset.cog);
          };
        });
      }
      function coverHtml(b) {
        var _a2;
        const [c1, c2] = paletteOf(b.id);
        const pct = Math.round((((_a2 = b.progress) == null ? void 0 : _a2.percent) || 0) * 100);
        const img = b.hasCover ? `<img class="cover-img" src="/api/cover?id=${encodeURIComponent(b.id)}" alt="">` : "";
        return `<div class="book-card" data-id="${esc(b.id)}" draggable="true">
    <span class="bulk-check" aria-hidden="true">\u2713</span>
    <div class="cover${b.hasCover ? " has-img" : ""}" style="--c1:${c1};--c2:${c2}">
      ${img}<span class="badge">${esc((b.format || "txt").toUpperCase())}</span>
      <div class="ct">${esc(b.title)}</div>
      <div class="cf">${esc(b.author || b.chapterCount + " \u7AE0")}</div>
    </div>
    <div class="card-title" title="${esc(b.title)}">${esc(b.title)}</div>
    <div class="card-sub">${b.chapterCount} \u7AE0 \xB7 ${(b.size_bytes / 1024).toFixed(1)} KB${pct ? " \xB7 \u5DF2\u8BFB " + pct + "%" : ""}</div>
    <div class="bar"><div style="width:${pct}%"></div></div>
  </div>`;
      }
      function listCardHtml(b) {
        var _a2;
        const [c1, c2] = paletteOf(b.id);
        const pct = Math.round((((_a2 = b.progress) == null ? void 0 : _a2.percent) || 0) * 100);
        const img = b.hasCover ? `<img class="cover-img" src="/api/cover?id=${encodeURIComponent(b.id)}" alt="">` : "";
        const initial = esc((b.title || "\u4E66").trim().charAt(0) || "\u4E66");
        return `<div class="book-card list-card" data-id="${esc(b.id)}" draggable="true">
    <span class="bulk-check" aria-hidden="true">\u2713</span>
    <div class="list-cover${b.hasCover ? " has-img" : ""}" style="--c1:${c1};--c2:${c2}">
      ${img}<span class="list-initial">${initial}</span>
    </div>
    <div class="list-main">
      <div class="list-title" title="${esc(b.title)}">${esc(b.title)}</div>
      <div class="list-author">${esc(b.author || "\u4F5A\u540D")} \xB7 ${esc((b.format || "txt").toUpperCase())}</div>
      <div class="list-sub">${b.chapterCount} \u7AE0 \xB7 ${(b.size_bytes / 1024).toFixed(1)} KB${pct ? " \xB7 \u5DF2\u8BFB " + pct + "%" : ""}</div>
      <div class="bar"><div style="width:${pct}%"></div></div>
    </div>
    <span class="list-arrow">\u203A</span>
  </div>`;
      }
      function renderShelf() {
        const list = visibleBooks();
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        const grid = $("shelf-grid");
        const cid = filter.collectionId;
        const s = (state == null ? void 0 : state.settings) || {};
        const sb = $("sort-by");
        if (sb) {
          sb.value = s.sort_by || "added";
          const desc = (s.sort_dir || "asc") === "desc";
          $("btn-sort-dir").textContent = desc ? "\u2193 \u964D\u5E8F" : "\u2191 \u5347\u5E8F";
          $("btn-sort-dir").title = desc ? "\u5F53\u524D\u964D\u5E8F\uFF0C\u70B9\u51FB\u5207\u6362\u4E3A\u5347\u5E8F" : "\u5F53\u524D\u5347\u5E8F\uFF0C\u70B9\u51FB\u5207\u6362\u4E3A\u964D\u5E8F";
        }
        const titles = { __recent: "\u6700\u8FD1\u9605\u8BFB", __unfiled: "\u672A\u5206\u7C7B" };
        $("shelf-title").textContent = cid === "__recent" ? "\u6700\u8FD1\u9605\u8BFB" : cid === "__unfiled" ? "\u672A\u5206\u7C7B" : cid ? collectionName(cid) : "\u5168\u90E8\u4E66\u7C4D";
        $("shelf-sub").textContent = `${list.length} \u672C \xB7 \u539F\u4EF6\u539F\u6837\u4FDD\u7559\uFF0C\u7D22\u5F15\u53EF\u968F\u65F6\u91CD\u5EFA`;
        if (!list.length) {
          grid.innerHTML = `<div class="empty-state"><div class="big">\u25A4</div>
      <h2>${allBooks().length ? "\u8FD9\u91CC\u8FD8\u6CA1\u6709\u4E66" : "\u4E66\u5E93\u8FD8\u662F\u7A7A\u7684"}</h2>
      <p>${allBooks().length ? "\u6362\u4E2A\u5206\u7C7B\u770B\u770B\uFF0C\u6216\u957F\u6309\u4E66\u5361\uFF08\u7535\u8111\u4E0A\u70B9\u53F3\u952E\uFF09\u628A\u5B83\u52A0\u5165\u5206\u7C7B\u3002" : "\u70B9\u5DE6\u4E0A\u89D2\u300C\u5BFC\u5165\u4E66\u7C4D\u300D\uFF0C\u6216\u76F4\u63A5\u628A\u6587\u4EF6\u62D6\u8FDB\u7A97\u53E3\u3002<br>\u652F\u6301 PDF / EPUB / MOBI / DOCX / DOC / RTF / ODT / FB2 / TXT \u7B49\u3002"}</p></div>`;
          return;
        }
        const appearance = shelfAppearance(s);
        grid.innerHTML = list.map(appearance.view === "list" ? listCardHtml : coverHtml).join("");
        grid.querySelectorAll(".cover-img").forEach((im) => {
          im.onerror = () => {
            const box = im.parentNode;
            if (box) box.classList.remove("has-img");
            im.remove();
          };
        });
        grid.querySelectorAll(".book-card").forEach((el) => {
          const id = el.dataset.id;
          el.classList.toggle("bulk-on", bulkSelected.has(id));
          el.onclick = (e) => {
            if (longPressFired) {
              longPressFired = false;
              e.stopPropagation();
              return;
            }
            if (bulkMode) {
              toggleBulk(id);
              return;
            }
            openBook(id);
          };
          el.oncontextmenu = (e) => {
            e.preventDefault();
            bookMenu(e, id);
          };
          el.ondragstart = (e) => {
            e.dataTransfer.setData("text/book-id", id);
            e.dataTransfer.effectAllowed = "move";
          };
          bindLongPress(el, id);
        });
        const bar = $("bulk-bar");
        if (bar) {
          bar.classList.toggle("hidden", !bulkMode);
          $("bulk-count").textContent = "\u5DF2\u9009 " + bulkSelected.size + " \u672C";
          $("btn-bulk").textContent = bulkMode ? "\u2611 \u6574\u7406\u4E2D" : "\u2611 \u6279\u91CF\u6574\u7406";
        }
      }
      function renderBookmarks() {
        const box = $("bookmark-list");
        if (!bookmarks.length) {
          box.innerHTML = '<div class="empty-state"><div class="big">\u2606</div><h2>\u8FD8\u6CA1\u6709\u4E66\u7B7E</h2><p>\u9605\u8BFB\u65F6\u70B9\u53F3\u4E0A\u89D2\u300C\u2606 \u4E66\u7B7E\u300D\u5373\u53EF\u8BB0\u5F55\u5F53\u524D\u4F4D\u7F6E\u3002</p></div>';
          return;
        }
        box.innerHTML = bookmarks.map((b) => `<div class="bm-item" data-book="${esc(b.bookId)}"
      data-chapter="${esc(b.chapter_id || "")}" data-offset="${Number(b.offset) || 0}">
      <span class="bm-icon">\u2606</span><div class="bm-main"><b>${esc(b.note || b.bookTitle)}</b>
      <small>${esc(b.bookTitle)} \xB7 ${esc(String(b.created_at || "").replace("T", " ").slice(0, 16))}</small></div>
      <button class="bm-del" data-del="${esc(b.id)}" data-book-del="${esc(b.bookId)}" title="\u5220\u9664\u4E66\u7B7E">\u2715</button></div>`).join("");
        box.querySelectorAll(".bm-item").forEach((el) => {
          el.onclick = (e) => {
            if (e.target.dataset.del) return;
            openBook(el.dataset.book, el.dataset.chapter || null, Number(el.dataset.offset) || 0);
          };
        });
        box.querySelectorAll("[data-del]").forEach((btn) => {
          btn.onclick = (e) => __async(null, null, function* () {
            e.stopPropagation();
            yield api("remove-bookmark", { id: btn.dataset.bookDel, bookmarkId: btn.dataset.del });
            toast("\u4E66\u7B7E\u5DF2\u5220\u9664");
            yield loadState();
          });
        });
      }
      function renderAll() {
        renderNavCounts();
        renderCollections();
        renderShelf();
        renderBookmarks();
      }
      function setImmersive(on) {
        var _a2;
        if (on && view !== "reader") {
          toast("\u8BF7\u5148\u6253\u5F00\u4E00\u672C\u4E66\u518D\u8FDB\u5165\u5168\u5C4F\u9605\u8BFB");
          return;
        }
        const c = $("content");
        const ratio = book.active || c.scrollHeight <= c.clientHeight ? 0 : c.scrollTop / (c.scrollHeight - c.clientHeight);
        immersive = !!on;
        document.body.classList.toggle("immersive", immersive);
        (_a2 = desktop == null ? void 0 : desktop.setFullscreen) == null ? void 0 : _a2.call(desktop, immersive);
        requestAnimationFrame(() => {
          if (!book.active && c.scrollHeight > c.clientHeight) {
            c.scrollTop = ratio * (c.scrollHeight - c.clientHeight);
          }
        });
        if (immersive) toast("\u5168\u5C4F\u9605\u8BFB \xB7 \u53CC\u51FB\u6B63\u6587 / F11 / Esc \u9000\u51FA");
        scheduleBookRelayout();
      }
      function toggleImmersive() {
        setImmersive(!immersive);
      }
      function switchView(v) {
        view = v;
        if (v !== "shelf" && bulkMode) {
          bulkMode = false;
          bulkSelected.clear();
          document.body.classList.remove("bulk-mode");
          const bar = $("bulk-bar");
          if (bar) bar.classList.add("hidden");
          const btn = $("btn-bulk");
          if (btn) btn.textContent = "\u2611 \u6279\u91CF\u6574\u7406";
        }
        if (v !== "reader" && immersive) setImmersive(false);
        if (v !== "reader") {
          stopStream();
          stopBook();
        }
        $("view-shelf").classList.toggle("hidden", v !== "shelf");
        $("view-bookmarks").classList.toggle("hidden", v !== "bookmarks");
        $("view-reader").classList.toggle("hidden", v !== "reader");
        $("view-request").classList.toggle("hidden", v !== "request");
        $("view-shuku").classList.toggle("hidden", v !== "shuku");
        $("view-suggest").classList.toggle("hidden", v !== "suggest");
        document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === {
          shelf: filter.nav,
          bookmarks: "bookmarks",
          request: "request",
          shuku: "shuku",
          suggest: "suggest"
        }[v]));
      }
      function qiushuUrl() {
        var _a2;
        const u = String(((_a2 = state == null ? void 0 : state.settings) == null ? void 0 : _a2.qiushu_url) || "").trim();
        return /^https?:\/\//i.test(u) ? u : "";
      }
      function renderRequest() {
        const box = $("request-body");
        const url = qiushuUrl();
        if (!url) {
          box.innerHTML = `<div class="empty-state"><div class="big">\u270E</div>
      <h2>\u6C42\u4E66\u901A\u9053\u6682\u672A\u914D\u7F6E</h2>
      <p>\u8BF7\u8054\u7CFB\u4E66\u5E93\u7EF4\u62A4\u8005\u5F00\u542F\u5728\u7EBF\u6C42\u4E66\u3002</p></div>`;
          return;
        }
        if (desktop) {
          box.innerHTML = "";
          const wv = document.createElement("webview");
          wv.className = "request-webview";
          wv.setAttribute("partition", "persist:qiushu");
          wv.setAttribute("allowpopups", "");
          wv.src = url;
          wv.addEventListener("dom-ready", () => {
            var _a2;
            (_a2 = desktop.armWebview) == null ? void 0 : _a2.call(desktop, wv.getWebContentsId());
            setTimeout(refreshUnread, 600);
          });
          wv.addEventListener("did-fail-load", (e) => {
            if (e.errorCode === -3) return;
            toast("\u6C42\u4E66\u9875\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u65B0\u70B9\u300C\u6C42\u4E66\u300D");
          });
          box.appendChild(wv);
        } else {
          box.innerHTML = `<iframe class="request-frame" src="${esc(url)}" referrerpolicy="no-referrer"></iframe>
      <p class="request-tip">\u6C42\u4E66\u9875\u82E5\u663E\u793A\u7A7A\u767D\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u76F4\u63A5\u7528\u6D4F\u89C8\u5668\u6253\u5F00\u3002</p>`;
        }
      }
      function shukuUrl() {
        var _a2;
        const u = String(((_a2 = state == null ? void 0 : state.settings) == null ? void 0 : _a2.shuku_url) || "").trim();
        return /^https?:\/\//i.test(u) ? u : "";
      }
      function renderShuku() {
        const box = $("shuku-body");
        const url = shukuUrl();
        if (!url) {
          box.innerHTML = `<div class="empty-state"><div class="big">\u2601</div>
      <h2>\u4E91\u4E66\u5E93\u6682\u672A\u914D\u7F6E</h2>
      <p>\u8BF7\u8054\u7CFB\u4E66\u5E93\u7EF4\u62A4\u8005\u5F00\u542F\u5728\u7EBF\u4E66\u5E93\u3002</p></div>`;
          return;
        }
        if (desktop) {
          box.innerHTML = "";
          const wv = document.createElement("webview");
          wv.className = "request-webview";
          wv.setAttribute("partition", "persist:qiushu");
          wv.setAttribute("allowpopups", "");
          wv.src = url;
          wv.addEventListener("dom-ready", () => {
            var _a2;
            (_a2 = desktop.armWebview) == null ? void 0 : _a2.call(desktop, wv.getWebContentsId());
          });
          wv.addEventListener("did-fail-load", (e) => {
            if (e.errorCode === -3) return;
            toast("\u4E91\u4E66\u5E93\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u65B0\u70B9\u300C\u4E91\u4E66\u5E93\u300D");
          });
          box.appendChild(wv);
        } else {
          box.innerHTML = `<iframe class="request-frame" src="${esc(url)}" referrerpolicy="no-referrer"></iframe>
      <p class="request-tip">\u4E91\u4E66\u5E93\u82E5\u663E\u793A\u7A7A\u767D\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u76F4\u63A5\u7528\u6D4F\u89C8\u5668\u6253\u5F00\u3002</p>`;
        }
      }
      function suggestUrl() {
        var _a2;
        const u = String(((_a2 = state == null ? void 0 : state.settings) == null ? void 0 : _a2.suggest_url) || "").trim();
        return /^https?:\/\//i.test(u) ? u : "";
      }
      function renderSuggest() {
        const box = $("suggest-body");
        const url = suggestUrl();
        if (!url) {
          box.innerHTML = `<div class="empty-state"><div class="big">\u270E</div>
      <h2>\u53CD\u9988\u901A\u9053\u6682\u672A\u914D\u7F6E</h2><p>\u8BF7\u8054\u7CFB\u4E66\u5E93\u7EF4\u62A4\u8005\u5F00\u542F\u5728\u7EBF\u53CD\u9988\u3002</p></div>`;
          return;
        }
        const ver = (document.querySelector('meta[name="or-version"]') || {}).content || "desktop";
        const target = url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(ver);
        if (desktop) {
          box.innerHTML = "";
          const wv = document.createElement("webview");
          wv.className = "request-webview";
          wv.setAttribute("partition", "persist:qiushu");
          wv.setAttribute("allowpopups", "");
          wv.src = target;
          wv.addEventListener("dom-ready", () => {
            var _a2;
            (_a2 = desktop.armWebview) == null ? void 0 : _a2.call(desktop, wv.getWebContentsId());
          });
          wv.addEventListener("did-fail-load", (e) => {
            if (e.errorCode !== -3) toast("\u53CD\u9988\u9875\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u65B0\u6253\u5F00");
          });
          box.appendChild(wv);
        } else {
          box.innerHTML = `<iframe class="request-frame" src="${esc(target)}" referrerpolicy="no-referrer"></iframe>
      <p class="request-tip">\u53CD\u9988\u9875\u82E5\u663E\u793A\u7A7A\u767D\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u65B0\u70B9\u300C\u8BBE\u7F6E \u2192 \u610F\u89C1\u53CD\u9988\u300D\u3002</p>`;
        }
      }
      var unreadTimer = null;
      function paintUnread(n) {
        const b = $("badge-qiushu");
        if (!b) return;
        const v = Math.max(0, Number(n) || 0);
        b.textContent = v > 99 ? "99+" : String(v);
        b.classList.toggle("hidden", v === 0);
      }
      function refreshUnread() {
        return __async(this, null, function* () {
          if (!(desktop == null ? void 0 : desktop.qiushuUnread)) return;
          try {
            const r = yield desktop.qiushuUnread();
            if (r && r.ok) paintUnread(r.unread_count);
          } catch (e) {
          }
        });
      }
      function startUnreadPolling() {
        if (unreadTimer) clearInterval(unreadTimer);
        unreadTimer = setInterval(() => {
          if (!document.hidden) refreshUnread();
        }, 15e3);
      }
      function closeTocOnMobile() {
        if (!window.AndroidNative) return;
        const v = $("view-reader");
        if (!v || v.classList.contains("toc-collapsed")) return;
        v.classList.add("toc-collapsed");
        const btn = $("btn-toc-expand");
        if (btn) btn.classList.remove("hidden");
      }
      function renderToc(q = "") {
        const list = $("toc-list");
        const key = String(q || "").trim().toLowerCase();
        const numeric = /^\d+$/.test(key);
        $("toc-count").textContent = current.chapters.length ? current.chapters.length + " \u7AE0" : "\u65E0\u7AE0\u8282";
        const items = current.chapters.map((c, i2) => ({ c, i: i2 })).filter(({ c, i: i2 }) => {
          var _a2;
          return !key || (numeric ? String(i2 + 1).startsWith(key) || c.num != null && (String(c.num).startsWith(key) || String((_a2 = c.numEnd) != null ? _a2 : c.num).startsWith(key)) : (c.title || "").toLowerCase().includes(key));
        });
        if (!items.length) {
          list.innerHTML = `<div class="toc-empty">${current.chapters.length ? "\u6CA1\u6709\u5339\u914D\u7684\u7AE0\u8282" : "\u8FD9\u672C\u4E66\u6CA1\u6709\u53EF\u89E3\u6790\u6B63\u6587"}</div>`;
          return;
        }
        list.innerHTML = items.map(({ c, i: i2 }) => `<div class="toc-item${c.id === current.chapterId ? " active" : ""}"
      data-id="${esc(c.id)}" data-index="${i2}" title="${esc(c.title)}">
      <span class="toc-num">${i2 + 1}</span><span class="toc-name">${esc(c.title)}</span></div>`).join("");
        list.querySelectorAll(".toc-item").forEach((el) => {
          el.onclick = () => {
            $("toc-filter").value = "";
            renderToc();
            gotoChapter(Number(el.dataset.index), 0);
          };
        });
      }
      function tocChapterForNumber(n) {
        const hit = current.chapters.find((c) => {
          var _a2;
          return c.num != null && n >= c.num && n <= ((_a2 = c.numEnd) != null ? _a2 : c.num);
        });
        return hit || (n >= 1 && n <= current.chapterCount ? current.chapters[n - 1] : null);
      }
      function setActiveChapter(chapterId, scrollToc = true) {
        const list = $("toc-list");
        let el = null;
        list.querySelectorAll(".toc-item").forEach((n) => {
          const on = n.dataset.id === chapterId;
          n.classList.toggle("active", on);
          if (on) el = n;
        });
        if (!el || !scrollToc) return;
        const lr = list.getBoundingClientRect(), er = el.getBoundingClientRect();
        if (er.top < lr.top + 4 || er.bottom > lr.bottom - 4)
          list.scrollTop += er.top - lr.top - lr.height / 2 + er.height / 2;
      }
      function chapterImageUrl(c) {
        return `/api/page-image?id=${encodeURIComponent(current.id)}&chapterId=${encodeURIComponent(c.id)}`;
      }
      function stopScan() {
        if (scan.observer) {
          scan.observer.disconnect();
          scan.observer = null;
        }
        if (scan.onScroll) {
          $("content").removeEventListener("scroll", scan.onScroll);
          scan.onScroll = null;
        }
        scan.active = false;
        scan.pages = [];
        scan.nextIndex = 0;
        scan.ticking = false;
        $("content").classList.remove("scan-stream");
      }
      function makeScanPage(i2) {
        const c = current.chapters[i2];
        const box = document.createElement("div");
        box.className = "scan-page";
        box.dataset.index = String(i2);
        box.dataset.chapterId = c.id;
        box.innerHTML = `<img data-src="${esc(chapterImageUrl(c))}" alt="${esc(c.title)}">
    <span class="scan-label">${esc(c.title)} \xB7 ${i2 + 1} / ${current.chapterCount}</span>`;
        const img = box.querySelector("img");
        img.onerror = () => {
          img.alt = "\u8FD9\u4E00\u9875\u56FE\u7247\u52A0\u8F7D\u5931\u8D25";
        };
        return box;
      }
      function observeScanPages(boxes) {
        if (!scan.observer) {
          scan.observer = new IntersectionObserver((entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              const img = e.target.querySelector("img");
              if (img && !img.getAttribute("src")) img.src = img.dataset.src;
            }
          }, { root: $("content"), rootMargin: "1000px 0px" });
        }
        for (const b of boxes) scan.observer.observe(b);
      }
      function appendScanPages(n) {
        if (!scan.active) return;
        const boxes = [];
        while (boxes.length < n && scan.nextIndex < current.chapters.length) {
          if (!current.chapters[scan.nextIndex].image) break;
          const box = makeScanPage(scan.nextIndex);
          boxes.push(box);
          scan.pages.push(box);
          scan.nextIndex++;
        }
        if (boxes.length) {
          const frag = document.createDocumentFragment();
          for (const b of boxes) frag.appendChild(b);
          const end2 = $("scan-end");
          if (end2) $("content").insertBefore(frag, end2);
          else $("content").appendChild(frag);
          observeScanPages(boxes);
        }
        const end = $("scan-end");
        if (end) end.classList.toggle("hidden", scan.nextIndex < current.chapters.length);
      }
      function updateScanInfo(i2) {
        const total = current.chapterCount;
        const pct = Math.min(100, Math.round((i2 + 1) / total * 100));
        $("page-info").textContent = `\u7B2C ${i2 + 1} / ${total} \u9875 \xB7 \u5168\u4E66 ${pct}%`;
        $("progress-fill").style.width = pct + "%";
        $("btn-prev").disabled = i2 <= 0;
        $("btn-next").disabled = i2 >= total - 1;
      }
      function saveProgress(chapterId, percent, offset = 0) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => api("set-progress", {
          id: current.id,
          chapter_id: chapterId,
          percent,
          locator: { kind: "txt_offset", offset }
        }).catch(() => {
        }), 350);
      }
      function updateVisibleScanPage() {
        if (!scan.active || !scan.pages.length) return;
        const content = $("content");
        const cr = content.getBoundingClientRect();
        const mid = cr.top + Math.min(160, cr.height * 0.3);
        let best = null, bestDist = Infinity;
        for (const p of scan.pages) {
          const r = p.getBoundingClientRect();
          if (r.bottom < cr.top) continue;
          const d = Math.abs(r.top - mid);
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        }
        if (!best) return;
        const i2 = Number(best.dataset.index);
        const c = current.chapters[i2];
        if (!c || c.id === current.chapterId) return;
        current.chapterId = c.id;
        current.chapterIndex = i2;
        setActiveChapter(c.id, true);
        updateScanInfo(i2);
        saveProgress(c.id, (i2 + 1) / current.chapterCount);
      }
      function startScan(startIndex, notice) {
        stopScan();
        stopStream();
        const content = $("content");
        scan.active = true;
        scan.nextIndex = startIndex;
        scan.pages = [];
        content.classList.add("scan-stream");
        content.innerHTML = `<p class="scan-notice">${esc(notice || "\u626B\u63CF\u7248 PDF\uFF1A\u6309\u539F\u9875\u56FE\u7247\u8FDE\u7EED\u663E\u793A\uFF0C\u5411\u4E0B\u6EDA\u52A8\u4F1A\u81EA\u52A8\u52A0\u8F7D\u540E\u7EED\u9875\uFF1B\u65E0\u6587\u5B57\u5C42\uFF0C\u4E0D\u652F\u6301\u5168\u6587\u68C0\u7D22\u3002")}</p>
    <div id="scan-end" class="scan-end hidden">\u2014 \u5DF2\u7ECF\u662F\u6700\u540E\u4E00\u9875 \u2014</div>`;
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
            if (content.scrollTop + content.clientHeight >= content.scrollHeight - 1e3) appendScanPages(2);
            updateVisibleScanPage();
          });
        };
        content.addEventListener("scroll", scan.onScroll, { passive: true });
        requestAnimationFrame(updateVisibleScanPage);
      }
      function scanScroll(delta) {
        const content = $("content");
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
          content.scrollTo({ top: content.scrollTop + (r.top - cr.top) - 8, behavior: "smooth" });
        }
        updateScanInfo(target);
      }
      var STREAM_CHUNK = 18e3;
      var STREAM_MAX_BLOCKS = 6;
      function stopStream() {
        const content = $("content");
        if (content && stream.onScroll) content.removeEventListener("scroll", stream.onScroll);
        stream.active = false;
        stream.blocks = [];
        stream.nextIndex = 0;
        stream.onScroll = null;
        stream.ticking = false;
        stream.loading = false;
        stream.end = false;
        if (content) content.classList.remove("stream");
      }
      function readFullChapter(chapterId) {
        return __async(this, null, function* () {
          let text = "", offset = 0, guard = 0;
          while (guard++ < 16) {
            const r = yield api("read-chapter", { id: current.id, chapterId, offset, limit: STREAM_CHUNK });
            if (!r.chapter) return null;
            text += r.text || "";
            if (r.done || !r.text) break;
            offset = r.nextOffset;
          }
          return { text };
        });
      }
      function makeStreamBlock(i2, data) {
        const c = current.chapters[i2];
        const box = document.createElement("section");
        box.className = "stream-block";
        box.dataset.index = String(i2);
        box.dataset.chapterId = c.id;
        box.dataset.chars = String(data.text.length || 1);
        const h = document.createElement("h3");
        h.className = "stream-title";
        h.textContent = c.title || "\u7B2C " + (i2 + 1) + " \u8282";
        box.appendChild(h);
        if (!data.text.length) data.text = "\uFF08\u8FD9\u4E00\u7AE0\u6CA1\u6709\u6B63\u6587\uFF09";
        for (let p = 0; p < data.text.length; p += STREAM_CHUNK) {
          const div = document.createElement("div");
          div.className = "stream-text";
          div.textContent = data.text.slice(p, p + STREAM_CHUNK);
          box.appendChild(div);
        }
        return box;
      }
      function appendStreamBlocks(n) {
        return __async(this, null, function* () {
          if (!stream.active || stream.loading || stream.end) return;
          stream.loading = true;
          try {
            const content = $("content");
            while (n-- > 0 && stream.nextIndex < current.chapters.length && stream.active) {
              const i2 = stream.nextIndex;
              const c = current.chapters[i2];
              if (!c || c.image) {
                stream.end = true;
                break;
              }
              const data = yield readFullChapter(c.id);
              if (!data) {
                stream.end = true;
                break;
              }
              if (!stream.active) return;
              const box = makeStreamBlock(i2, data);
              const end2 = $("stream-end");
              if (end2 && end2.parentNode === content) content.insertBefore(box, end2);
              else content.appendChild(box);
              stream.blocks.push(box);
              stream.nextIndex++;
            }
            if (stream.nextIndex >= current.chapters.length) stream.end = true;
            const end = $("stream-end");
            if (end) end.classList.toggle("hidden", !stream.end);
          } finally {
            stream.loading = false;
          }
        });
      }
      function trimStream() {
        const content = $("content");
        const blocks = stream.blocks;
        if (!content || blocks.length <= STREAM_MAX_BLOCKS) return;
        const cr = content.getBoundingClientRect();
        let firstVisible = 0;
        for (let i2 = 0; i2 < blocks.length; i2++) {
          if (blocks[i2].getBoundingClientRect().bottom > cr.top - 80) {
            firstVisible = i2;
            break;
          }
        }
        const cut = Math.max(0, Math.min(firstVisible - 1, blocks.length - STREAM_MAX_BLOCKS));
        if (cut <= 0) return;
        let h = 0;
        for (let i2 = 0; i2 < cut; i2++) {
          h += blocks[i2].offsetHeight;
          if (blocks[i2].parentNode) blocks[i2].parentNode.removeChild(blocks[i2]);
        }
        stream.blocks = blocks.slice(cut);
        if (h > 0) content.scrollTop = Math.max(0, content.scrollTop - h);
      }
      function streamVisibleOffset(box) {
        const content = $("content");
        const cr = content.getBoundingClientRect();
        const r = box.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (cr.top - r.top) / Math.max(1, r.height)));
        return Math.round(ratio * (Number(box.dataset.chars) || 1));
      }
      function updateVisibleStream() {
        if (!stream.active || !stream.blocks.length) return;
        const content = $("content");
        const cr = content.getBoundingClientRect();
        const mid = cr.top + Math.min(120, cr.height * 0.25);
        let best = null, bestDist = Infinity;
        for (const b of stream.blocks) {
          const r = b.getBoundingClientRect();
          if (r.bottom < cr.top) continue;
          const d = Math.abs(r.top - mid);
          if (d < bestDist) {
            bestDist = d;
            best = b;
          }
        }
        if (!best) return;
        const i2 = Number(best.dataset.index);
        const c = current.chapters[i2];
        if (!c) return;
        const changed = c.id !== current.chapterId;
        current.chapterId = c.id;
        current.chapterIndex = i2;
        if (changed) setActiveChapter(c.id, true);
        const pct = Math.round((i2 + 1) / current.chapterCount * 100);
        $("page-info").textContent = `\u7B2C ${i2 + 1}/${current.chapterCount} \u7AE0 \xB7 \u8FDE\u7EED\u6EDA\u52A8 \xB7 \u5168\u4E66 ${pct}%`;
        $("progress-fill").style.width = Math.min(100, Math.max(0, pct)) + "%";
        $("btn-prev").disabled = false;
        $("btn-next").disabled = stream.end && i2 >= current.chapterCount - 1;
        if (changed) saveProgress(c.id, (i2 + 1) / current.chapterCount, streamVisibleOffset(best));
      }
      function startStream(startIndex = 0, startOffset = 0) {
        return __async(this, null, function* () {
          var _a2;
          stopScan();
          stopStream();
          const content = $("content");
          const i2 = Math.max(0, Math.min(current.chapterCount - 1, startIndex));
          stream.active = true;
          stream.nextIndex = i2;
          stream.blocks = [];
          stream.end = false;
          content.classList.add("stream");
          content.textContent = "";
          const end = document.createElement("div");
          end.id = "stream-end";
          end.className = "stream-end hidden";
          end.textContent = "\u2014 \u5168\u4E66\u5B8C \u2014";
          content.appendChild(end);
          yield appendStreamBlocks(3);
          if (!stream.active) return;
          content.scrollTop = 0;
          current.chapterId = ((_a2 = current.chapters[i2]) == null ? void 0 : _a2.id) || current.chapterId;
          current.chapterIndex = i2;
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
                }).catch(() => {
                });
              }
              updateVisibleStream();
            });
          };
          content.addEventListener("scroll", stream.onScroll, { passive: true });
          setActiveChapter(current.chapterId, true);
          updateVisibleStream();
        });
      }
      function streamPage(delta) {
        const c = $("content");
        const step = Math.max(160, c.clientHeight - 64);
        c.scrollTop = Math.max(0, Math.min(c.scrollHeight - c.clientHeight, c.scrollTop + delta * step));
        updateVisibleStream();
      }
      function bookEffect() {
        return book.effect === "book" && !HAS_3D ? "slide" : book.effect;
      }
      function stopBook() {
        clearTimeout(book.tapTimer);
        clearTimeout(book.resizeTimer);
        clearTimeout(book.flipTimer);
        const c = $("content");
        if (c) c.classList.remove("book-mode");
        book.active = false;
        book.pages = [];
        book.index = 0;
        book.animating = false;
        book.stage = null;
        book.front = null;
        book.base = null;
        book.measure = null;
        book.end = false;
        book.loading = false;
        book.cursor = null;
        book.headCursor = null;
        book.firstIndex = 0;
        book.lastTap = 0;
        book.tapCount = 0;
        book.swiped = false;
      }
      function makeBookPage(cls) {
        const el = document.createElement("div");
        el.className = "book-page " + cls;
        for (const k of ["book-head", "book-text", "book-foot"]) {
          const part = document.createElement("div");
          part.className = k;
          el.appendChild(part);
        }
        return el;
      }
      function bookPercent(p) {
        return p ? Math.round(Math.min(
          100,
          (p.chapterIndex + 0.5) / Math.max(1, current.chapterCount || 1) * 100
        )) : 0;
      }
      function fillBookPage(el, p, idx) {
        if (!el || !p) return;
        el.querySelector(".book-head").textContent = p.chapterTitle || "";
        el.querySelector(".book-text").textContent = p.text;
        el.querySelector(".book-foot").textContent = "\u7B2C " + (idx + 1) + " \u9875 \xB7 \u5168\u4E66 " + bookPercent(p) + "%";
      }
      function bookMeasureGeometry() {
        if (!book.active || !book.front || !book.measure) return false;
        const t = book.front.querySelector(".book-text");
        book.textW = t.clientWidth;
        book.textH = t.clientHeight;
        if (book.textW < 40 || book.textH < 40) return false;
        book.measure.style.width = book.textW + "px";
        return true;
      }
      function chunkMetaOf(part) {
        return {
          chapterId: part.chapterId,
          chapterIndex: part.chapterIndex,
          chapterTitle: part.chapterTitle,
          baseOffset: part.charStart
        };
      }
      function paginateChunks(chunks) {
        const m = book.measure;
        const maxH = Math.max(60, book.textH - 20);
        const pieces = [], bounds = [];
        let at = 0;
        for (const c of chunks) {
          const t = c.text || "";
          if (!t.length) continue;
          bounds.push({ start: at, end: at + t.length, meta: c.meta });
          pieces.push(t);
          at += t.length;
        }
        const text = pieces.join("");
        const n = text.length;
        const out = [];
        if (!n) return out;
        const fs = state.settings.font_size || 18;
        const lh = fs * (state.settings.line_height || 1.8);
        const perLine = Math.max(6, book.textW / (fs * 0.92));
        const guess = Math.max(30, Math.floor(maxH / Math.max(12, lh) * perLine * 1.05));
        let pos = 0, guard = 0;
        while (pos < n && guard++ < 500) {
          let lo = pos + 1;
          let hi = Math.min(n, pos + Math.max(24, Math.round(guess * 1.6)));
          let best = pos + 1;
          m.textContent = text.slice(pos, hi);
          if (m.scrollHeight <= maxH) best = hi;
          else {
            while (lo <= hi) {
              const mid = lo + hi >> 1;
              m.textContent = text.slice(pos, mid);
              if (m.scrollHeight <= maxH) {
                best = mid;
                lo = mid + 1;
              } else hi = mid - 1;
            }
          }
          let cut = best;
          if (cut < n) {
            const from = Math.max(pos + 1, pos + Math.floor((best - pos) * 0.72));
            const nl = text.lastIndexOf("\n", cut - 1);
            if (nl >= from) cut = nl + 1;
          }
          if (cut <= pos) cut = best;
          const parts = [];
          for (const b of bounds) {
            const s = Math.max(pos, b.start), e = Math.min(cut, b.end);
            if (e <= s) continue;
            parts.push({
              text: text.slice(s, e),
              chapterId: b.meta.chapterId,
              chapterIndex: b.meta.chapterIndex,
              chapterTitle: b.meta.chapterTitle,
              charStart: b.meta.baseOffset + (s - b.start)
            });
          }
          out.push({
            parts,
            text: text.slice(pos, cut),
            chapterId: parts[0].chapterId,
            chapterIndex: parts[0].chapterIndex,
            chapterTitle: parts[0].chapterTitle,
            charStart: parts[0].charStart
          });
          pos = cut;
        }
        m.textContent = "";
        return out;
      }
      function bookFetch(ci, offset) {
        return __async(this, null, function* () {
          const ch = current.chapters[ci];
          if (!ch || ch.image) return null;
          return api("read-chapter", {
            id: current.id,
            chapterId: ch.id,
            offset: Math.max(0, offset),
            limit: state.settings.page_size || 6e3
          });
        });
      }
      function bookMeta(ci, r) {
        const ch = current.chapters[ci] || {};
        return {
          chapterId: ch.id,
          chapterIndex: ci,
          chapterTitle: ch.title || "",
          baseOffset: Number(r.offset) || 0
        };
      }
      function bookLoadMore() {
        return __async(this, null, function* () {
          if (book.loading || book.end || !book.active || !book.cursor) return;
          book.loading = true;
          try {
            let { ci, offset, done } = book.cursor;
            const fs = state.settings.font_size || 18;
            const perPage = Math.max(120, Math.round(
              book.textH / Math.max(12, fs * (state.settings.line_height || 1.8)) * Math.max(6, book.textW / (fs * 0.92))
            ));
            const target = perPage * 5;
            const chunks = [];
            let total = 0, guard = 0;
            while (guard++ < 12 && total < target) {
              if (done) {
                if (ci + 1 >= current.chapters.length) {
                  book.end = true;
                  break;
                }
                ci += 1;
                offset = 0;
                done = false;
              }
              const r = yield bookFetch(ci, offset);
              if (!book.active) return;
              if (!r || !r.chapter) {
                book.end = true;
                break;
              }
              chunks.push({ text: r.text || "", meta: bookMeta(ci, r) });
              total += (r.text || "").length;
              done = !!r.done;
              offset = Number(r.nextOffset) || offset + (r.text || "").length;
              if (done && ci + 1 >= current.chapters.length) {
                book.end = true;
                break;
              }
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
          } finally {
            book.loading = false;
          }
        });
      }
      function bookPrepend() {
        return __async(this, null, function* () {
          if (book.loading || !book.active || !book.headCursor) return false;
          book.loading = true;
          try {
            let { ci, offset } = book.headCursor;
            const size = state.settings.page_size || 6e3;
            let r = null;
            if (offset <= 0) {
              if (ci <= 0) return false;
              ci -= 1;
              const probe = yield bookFetch(ci, 0);
              if (!probe || !probe.chapter || !book.active) return false;
              const tail = Math.max(0, (Number(probe.total) || 0) - size);
              r = tail > 0 ? yield bookFetch(ci, tail) : probe;
            } else {
              const prev = Math.max(0, offset - size);
              if (prev === offset) return false;
              r = yield bookFetch(ci, prev);
            }
            if (!r || !r.chapter || !book.active) return false;
            const pages = paginateChunks([{ text: r.text || "", meta: bookMeta(ci, r) }]);
            if (!pages.length) return false;
            book.pages = pages.concat(book.pages);
            book.index += pages.length;
            book.headCursor = { ci, offset: Number(r.offset) || 0, done: false };
            bookUpdateInfo();
            return true;
          } finally {
            book.loading = false;
          }
        });
      }
      function startBook(startIndex = 0, startOffset = 0) {
        return __async(this, null, function* () {
          stopScan();
          stopStream();
          stopBook();
          const content = $("content");
          const i2 = Math.max(0, Math.min((current.chapterCount || 1) - 1, startIndex));
          const at = Math.max(0, startOffset);
          book.active = true;
          book.pages = [];
          book.index = 0;
          book.end = false;
          book.loading = false;
          book.cursor = { ci: i2, offset: at, done: false };
          book.headCursor = { ci: i2, offset: at, done: false };
          book.firstIndex = i2;
          content.classList.add("book-mode");
          content.textContent = "";
          const stage = document.createElement("div");
          stage.className = "book-stage";
          stage.id = "book-stage";
          const base = makeBookPage("book-base");
          const front = makeBookPage("book-front");
          base.style.display = "none";
          stage.appendChild(base);
          stage.appendChild(front);
          content.appendChild(stage);
          const measure = document.createElement("div");
          measure.className = "book-measure";
          content.appendChild(measure);
          book.stage = stage;
          book.base = base;
          book.front = front;
          book.measure = measure;
          bookMeasureGeometry();
          yield bookLoadMore();
          if (!book.active) return;
          if (!book.pages.length) {
            content.classList.remove("book-mode");
            content.textContent = "\u8FD9\u672C\u4E66\u6CA1\u6709\u53EF\u89E3\u6790\u7684\u6B63\u6587\u3002\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559\uFF0C\u53EF\u70B9\u300C\u5BFC\u51FA\u300D\u53D6\u56DE\u3002";
            return;
          }
          bookRender();
          bookSaveProgress();
          if (book.pages.length < 3) yield bookLoadMore();
          if (book.active) bookUpdateInfo();
        });
      }
      function bookSetTransform(el, v) {
        el.style.webkitTransform = v;
        el.style.transform = v;
      }
      function bookUpdateInfo() {
        if (!book.active) return;
        const p = book.pages[book.index];
        const n = book.pages.length;
        $("page-info").textContent = "\u7B2C " + (book.index + 1) + "/" + n + (book.end ? "" : "+") + " \u9875 \xB7 \u5168\u4E66 " + bookPercent(p) + "%";
        $("progress-fill").style.width = bookPercent(p) + "%";
        $("btn-prev").disabled = false;
        $("btn-next").disabled = book.end && book.index >= n - 1;
      }
      function bookRender() {
        const p = book.pages[book.index];
        if (!book.active || !p || !book.front) return;
        clearTimeout(book.flipTimer);
        book.flipTimer = null;
        book.front.classList.remove("book-flipping");
        book.front.style.transition = "none";
        bookSetTransform(book.front, "");
        book.base.style.display = "none";
        book.front.style.display = "";
        fillBookPage(book.front, p, book.index);
        void book.front.offsetWidth;
        book.front.style.transition = "";
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
        saveProgress(
          p.chapterId,
          Math.min(1, (p.chapterIndex + 0.5) / Math.max(1, current.chapterCount || 1)),
          p.charStart
        );
      }
      function flipPage(delta) {
        if (!book.active || book.animating) return;
        const target = book.index + delta;
        if (target < 0) {
          if (book.loading) return;
          Promise.resolve(bookPrepend()).then((more) => {
            if (more && book.active && book.index + delta >= 0) flipPage(delta);
            else if (book.active) toast("\u5DF2\u7ECF\u662F\u7B2C\u4E00\u9875");
          }).catch(() => {
          });
          return;
        }
        if (target >= book.pages.length) {
          if (book.end) {
            toast("\u5DF2\u7ECF\u662F\u6700\u540E\u4E00\u9875");
            return;
          }
          Promise.resolve(bookLoadMore()).then(() => {
            if (!book.active || book.animating) return;
            if (book.index + delta < book.pages.length) flipPage(delta);
            else if (book.end) toast("\u5DF2\u7ECF\u662F\u6700\u540E\u4E00\u9875");
          }).catch(() => {
          });
          return;
        }
        const effect = bookEffect();
        if (effect === "none") {
          book.index = target;
          bookRender();
          bookSaveProgress();
          if (book.index >= book.pages.length - 2) bookLoadMore();
          return;
        }
        book.animating = true;
        const front = book.front, base = book.base;
        const dest = book.pages[target];
        const turn = effect === "book" ? "rotateY(-88deg)" : "translateX(-102%)";
        const still = effect === "book" ? "rotateY(0deg)" : "translateX(0)";
        base.style.display = "";
        front.style.display = "";
        if (delta > 0) fillBookPage(base, dest, target);
        else fillBookPage(base, book.pages[book.index], book.index);
        front.style.transition = "none";
        if (delta > 0) bookSetTransform(front, still);
        else {
          fillBookPage(front, dest, target);
          bookSetTransform(front, turn);
        }
        void front.offsetWidth;
        front.style.transition = "-webkit-transform " + BOOK_FLIP_MS + "ms cubic-bezier(.28,.72,.3,1), transform " + BOOK_FLIP_MS + "ms cubic-bezier(.28,.72,.3,1)";
        bookSetTransform(front, delta > 0 ? turn : still);
        front.classList.add("book-flipping");
        book.flipTimer = setTimeout(() => {
          book.flipTimer = null;
          if (!book.active) return;
          book.index = target;
          bookRender();
          bookSaveProgress();
          if (book.index >= book.pages.length - 2) bookLoadMore();
        }, BOOK_FLIP_MS + 25);
      }
      function scheduleBookRelayout() {
        if (!book.active) return;
        clearTimeout(book.resizeTimer);
        book.resizeTimer = setTimeout(relayoutBook, 200);
      }
      function relayoutBook() {
        if (!book.active || book.animating || !book.pages.length) return;
        if (!bookMeasureGeometry()) return;
        let anchorSeq = 0;
        for (let i2 = 0; i2 < book.index; i2++) anchorSeq += book.pages[i2].text.length;
        const chunks = [];
        for (const p of book.pages) {
          for (const q of p.parts) chunks.push({ text: q.text, meta: chunkMetaOf(q) });
        }
        const fresh = paginateChunks(chunks);
        if (!fresh.length) return;
        let acc = 0, idx = 0;
        for (let i2 = 0; i2 < fresh.length; i2++) {
          if (acc + fresh[i2].text.length > anchorSeq) {
            idx = i2;
            break;
          }
          acc += fresh[i2].text.length;
          idx = i2;
        }
        book.pages = fresh;
        book.index = Math.max(0, Math.min(idx, fresh.length - 1));
        bookRender();
      }
      window.__orBookState = () => {
        const parts = [];
        for (const p of book.pages) for (const q of p.parts) parts.push(q);
        let gaps = 0;
        for (let i2 = 1; i2 < parts.length; i2++) {
          const a = parts[i2 - 1], b = parts[i2];
          if (a.chapterId === b.chapterId && a.charStart + a.text.length !== b.charStart) gaps++;
        }
        return {
          active: book.active,
          effect: bookEffect(),
          has3d: HAS_3D,
          count: book.pages.length,
          index: book.index,
          end: book.end,
          gaps,
          text: book.pages.map((p) => p.text).join(""),
          charStart: book.pages[book.index] ? book.pages[book.index].charStart : -1,
          immersive,
          animating: book.animating
        };
      };
      window.__orSetPageEffect = (v) => {
        book.effect = v;
        return bookEffect();
      };
      window.__orRelayoutBook = () => {
        relayoutBook();
        return book.pages.length;
      };
      function gotoChapter(i2, offset = 0) {
        const c = current.chapters[i2];
        if (!c) return null;
        closeTocOnMobile();
        if (readMode === "page" && !c.image) return startBook(i2, offset);
        stopBook();
        if (readMode === "scroll" && !c.image) return startStream(i2, offset);
        return loadChapter(c.id, offset);
      }
      function toggleReadMode() {
        return __async(this, null, function* () {
          if (!current.id) {
            toast("\u8BF7\u5148\u6253\u5F00\u4E00\u672C\u4E66");
            return;
          }
          const next = readMode === "scroll" ? "page" : "scroll";
          const index = Math.max(0, current.chapters.findIndex((c) => c.id === current.chapterId));
          let offset = 0;
          if (stream.active) {
            const b = stream.blocks.find((x2) => x2.dataset.chapterId === current.chapterId) || stream.blocks[0];
            if (b) offset = streamVisibleOffset(b);
          } else {
            offset = Number(current.offset) || 0;
          }
          try {
            state.settings = yield api("set-settings", { patch: { read_mode: next } });
          } catch (err2) {
            toast("\u4FDD\u5B58\u9605\u8BFB\u65B9\u5F0F\u5931\u8D25\uFF1A" + err2.message);
            return;
          }
          readMode = next;
          applySettings(state.settings);
          yield gotoChapter(index, offset);
          toast(next === "scroll" ? "\u8FDE\u7EED\u6EDA\u52A8\uFF1A\u4E0A\u4E0B\u6ED1\u52A8\u81EA\u52A8\u7EED\u7AE0\uFF0C\u4E0B\u4E00\u9875\u6309\u94AE\u6539\u4E3A\u6EDA\u52A8\u4E00\u5C4F" : "\u4EFF\u771F\u7FFB\u4E66\uFF1A\u5DE6\u53F3\u6ED1\u52A8 / \u70B9\u5C4F\u5E55\u4E24\u4FA7\u7FFB\u9875\uFF0C\u53CC\u51FB\u6B63\u6587\u8FDB\u5165\u5168\u5C4F");
        });
      }
      function openBook(id, chapterId = null, offset = 0) {
        return __async(this, null, function* () {
          var _a2, _b2, _c, _d;
          stopScan();
          const b = yield api("get-book", { id });
          current.id = id;
          current.chapters = b.chapters || [];
          current.chapterCount = current.chapters.length || 1;
          switchView("reader");
          $("reader-title").textContent = b.title + (b.author ? " \xB7 " + b.author : "");
          $("toc-filter").value = "";
          const target = chapterId || ((_a2 = b.progress) == null ? void 0 : _a2.chapter_id) || ((_b2 = current.chapters[0]) == null ? void 0 : _b2.id) || null;
          current.chapterId = target;
          renderToc();
          const startIndex = Math.max(0, current.chapters.findIndex((c) => c.id === target));
          yield gotoChapter(startIndex, offset || ((_d = (_c = b.progress) == null ? void 0 : _c.locator) == null ? void 0 : _d.offset) || 0);
          const fresh = yield api("get-book", { id });
          const i2 = state.books.findIndex((x2) => x2.id === id);
          if (i2 >= 0) state.books[i2] = __spreadValues(__spreadValues({}, state.books[i2]), fresh);
        });
      }
      function loadChapter(chapterId, offset = 0) {
        return __async(this, null, function* () {
          var _a2, _b2;
          if (readMode === "page" && !book.active) {
            const i2 = current.chapters.findIndex((c) => c.id === chapterId);
            if (i2 >= 0 && !current.chapters[i2].image) return startBook(i2, offset);
          }
          stopBook();
          stopStream();
          const content = $("content");
          if (!chapterId) {
            stopScan();
            const b = yield api("get-book", { id: current.id });
            content.textContent = b.parse_error || "\u8FD9\u672C\u4E66\u6CA1\u6709\u53EF\u89E3\u6790\u7684\u6B63\u6587\u3002\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559\uFF0C\u53EF\u70B9\u300C\u5BFC\u51FA\u300D\u53D6\u56DE\u3002";
            $("page-info").textContent = "";
            $("progress-fill").style.width = "0%";
            return;
          }
          const r = yield api("read-chapter", {
            id: current.id,
            chapterId,
            offset,
            limit: state.settings.page_size || 6e3
          });
          const idx = current.chapters.findIndex((c) => c.id === chapterId);
          if ((((_a2 = r.chapter) == null ? void 0 : _a2.image) || ((_b2 = current.chapters[idx]) == null ? void 0 : _b2.image)) && idx >= 0) {
            startScan(idx, r.notice);
            return;
          }
          stopScan();
          Object.assign(current, {
            chapterId,
            offset: r.offset,
            nextOffset: r.nextOffset,
            total: r.total,
            done: r.done,
            chapterIndex: r.chapterIndex || 0,
            chapterCount: r.chapterCount || current.chapterCount
          });
          setActiveChapter(chapterId, true);
          content.textContent = r.text + (r.notice ? "\n\n\uFF3B" + r.notice + "\uFF3D" : "");
          content.scrollTop = 0;
          const chapterPct = r.total ? Math.round((r.offset + r.text.length) / r.total * 100) : 100;
          const bookPct = Math.round((current.chapterIndex + chapterPct / 100) / current.chapterCount * 100);
          $("page-info").textContent = `\u7B2C ${current.chapterIndex + 1}/${current.chapterCount} \u7AE0 \xB7 \u672C\u7AE0 ${chapterPct}% \xB7 \u5168\u4E66 ${bookPct}%`;
          $("progress-fill").style.width = Math.min(100, Math.max(0, bookPct)) + "%";
          $("btn-prev").disabled = r.offset <= 0 && current.chapterIndex === 0;
          $("btn-next").disabled = r.done && current.chapterIndex >= current.chapterCount - 1;
          const percent = Math.min(1, (current.chapterIndex + (r.total ? (r.offset + r.text.length) / r.total : 1)) / current.chapterCount);
          saveProgress(chapterId, percent, r.offset);
        });
      }
      function gotoNext() {
        if (book.active) return flipPage(1);
        if (stream.active) return streamPage(1);
        if (scan.active) return scanScroll(1);
        if (!current.done) return loadChapter(current.chapterId, current.nextOffset);
        const i2 = current.chapters.findIndex((c) => c.id === current.chapterId);
        if (i2 >= 0 && i2 + 1 < current.chapters.length) return loadChapter(current.chapters[i2 + 1].id, 0);
        toast("\u5DF2\u7ECF\u662F\u6700\u540E\u4E00\u9875");
      }
      function gotoPrev() {
        if (book.active) return flipPage(-1);
        if (stream.active) return streamPage(-1);
        if (scan.active) return scanScroll(-1);
        if (current.offset > 0) return loadChapter(
          current.chapterId,
          Math.max(0, current.offset - (state.settings.page_size || 6e3))
        );
        const i2 = current.chapters.findIndex((c) => c.id === current.chapterId);
        if (i2 > 0) return loadChapter(current.chapters[i2 - 1].id, 0);
        toast("\u5DF2\u7ECF\u662F\u7B2C\u4E00\u9875");
      }
      var ZIP_RE = /\.(zip|openlib)$/i;
      var BOOK_FILE_RE = /\.(txt|md|markdown|text|log|rst|tex|srt|csv|json|xml|nfo|epub|docx|doc|pdf|rtf|odt|ott|fb2|html?|xhtml|mht|mhtml|mobi|prc|pdb|azw3?|zip|openlib)$/i;
      function smartImport(file) {
        return __async(this, null, function* () {
          const r = yield fetch("/api/import-smart", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name) },
            body: yield file.arrayBuffer()
          });
          const j = yield r.json().catch(() => ({ error: "\u54CD\u5E94\u4E0D\u662F JSON" }));
          if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
          return j;
        });
      }
      function fileBytesAndHash(f) {
        return __async(this, null, function* () {
          var _a2;
          const buf = yield f.arrayBuffer();
          if (!((_a2 = globalThis.crypto) == null ? void 0 : _a2.subtle)) return { buf, hex: null };
          const d = yield crypto.subtle.digest("SHA-256", buf);
          const hex = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
          return { buf, hex };
        });
      }
      function showImportReports(reports) {
        const rows = [];
        let skip = 0, fail = 0;
        for (const r of reports) {
          if (r.kind === "library") {
            rows.push(`<div class="imp-row ok">\u2713 ${esc(r.file || "\u6574\u5E93\u5305")} \xB7 \u5408\u5E76 ${r.books || 0} \u672C\uFF08\u66F4\u65B0 ${r.merged || 0} \u5904\uFF09</div>`);
            continue;
          }
          for (const x2 of r.ok || []) rows.push(`<div class="imp-row ok">\u2713 ${esc(x2.title || x2.name)}</div>`);
          for (const x2 of r.skip || []) {
            skip++;
            rows.push(`<div class="imp-row skip">\u25CB ${esc(x2.name)} \xB7 ${esc(x2.reason)}</div>`);
          }
          for (const x2 of r.fail || []) {
            fail++;
            rows.push(`<div class="imp-row fail">\u2715 ${esc(x2.name)} \xB7 ${esc(x2.error)}</div>`);
          }
        }
        if (!rows.length) {
          toast("\u538B\u7F29\u5305\u91CC\u6CA1\u6709\u627E\u5230\u53EF\u5BFC\u5165\u7684\u4E66\u7C4D");
          return;
        }
        if (!skip && !fail) return;
        showModal(
          `<h2>\u5BFC\u5165\u660E\u7EC6</h2><div class="imp-list">${rows.join("")}</div>
    <div class="modal-actions"><button id="m-close" class="solid">\u77E5\u9053\u4E86</button></div>`,
          (m) => {
            m.querySelector("#m-close").onclick = closeModal;
          }
        );
      }
      function collectDroppedFiles(dt) {
        return __async(this, null, function* () {
          try {
            const entries = [...dt.items || []].map((i2) => {
              var _a2;
              return (_a2 = i2.webkitGetAsEntry) == null ? void 0 : _a2.call(i2);
            }).filter(Boolean);
            if (!entries.length) return [...dt.files];
            const out = [];
            const walk = (entry) => __async(null, null, function* () {
              if (entry.isFile) {
                out.push(yield new Promise((res, rej) => entry.file(res, rej)));
              } else if (entry.isDirectory) {
                const reader = entry.createReader();
                for (; ; ) {
                  const batch = yield new Promise((res, rej) => reader.readEntries(res, rej));
                  if (!batch.length) break;
                  for (const e of batch) yield walk(e);
                }
              }
            });
            for (const e of entries) yield walk(e);
            if (out.length) return out;
          } catch (e) {
          }
          return [...dt.files];
        });
      }
      function importFiles(input) {
        return __async(this, null, function* () {
          var _a2, _b2, _c;
          const files = [...input].filter((f) => BOOK_FILE_RE.test(f.name) && !/^__MACOSX\//i.test(f.webkitRelativePath || "") && !/(^|\/)\./.test(f.webkitRelativePath || f.name));
          if (!files.length) {
            toast("\u6CA1\u6709\u627E\u5230\u53EF\u5BFC\u5165\u7684\u4E66\u7C4D\u6587\u4EF6");
            return;
          }
          let ok = 0, bad = 0, skip = 0;
          const reports = [];
          const seen = new Set(allBooks().map((b) => b.sha256).filter(Boolean));
          for (const f of files) {
            try {
              if (ZIP_RE.test(f.name)) {
                toast(`\u6B63\u5728\u89E3\u6790 ${f.name}\u2026`);
                const r2 = yield smartImport(f);
                reports.push(r2);
                ok += r2.kind === "library" ? r2.books || 0 : ((_a2 = r2.ok) == null ? void 0 : _a2.length) || 0;
                skip += ((_b2 = r2.skip) == null ? void 0 : _b2.length) || 0;
                bad += ((_c = r2.fail) == null ? void 0 : _c.length) || 0;
                continue;
              }
              const { buf, hex } = yield fileBytesAndHash(f);
              if (hex && seen.has(hex)) {
                skip++;
                continue;
              }
              const r = yield fetch("/api/import-book", {
                method: "POST",
                headers: { "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(f.name) },
                body: buf
              });
              const j = yield r.json();
              if (!r.ok) throw new Error(j.error);
              if (hex) seen.add(hex);
              ok++;
              if (j.parse_status === "unsupported") toast(`${j.title}\uFF1A\u539F\u4EF6\u5DF2\u4FDD\u5B58\uFF0C\u8BE5\u683C\u5F0F\u6682\u4E0D\u89E3\u6790`);
            } catch (e) {
              bad++;
              console.error(e);
              toast("\u5BFC\u5165\u5931\u8D25\uFF1A" + e.message);
            }
          }
          const parts = [`\u5DF2\u5BFC\u5165 ${ok} \u672C`];
          if (skip) parts.push(`\u8DF3\u8FC7 ${skip} \u672C\uFF08\u91CD\u590D\uFF09`);
          if (bad) parts.push(`\u5931\u8D25 ${bad} \u672C`);
          if (ok || bad || reports.length) toast(parts.join("\uFF0C"));
          if (reports.length) showImportReports(reports);
          yield loadState();
        });
      }
      function importLibrary(file) {
        return __async(this, null, function* () {
          try {
            toast(`\u6B63\u5728\u89E3\u6790 ${file.name}\u2026`);
            const r = yield smartImport(file);
            toast(r.kind === "library" ? `\u6574\u5E93\u5BFC\u5165\u5B8C\u6210\uFF1A${r.books} \u672C\u4E66\uFF0C\u5408\u5E76 ${r.merged} \u5904` : `\u5DF2\u5BFC\u5165 ${r.ok.length} \u672C${r.skip.length ? "\uFF0C\u8DF3\u8FC7 " + r.skip.length + " \u672C\uFF08\u91CD\u590D\uFF09" : ""}${r.fail.length ? "\uFF0C\u5931\u8D25 " + r.fail.length + " \u672C" : ""}`);
            showImportReports([r]);
          } catch (e) {
            toast("\u5BFC\u5165\u5931\u8D25\uFF1A" + e.message);
          }
          yield loadState();
        });
      }
      function treeRoot() {
        var _a2;
        return JSON.parse(JSON.stringify(((_a2 = state.collections) == null ? void 0 : _a2.root) || []));
      }
      function findNode(nodes, id) {
        for (const n of nodes) {
          if (n.id === id) return n;
          const r = findNode(n.children || [], id);
          if (r) return r;
        }
        return null;
      }
      function removeNode(nodes, id) {
        const i2 = nodes.findIndex((n) => n.id === id);
        if (i2 >= 0) return nodes.splice(i2, 1)[0];
        for (const n of nodes) {
          const r = removeNode(n.children || [], id);
          if (r) return r;
        }
        return null;
      }
      function saveTree(tree) {
        return __async(this, null, function* () {
          yield api("set-collections", { tree });
          yield loadState();
        });
      }
      function addCollection(parentId = null) {
        return __async(this, null, function* () {
          const name = yield askText("\u65B0\u5EFA\u5206\u7C7B", "\u7ED9\u4E66\u67B6\u8D77\u4E2A\u540D\u5B57\uFF0C\u4F8B\u5982\u300C\u5C0F\u8BF4\u300D\u300C\u6280\u672F\u300D\u300C\u5F85\u8BFB\u300D");
          if (!name) return;
          const tree = treeRoot();
          const node = {
            id: "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name,
            children: [],
            hidden: false
          };
          if (parentId) {
            const p = findNode(tree, parentId);
            (p.children = p.children || []).push(node);
          } else tree.push(node);
          yield saveTree(tree);
          toast("\u5DF2\u521B\u5EFA\u300C" + name + "\u300D");
        });
      }
      function collectionMenu(e, id) {
        const n = findNode(treeRoot(), id);
        if (!n) return;
        menu(e.clientX, e.clientY, [
          ["\u5728\u6B64\u4E0B\u65B0\u5EFA\u5B50\u5206\u7C7B", () => addCollection(id)],
          ["\u91CD\u547D\u540D", () => __async(null, null, function* () {
            const v = yield askText("\u91CD\u547D\u540D\u5206\u7C7B", "\u65B0\u7684\u5206\u7C7B\u540D\u79F0", n.name);
            if (!v) return;
            const tree = treeRoot();
            findNode(tree, id).name = v;
            yield saveTree(tree);
          })],
          [n.hidden ? "\u53D6\u6D88\u9690\u85CF\u6807\u8BB0" : "\u6807\u8BB0\u4E3A\u9690\u85CF", () => __async(null, null, function* () {
            const tree = treeRoot();
            findNode(tree, id).hidden = !n.hidden;
            yield saveTree(tree);
            toast(n.hidden ? "\u5DF2\u53D6\u6D88\u9690\u85CF" : "\u5DF2\u6807\u8BB0\u9690\u85CF\uFF08\u4EC5 UI \u9690\u85CF\uFF0C\u4E0D\u52A0\u5BC6\uFF09");
          })],
          null,
          ["\u5220\u9664\u5206\u7C7B", () => __async(null, null, function* () {
            if (!(yield askConfirm("\u5220\u9664\u5206\u7C7B", `\u786E\u5B9A\u5220\u9664\u300C${n.name}\u300D\u5417\uFF1F\u4E66\u7C4D\u672C\u8EAB\u4E0D\u4F1A\u88AB\u5220\u9664\uFF0C\u53EA\u4F1A\u89E3\u9664\u5206\u7C7B\u5173\u7CFB\u3002`, true))) return;
            const tree = treeRoot();
            removeNode(tree, id);
            yield saveTree(tree);
            const affected = allBooks().filter((b) => (b.collection_ids || []).includes(id));
            for (const b of affected) yield api("set-book-collections", {
              id: b.id,
              collectionIds: b.collection_ids.filter((x2) => x2 !== id)
            });
            if (filter.collectionId === id) filter.collectionId = null;
            yield loadState();
          }), true]
        ]);
      }
      function imageToCoverDataUrl(file) {
        return new Promise((resolve, reject) => {
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            try {
              const max2 = 800;
              const scale = Math.min(1, max2 / Math.max(img.naturalWidth, img.naturalHeight));
              const w = Math.max(1, Math.round(img.naturalWidth * scale));
              const h = Math.max(1, Math.round(img.naturalHeight * scale));
              const cv = document.createElement("canvas");
              cv.width = w;
              cv.height = h;
              const ctx = cv.getContext("2d");
              ctx.fillStyle = "#fff";
              ctx.fillRect(0, 0, w, h);
              ctx.drawImage(img, 0, 0, w, h);
              resolve(cv.toDataURL("image/jpeg", 0.82));
            } catch (err2) {
              reject(err2);
            } finally {
              URL.revokeObjectURL(url);
            }
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("\u65E0\u6CD5\u8BFB\u53D6\u8FD9\u5F20\u56FE\u7247"));
          };
          img.src = url;
        });
      }
      function pickCover(id) {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif";
        inp.style.display = "none";
        document.body.appendChild(inp);
        inp.addEventListener("cancel", () => inp.remove());
        inp.onchange = () => __async(null, null, function* () {
          var _a2;
          const f = (_a2 = inp.files) == null ? void 0 : _a2[0];
          inp.remove();
          if (!f) return;
          if (f.size > 15 * 1024 * 1024) {
            toast("\u56FE\u7247\u592A\u5927\uFF0C\u8BF7\u6362\u4E00\u5F20 15 MB \u4EE5\u5185\u7684");
            return;
          }
          try {
            const dataUrl = yield imageToCoverDataUrl(f);
            yield api("set-book-cover", { id, dataUrl });
            toast("\u5C01\u9762\u5DF2\u8BBE\u7F6E");
            yield loadState();
          } catch (err2) {
            toast("\u8BBE\u7F6E\u5C01\u9762\u5931\u8D25\uFF1A" + err2.message);
          }
        });
        inp.click();
      }
      function bookMenu(e, id) {
        const b = allBooks().find((x2) => x2.id === id);
        if (!b) return;
        const items = [
          ["\u6253\u5F00\u9605\u8BFB", () => openBook(id)],
          ["\u91CD\u547D\u540D", () => __async(null, null, function* () {
            const v = yield askText("\u91CD\u547D\u540D\u4E66\u7C4D", "\u65B0\u7684\u4E66\u540D", b.title);
            if (!v) return;
            yield api("rename-book", { id, title: v });
            yield loadState();
          })],
          ["\u8BBE\u7F6E\u5C01\u9762\u2026", () => pickCover(id)],
          ...b.hasCover ? [["\u79FB\u9664\u5C01\u9762", () => __async(null, null, function* () {
            yield api("remove-book-cover", { id });
            toast("\u5C01\u9762\u5DF2\u79FB\u9664");
            yield loadState();
          })]] : [],
          null
        ];
        items.push(["\u8C03\u6574\u5206\u7C7B\u2026", () => openCategoryPicker([id])]);
        items.push(["\u79FB\u51FA\u5168\u90E8\u5206\u7C7B", () => __async(null, null, function* () {
          yield api("set-book-collections", { id, collectionIds: [] });
          yield loadState();
        })]);
        items.push(null);
        items.push(["\u5BFC\u51FA\u539F\u59CB\u6587\u4EF6", () => {
          androidExport("/api/export-book?id=" + encodeURIComponent(id));
        }]);
        items.push(["\u5220\u9664\u8FD9\u672C\u4E66", () => __async(null, null, function* () {
          if (!(yield askConfirm("\u5220\u9664\u4E66\u7C4D", `\u786E\u5B9A\u4ECE\u4E66\u5E93\u79FB\u9664\u300C${b.title}\u300D\u5417\uFF1F\u8FD9\u4F1A\u5220\u9664\u4E66\u5E93\u5185\u7684\u539F\u4EF6\u526F\u672C\uFF0C\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002`, true))) return;
          yield api("delete-book", { id });
          if (current.id === id) {
            current.id = null;
            switchView("shelf");
          }
          toast("\u5DF2\u5220\u9664");
          yield loadState();
        }), true]);
        menu(e.clientX, e.clientY, items);
      }
      function menu(x2, y, items) {
        const now = Date.now();
        if (now - lastMenuAt < 600) return;
        lastMenuAt = now;
        const el = $("context-menu");
        el.innerHTML = items.map((it) => !it ? '<div class="sep"></div>' : `<button class="${it[2] ? "danger" : ""}">${esc(it[0])}</button>`).join("");
        el.classList.remove("hidden");
        const w = 180, h = items.length * 32 + 12;
        el.style.left = Math.min(x2, innerWidth - w - 8) + "px";
        el.style.top = Math.min(y, innerHeight - h - 8) + "px";
        const active = items.filter(Boolean);
        el.querySelectorAll("button").forEach((btn, i2) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            el.classList.add("hidden");
            active[i2][1]();
          };
        });
      }
      document.addEventListener("click", (e) => {
        if (longPressFired) {
          longPressFired = false;
          e.stopPropagation();
          return;
        }
        $("context-menu").classList.add("hidden");
      });
      function bindLongPress(el, id) {
        let start = null;
        const cancel = () => {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
          start = null;
        };
        el.addEventListener("touchstart", (e) => {
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
        el.addEventListener("touchmove", (e) => {
          if (!start || !e.touches.length) return;
          const t = e.touches[0];
          if (Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) cancel();
        }, { passive: true });
        el.addEventListener("touchend", () => {
          cancel();
          if (longPressFired) setTimeout(() => {
            longPressFired = false;
          }, 700);
        }, { passive: true });
        el.addEventListener("touchcancel", cancel, { passive: true });
      }
      function setBulkMode(on) {
        bulkMode = !!on;
        if (!bulkMode) bulkSelected.clear();
        document.body.classList.toggle("bulk-mode", bulkMode);
        renderShelf();
      }
      function toggleBulk(id) {
        if (bulkSelected.has(id)) bulkSelected.delete(id);
        else bulkSelected.add(id);
        $("shelf-grid").querySelectorAll(".book-card").forEach((el) => {
          el.classList.toggle("bulk-on", bulkSelected.has(el.dataset.id));
        });
        $("bulk-count").textContent = "\u5DF2\u9009 " + bulkSelected.size + " \u672C";
      }
      function bulkDeleteSelected() {
        return __async(this, null, function* () {
          const ids = [...bulkSelected];
          if (!ids.length) {
            toast("\u5148\u52FE\u9009\u8981\u5220\u9664\u7684\u4E66");
            return;
          }
          const byId = new Map(allBooks().map((b) => [b.id, b]));
          const names = ids.map((id) => (byId.get(id) || {}).title || "\uFF08\u5DF2\u4E0D\u5728\u4E66\u67B6\uFF09");
          const preview = names.slice(0, 3).join("\u3001") + (names.length > 3 ? ` \u7B49 ${names.length} \u672C` : "");
          const desc = `\u786E\u5B9A\u4ECE\u4E66\u5E93\u5220\u9664\u9009\u4E2D\u7684 ${ids.length} \u672C\u4E66\u5417\uFF1F\uFF08${preview}\uFF09\u8FD9\u4F1A\u5220\u9664\u4E66\u5E93\u5185\u7684\u539F\u4EF6\u526F\u672C\uFF0C\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002`;
          if (!(yield askConfirm("\u6279\u91CF\u5220\u9664\u4E66\u7C4D", desc, true))) return;
          let done = 0, failed = 0;
          for (const id of ids) {
            try {
              yield api("delete-book", { id });
              bulkSelected.delete(id);
              done++;
            } catch (e) {
              failed++;
              console.warn("\u6279\u91CF\u5220\u9664\u5931\u8D25", id, e);
            }
          }
          if (current.id && ids.includes(current.id)) {
            current.id = null;
            switchView("shelf");
          }
          yield loadState();
          toast(failed ? `\u5DF2\u5220\u9664 ${done} \u672C\uFF0C${failed} \u672C\u5220\u9664\u5931\u8D25` : `\u5DF2\u5220\u9664 ${done} \u672C`);
        });
      }
      function openCategoryPicker(bookIds) {
        var _a2;
        const byId = new Map(allBooks().map((b) => [b.id, b]));
        const ids = [...new Set(bookIds)].filter((id) => byId.has(id));
        if (!ids.length) {
          toast("\u8BF7\u5148\u9009\u62E9\u8981\u6574\u7406\u7684\u4E66");
          return;
        }
        const checked = /* @__PURE__ */ new Set();
        for (const c of flatten(((_a2 = state.collections) == null ? void 0 : _a2.root) || [])) {
          if (ids.every((id) => (byId.get(id).collection_ids || []).includes(c.id))) checked.add(c.id);
        }
        const title = ids.length === 1 ? "\u8C03\u6574\u5206\u7C7B \xB7 " + (byId.get(ids[0]).title || "") : "\u8C03\u6574\u5206\u7C7B \xB7 \u5DF2\u9009 " + ids.length + " \u672C";
        function paint() {
          var _a3;
          const cols = flatten(((_a3 = state.collections) == null ? void 0 : _a3.root) || []);
          const rows = cols.length ? cols.map((c) => {
            const num = allBooks().filter((b) => (b.collection_ids || []).includes(c.id)).length;
            return `<label class="cat-row" style="padding-left:${8 + c.depth * 14}px">
        <input type="checkbox" data-cat="${esc(c.id)}" ${checked.has(c.id) ? "checked" : ""}>
        <span class="cat-name">${esc(c.name)}</span><span class="cat-num">${num} \u672C</span></label>`;
          }).join("") : '<div class="cat-empty">\u8FD8\u6CA1\u6709\u5206\u7C7B\uFF0C\u5728\u4E0B\u9762\u8F93\u5165\u540D\u5B57\u65B0\u5EFA\u4E00\u4E2A</div>';
          showModal(
            `<h2>${esc(title)}</h2>
      <p class="mdesc">\u52FE\u9009\u8981\u628A\u8FD9\u4E9B\u4E66\u653E\u8FDB\u53BB\u7684\u5206\u7C7B\uFF1B\u53D6\u6D88\u52FE\u9009\u5373\u4ECE\u8BE5\u5206\u7C7B\u79FB\u51FA\uFF08\u6279\u91CF\u65F6\u4F1A\u4F5C\u7528\u4E8E\u6240\u9009\u7684\u5168\u90E8\u4E66\uFF09\u3002
        \u4E00\u672C\u4E66\u53EF\u4EE5\u540C\u65F6\u5C5E\u4E8E\u591A\u4E2A\u5206\u7C7B\u3002</p>
      <div class="cat-list">${rows}</div>
      <div class="cat-new">
        <input type="text" id="cat-new-name" placeholder="\u65B0\u5206\u7C7B\u540D\u79F0" autocomplete="off">
        <button id="cat-new-add" class="ghost">\uFF0B \u65B0\u5EFA\u5E76\u52FE\u9009</button>
      </div>
      <div class="modal-actions">
        <button id="cat-cancel">\u53D6\u6D88</button><button id="cat-ok" class="solid">\u4FDD\u5B58</button>
      </div>`,
            (m) => {
              m.querySelectorAll("[data-cat]").forEach((cb) => {
                cb.onchange = () => {
                  if (cb.checked) checked.add(cb.dataset.cat);
                  else checked.delete(cb.dataset.cat);
                };
              });
              m.querySelector("#cat-new-add").onclick = () => __async(null, null, function* () {
                const inp = m.querySelector("#cat-new-name");
                const name = inp.value.trim();
                if (!name) {
                  toast("\u5148\u8F93\u5165\u5206\u7C7B\u540D");
                  inp.focus();
                  return;
                }
                const tree = treeRoot();
                const node = {
                  id: "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                  name,
                  children: [],
                  hidden: false
                };
                tree.push(node);
                yield api("set-collections", { tree });
                yield loadState();
                checked.add(node.id);
                paint();
              });
              m.querySelector("#cat-cancel").onclick = closeModal;
              m.querySelector("#cat-ok").onclick = () => __async(null, null, function* () {
                var _a4;
                const colIds = flatten(((_a4 = state.collections) == null ? void 0 : _a4.root) || []).map((c) => c.id);
                let changed = 0;
                for (const id of ids) {
                  const b = allBooks().find((x2) => x2.id === id);
                  if (!b) continue;
                  const keep = (b.collection_ids || []).filter((x2) => !colIds.includes(x2));
                  const next = [.../* @__PURE__ */ new Set([...keep, ...colIds.filter((x2) => checked.has(x2))])];
                  if (next.slice().sort().join("|") !== (b.collection_ids || []).slice().sort().join("|")) {
                    yield api("set-book-collections", { id, collectionIds: next });
                    changed++;
                  }
                }
                closeModal();
                yield loadState();
                toast(changed ? "\u5DF2\u66F4\u65B0 " + changed + " \u672C\u4E66\u7684\u5206\u7C7B" : "\u5206\u7C7B\u6CA1\u6709\u53D8\u5316");
              });
            }
          );
        }
        paint();
      }
      function defaultBackupName() {
        const d = /* @__PURE__ */ new Date();
        const p = (n) => ("0" + n).slice(-2);
        return "\u5F00\u653E\u4E66\u5E93\u5907\u4EFD-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + ".openlib";
      }
      function exportLibrary2() {
        return __async(this, null, function* () {
          if (window.AndroidNative) {
            const last = typeof window.AndroidNative.lastBackupName === "function" && window.AndroidNative.lastBackupName() || "";
            const name = yield askText(
              "\u5BFC\u51FA\u6574\u5E93\u5907\u4EFD",
              "\u7ED9\u5907\u4EFD\u8D77\u4E2A\u540D\u5B57\uFF0C\u4E0B\u4E00\u6B65\u5728\u7CFB\u7EDF\u4FDD\u5B58\u7A97\u53E3\u91CC\u9009\u4FDD\u5B58\u4F4D\u7F6E" + (last ? "\uFF1B\u4E0A\u6B21\u5907\u4EFD\uFF1A" + last : ""),
              defaultBackupName()
            );
            if (!name) return;
            window.__orBackupName = name;
          }
          androidExport("/api/export-library");
        });
      }
      function openSettings() {
        return __async(this, null, function* () {
          const s = state.settings;
          const a = shelfAppearance(s);
          const updater = !!(window.AndroidNative && typeof window.AndroidNative.checkUpdate === "function");
          const isAndroid = !!window.AndroidNative;
          const statsOn = isAndroid && typeof window.AndroidNative.statsOptIn === "function" && window.AndroidNative.statsOptIn();
          const appVersion = (document.querySelector('meta[name="or-version"]') || {}).content || "";
          const bookCount = (state.books || []).length;
          const totalBytes = (state.books || []).reduce((n, b) => n + (Number(b.size_bytes) || 0), 0);
          const lastBackup = isAndroid && typeof window.AndroidNative.lastBackupName === "function" ? window.AndroidNative.lastBackupName() || "" : "";
          const humanBytes = (n) => n >= 1073741824 ? (n / 1073741824).toFixed(1) + " GB" : n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? (n / 1024).toFixed(1) + " KB" : n + " B";
          showModal(`<h2>\u8BBE\u7F6E</h2><p class="mdesc">\u504F\u597D\u4FDD\u5B58\u5728\u4E66\u5E93\u76EE\u5F55\u7684 <b>settings.json</b>\uFF0C\u968F\u4E66\u5E93\u4E00\u8D77\u5907\u4EFD\u3001\u4E00\u8D77\u8FC1\u79FB\u3002</p>
    <div class="setting-row"><span>\u4E66\u67B6\u6392\u5217</span><span class="sv">
      ${[["grid", "\u5C01\u9762\u7F51\u683C"], ["list", "\u7D27\u51D1\u5217\u8868"]].map(([v, t]) => `<button class="chip-btn ${a.view === v ? "on" : ""}" data-shelf-v="${v}">${t}</button>`).join("")}</span></div>
    <div class="setting-row"><span>\u5C01\u9762\u5C3A\u5BF8</span><span class="sv">
      ${SHELF_DENSITIES.map((v) => `<button class="chip-btn ${a.density === v ? "on" : ""}" data-density-v="${v}">${DENSITY_LABEL[v]}</button>`).join("")}</span></div>
    <div class="setting-row"><span>\u9605\u8BFB\u4E3B\u9898</span><span class="sv">
      ${[["light", "\u660E\u4EAE"], ["sepia", "\u62A4\u773C"], ["dark", "\u6DF1\u591C"]].map(([v, t]) => `<button class="chip-btn ${s.theme === v ? "on" : ""}" data-theme-v="${v}">${t}</button>`).join("")}</span></div>
    <div class="setting-row"><span>\u5B57\u4F53</span><span class="sv">
      <button class="chip-btn ${s.font_family !== "sans" ? "on" : ""}" data-font="serif">\u886C\u7EBF</button>
      <button class="chip-btn ${s.font_family === "sans" ? "on" : ""}" data-font="sans">\u9ED1\u4F53</button></span></div>
    <div class="setting-row"><span>\u5B57\u53F7</span><span class="sv">
      <button class="chip-btn" id="s-minus">\u2212</button><b id="s-fsize">${s.font_size}px</b>
      <button class="chip-btn" id="s-plus">\uFF0B</button></span></div>
    <div class="setting-row"><span>\u884C\u8DDD</span><span class="sv">
      <input type="number" id="s-lh" min="1.2" max="3" step="0.1" value="${s.line_height}"></span></div>
    <div class="setting-row"><span>\u6BCF\u9875\u5B57\u6570</span><span class="sv">
      <input type="number" id="s-page" min="500" max="50000" step="500" value="${s.page_size}"></span></div>
    <div class="setting-row"><span>\u9605\u8BFB\u65B9\u5F0F</span><span class="sv">
      ${[["scroll", "\u8FDE\u7EED\u6EDA\u52A8"], ["page", "\u4EFF\u771F\u7FFB\u4E66"]].map(([v, t]) => `<button class="chip-btn ${readMode === v ? "on" : ""}" data-mode-v="${v}">${t}</button>`).join("")}</span></div>
    <div class="setting-row"><span>\u7FFB\u4E66\u52A8\u753B</span><span class="sv">
      ${[["book", "\u4EFF\u771F"], ["slide", "\u6ED1\u52A8"], ["none", "\u65E0\u52A8\u753B"]].map(([v, t]) => `<button class="chip-btn ${(s.page_effect || "book") === v ? "on" : ""}" data-effect-v="${v}">${t}</button>`).join("")}</span></div>
    <div class="setting-row"><span>\u5168\u5C4F\u9605\u8BFB</span><span class="sv">
      <span class="muted">\u53CC\u51FB\u6B63\u6587 / F11 / Esc</span></span></div>
    <div class="setting-row"><span>\u5168\u6587\u7D22\u5F15</span><span class="sv">
      <span class="muted">${esc(state.index.kind)}${state.index.tokenizer ? " / " + esc(state.index.tokenizer) : ""}</span>
      <button class="chip-btn" id="s-reindex">\u91CD\u5EFA</button></span></div>
    ${isAndroid ? `<label>\u4E66\u5E93\u6570\u636E\uFF08\u5168\u90E8\u4FDD\u5B58\u5728\u672C\u673A\uFF0C\u5378\u8F7D\u4F1A\u6E05\u7A7A\uFF09</label>
    <div class="path-box lib-stat">\u5171 <b>${bookCount}</b> \u672C\u4E66 \xB7 \u539F\u4EF6\u7EA6 ${humanBytes(totalBytes)}<br>
      \u4E66\u5E93\u5728\u672C\u673A\u79C1\u6709\u5B58\u50A8\uFF0C\u6587\u4EF6\u7BA1\u7406\u5668\u91CC\u770B\u4E0D\u5230\u3002\u5907\u4EFD\u53EF\u81EA\u5DF1\u8D77\u540D\u5B57\u3001\u9009\u4FDD\u5B58\u4F4D\u7F6E\uFF1B
      \u6062\u590D\u65F6\u4F1A\u81EA\u52A8\u6253\u5F00\u4E0A\u6B21\u5907\u4EFD\u6240\u5728\u7684\u4F4D\u7F6E\u3002${lastBackup ? `<br>\u4E0A\u6B21\u5907\u4EFD\uFF1A<b>${esc(lastBackup)}</b>` : ""}</div>
    <div class="setting-row"><span>\u6570\u636E\u7BA1\u7406</span><span class="sv">
      <button class="chip-btn" id="s-export">\u5BFC\u51FA\u6574\u5E93\u5907\u4EFD</button>
      <button class="chip-btn" id="s-import">\u4ECE\u5907\u4EFD\u6062\u590D</button></span></div>` : `<label>\u4E66\u5E93\u76EE\u5F55\uFF08\u6570\u636E\u5168\u90E8\u5728\u8FD9\u91CC\uFF0C\u6362\u7535\u8111\u6574\u4E2A\u62F7\u8D70\u5373\u53EF\uFF09</label>
    <div class="path-box">${esc(state.root)}</div>
    <div class="setting-row"><span>\u6570\u636E\u7BA1\u7406</span><span class="sv">
      <button class="chip-btn" id="s-export">\u5BFC\u51FA\u6574\u5E93</button>
      <button class="chip-btn" id="s-open-dir">\u6253\u5F00\u76EE\u5F55</button></span></div>`}
    ${suggestUrl() ? `<div class="setting-row"><span>\u610F\u89C1\u53CD\u9988</span><span class="sv">
      <button class="chip-btn" id="s-suggest">\u63D0\u5EFA\u8BAE / \u770B\u53CD\u9988</button></span></div>` : ""}
    ${isAndroid ? `<div class="setting-row"><span>\u533F\u540D\u4F7F\u7528\u7EDF\u8BA1</span><span class="sv">
      <button class="chip-btn ${statsOn ? "on" : ""}" id="s-stats" title="\u53EA\u4E0A\u62A5\u533F\u540D\u8BBE\u5907\u53F7\u3001\u7248\u672C\u3001\u673A\u578B\uFF0C\u4E0D\u542B\u4E66\u540D\u4E0E\u6587\u4EF6">${statsOn ? "\u5DF2\u5F00\u542F" : "\u5DF2\u5173\u95ED"}</button></span></div>
    <p class="mdesc" style="margin:-6px 0 10px">\u7EDF\u8BA1\u53EA\u8BB0\u5F55\u8BBE\u5907\u6570\u4E0E\u4F7F\u7528\u6D3B\u8DC3\u5EA6\uFF0C\u4E0D\u4E0A\u4F20\u4E66\u540D\u3001\u8DEF\u5F84\u6216\u4E66\u7C4D\u5185\u5BB9\uFF0C\u53EF\u968F\u65F6\u5173\u95ED\u3002</p>` : ""}
    ${updater ? `<div class="setting-row"><span>\u5E94\u7528\u66F4\u65B0</span><span class="sv">
      <span class="muted">v${esc(appVersion)}</span>
      <button class="chip-btn" id="s-update">\u68C0\u67E5\u66F4\u65B0</button></span></div>` : ""}
    <div class="modal-actions"><button id="m-close" class="solid">\u5B8C\u6210</button></div>`, (m) => {
            const patch = (p) => __async(null, null, function* () {
              state.settings = yield api("set-settings", { patch: p });
              applySettings(state.settings);
            });
            m.querySelectorAll("[data-shelf-v]").forEach((b) => b.onclick = () => __async(null, null, function* () {
              if (b.dataset.shelfV === a.view) return;
              yield setShelfAppearance({ view: b.dataset.shelfV });
              openSettings();
            }));
            m.querySelectorAll("[data-density-v]").forEach((b) => b.onclick = () => __async(null, null, function* () {
              if (b.dataset.densityV === a.density) return;
              yield setShelfAppearance({ density: b.dataset.densityV });
              openSettings();
            }));
            m.querySelectorAll("[data-theme-v]").forEach((b) => b.onclick = () => __async(null, null, function* () {
              yield patch({ theme: b.dataset.themeV });
              openSettings();
            }));
            m.querySelectorAll("[data-font]").forEach((b) => b.onclick = () => __async(null, null, function* () {
              yield patch({ font_family: b.dataset.font });
              openSettings();
            }));
            m.querySelector("#s-minus").onclick = () => __async(null, null, function* () {
              yield changeFont(-2);
              openSettings();
            });
            m.querySelector("#s-plus").onclick = () => __async(null, null, function* () {
              yield changeFont(2);
              openSettings();
            });
            m.querySelector("#s-lh").onchange = (e) => __async(null, null, function* () {
              return patch({ line_height: Number(e.target.value) || 1.8 });
            });
            m.querySelector("#s-page").onchange = (e) => __async(null, null, function* () {
              return patch({ page_size: Number(e.target.value) || 6e3 });
            });
            m.querySelectorAll("[data-mode-v]").forEach((b) => b.onclick = () => __async(null, null, function* () {
              if (b.dataset.modeV === readMode) return;
              yield toggleReadMode();
              openSettings();
            }));
            m.querySelectorAll("[data-effect-v]").forEach((b) => b.onclick = () => __async(null, null, function* () {
              yield patch({ page_effect: b.dataset.effectV });
              openSettings();
            }));
            m.querySelector("#s-reindex").onclick = () => __async(null, null, function* () {
              const r = yield api("reindex", { full: true });
              toast(`\u7D22\u5F15\u91CD\u5EFA\u5B8C\u6210\uFF1A${r.indexed} \u672C`);
            });
            m.querySelector("#s-export").onclick = () => exportLibrary2();
            const openDirBtn = m.querySelector("#s-open-dir");
            if (openDirBtn) openDirBtn.onclick = () => desktop == null ? void 0 : desktop.openLibraryDir();
            const importBtn = m.querySelector("#s-import");
            if (importBtn) importBtn.onclick = () => {
              closeModal();
              if (lastBackup) toast("\u5DF2\u6253\u5F00\u4E0A\u6B21\u5907\u4EFD\u6240\u5728\u4F4D\u7F6E\uFF0C\u9009\u62E9 .openlib \u6587\u4EF6\u5373\u53EF");
              $("lib-input").click();
            };
            const suggestBtn = m.querySelector("#s-suggest");
            if (suggestBtn) suggestBtn.onclick = () => {
              closeModal();
              switchView("suggest");
              renderSuggest();
            };
            const statsBtn = m.querySelector("#s-stats");
            if (statsBtn) statsBtn.onclick = () => {
              const on = !window.AndroidNative.statsOptIn();
              window.AndroidNative.setStatsOptIn(on);
              toast(on ? "\u5DF2\u5F00\u542F\u533F\u540D\u4F7F\u7528\u7EDF\u8BA1" : "\u5DF2\u5173\u95ED\u533F\u540D\u4F7F\u7528\u7EDF\u8BA1");
              openSettings();
            };
            const upBtn = m.querySelector("#s-update");
            if (upBtn) upBtn.onclick = () => {
              closeModal();
              window.AndroidNative.checkUpdate(true);
            };
            m.querySelector("#m-close").onclick = closeModal;
          });
        });
      }
      function openAbout() {
        showModal(
          `<h2>\u5173\u4E8E \u5F00\u653E\u4E66\u5E93</h2>
    <p class="mdesc">\u7248\u672C 1.15.0 \xB7 \u514D\u8D39\u3001\u79BB\u7EBF\u3001\u5F00\u653E\u683C\u5F0F\u7684\u4E2A\u4EBA\u7535\u5B50\u4E66\u7BA1\u7406\u5668\u3002<br>
    \u672C\u8F6F\u4EF6\u4E3A\u72EC\u7ACB\u4F5C\u54C1\uFF0C\u4E0D\u96B6\u5C5E\u4E8E\u4EFB\u4F55\u7B2C\u4E09\u65B9\u9605\u8BFB\u5668\uFF0C\u4E5F\u4E0D\u5305\u542B\u4EFB\u4F55\u5185\u7F6E\u4E66\u5E93\u3002</p>
    <div class="setting-row"><span>\u6570\u636E\u5F52\u5C5E</span><span class="muted">\u5168\u90E8\u5728\u4E66\u5E93\u76EE\u5F55\uFF0C\u53EF\u968F\u65F6\u62F7\u8D70</span></div>
    <div class="setting-row"><span>\u652F\u6301\u683C\u5F0F</span><span class="muted" style="text-align:right">PDF / EPUB / MOBI / DOCX / DOC / RTF / ODT / FB2 / MHTML / TXT / MD / HTML</span></div>
    <div class="setting-row"><span>\u626B\u63CF\u7248 PDF</span><span class="muted">\u6309\u539F\u9875\u56FE\u7247\u8FDE\u7EED\u6D4F\u89C8\uFF0C\u65E0 OCR</span></div>
    <div class="setting-row"><span>\u6C42\u4E66</span><span class="muted">\u7531\u7EF4\u62A4\u8005\u7EDF\u4E00\u914D\u7F6E\uFF0C\u4EC5\u63D0\u4EA4\u4E0E\u67E5\u8BE2\u65F6\u8054\u7F51</span></div>
    <div class="setting-row"><span>\u8D26\u53F7 / \u6536\u8D39</span><span class="muted">\u5747\u65E0</span></div>
    <div class="setting-row"><span>\u7D22\u5F15\u5F15\u64CE</span><span class="muted">${esc(state.index.kind)}</span></div>
    <p class="mdesc" style="margin-top:16px">\u539F\u4EF6\u4E0D\u6539\u5199\uFF0C<b>.index/</b> \u53EF\u968F\u65F6\u5220\u9664\u91CD\u5EFA\uFF1B
      <b>.openlib</b> \u662F\u6807\u51C6 ZIP\uFF0C\u4EFB\u4F55\u89E3\u538B\u8F6F\u4EF6\u90FD\u80FD\u6253\u5F00\u3002\u4E66\u5E93\u683C\u5F0F\u89C4\u8303\u4E0E\u7A0B\u5E8F\u4E00\u8D77\u63D0\u4F9B\uFF0C
      \u540E\u7EED Android \u7AEF\u5C06\u76F4\u63A5\u8BFB\u53D6\u540C\u4E00\u4EFD\u76EE\u5F55\u3002</p>
    <div class="modal-actions"><button id="m-close" class="solid">\u77E5\u9053\u4E86</button></div>`,
          (m) => {
            m.querySelector("#m-close").onclick = closeModal;
          }
        );
      }
      function bind() {
        $("btn-import").onclick = () => $("file-input").click();
        $("file-input").onchange = (e) => __async(null, null, function* () {
          yield importFiles([...e.target.files]);
          e.target.value = "";
        });
        $("btn-import-dir").onclick = () => $("dir-input").click();
        $("dir-input").onchange = (e) => __async(null, null, function* () {
          yield importFiles([...e.target.files]);
          e.target.value = "";
        });
        $("btn-import-lib").onclick = () => $("lib-input").click();
        $("lib-input").onchange = (e) => __async(null, null, function* () {
          if (e.target.files[0]) yield importLibrary(e.target.files[0]);
          e.target.value = "";
        });
        const shelfViewBtn = $("btn-shelf-view");
        if (shelfViewBtn) shelfViewBtn.onclick = () => {
          const a = shelfAppearance(state && state.settings);
          setShelfAppearance({ view: a.view === "list" ? "grid" : "list" });
        };
        const shelfDensityBtn = $("btn-shelf-density");
        if (shelfDensityBtn) shelfDensityBtn.onclick = () => cycleShelfDensity();
        $("sort-by").onchange = (e) => setSort({ sort_by: e.target.value });
        $("btn-sort-dir").onclick = () => setSort({ toggle_dir: true });
        $("btn-export-lib").onclick = () => exportLibrary2();
        $("btn-reindex").onclick = () => __async(null, null, function* () {
          const r = yield api("reindex", { full: true });
          toast(`\u7D22\u5F15\u91CD\u5EFA\u5B8C\u6210\uFF1A\u626B\u63CF ${r.scanned} \u672C\uFF0C\u66F4\u65B0 ${r.indexed} \u672C`);
        });
        $("btn-settings").onclick = openSettings;
        $("btn-about").onclick = openAbout;
        $("btn-add-collection").onclick = () => addCollection();
        $("btn-bulk").onclick = () => setBulkMode(!bulkMode);
        $("bulk-exit").onclick = () => setBulkMode(false);
        $("bulk-all").onclick = () => {
          const list = visibleBooks();
          if (bulkSelected.size >= list.length) bulkSelected.clear();
          else list.forEach((b) => bulkSelected.add(b.id));
          renderShelf();
        };
        $("bulk-invert").onclick = () => {
          bulkSelected = new Set(visibleBooks().filter((b) => !bulkSelected.has(b.id)).map((b) => b.id));
          renderShelf();
        };
        $("bulk-cat").onclick = () => {
          if (!bulkSelected.size) {
            toast("\u5148\u52FE\u9009\u8981\u6574\u7406\u7684\u4E66");
            return;
          }
          openCategoryPicker([...bulkSelected]);
        };
        $("bulk-delete").onclick = () => bulkDeleteSelected();
        $("bulk-clear").onclick = () => __async(null, null, function* () {
          if (!bulkSelected.size) {
            toast("\u5148\u52FE\u9009\u8981\u6574\u7406\u7684\u4E66");
            return;
          }
          if (!(yield askConfirm(
            "\u79FB\u51FA\u5168\u90E8\u5206\u7C7B",
            "\u628A\u9009\u4E2D\u7684 " + bulkSelected.size + " \u672C\u4E66\u79FB\u51FA\u6240\u6709\u5206\u7C7B\uFF1F\u4E66\u7C4D\u672C\u8EAB\u4E0D\u4F1A\u88AB\u5220\u9664\u3002",
            true
          ))) return;
          for (const id of bulkSelected) yield api("set-book-collections", { id, collectionIds: [] });
          yield loadState();
          toast("\u5DF2\u79FB\u51FA\u5168\u90E8\u5206\u7C7B");
        });
        document.querySelectorAll(".nav-item").forEach((n) => n.onclick = () => {
          const v = n.dataset.view;
          const from = view;
          filter.collectionId = null;
          if (v === "bookmarks") {
            switchView("bookmarks");
          } else if (v === "request") {
            switchView("request");
            renderRequest();
          } else if (v === "shuku") {
            switchView("shuku");
            renderShuku();
          } else {
            filter.nav = v;
            filter.collectionId = v === "recent" ? "__recent" : v === "unfiled" ? "__unfiled" : null;
            switchView("shelf");
          }
          renderAll();
          if (from === "request" && v !== "request") refreshUnread();
        });
        window.addEventListener("focus", () => refreshUnread());
        $("btn-back").onclick = () => {
          stopScan();
          switchView("shelf");
          current.id = null;
          renderAll();
        };
        $("btn-suggest-back").onclick = () => {
          switchView("shelf");
          renderAll();
        };
        $("btn-toc-collapse").onclick = () => {
          $("view-reader").classList.add("toc-collapsed");
          $("btn-toc-expand").classList.remove("hidden");
        };
        $("btn-toc-expand").onclick = () => {
          $("view-reader").classList.remove("toc-collapsed");
          $("btn-toc-expand").classList.add("hidden");
          if (current.chapterId) setActiveChapter(current.chapterId, true);
        };
        const tocFilter = $("toc-filter");
        tocFilter.oninput = () => renderToc(tocFilter.value);
        tocFilter.onkeydown = (e) => {
          var _a2;
          if (e.key !== "Enter") return;
          e.preventDefault();
          const raw = tocFilter.value.trim();
          const n = Number(raw);
          const first = $("toc-list").querySelector(".toc-item");
          const byNumber = /^\d+$/.test(raw) && n >= 1 ? tocChapterForNumber(n) : null;
          const idx = byNumber ? current.chapters.indexOf(byNumber) : Number((_a2 = first == null ? void 0 : first.dataset.index) != null ? _a2 : -1);
          tocFilter.value = "";
          renderToc();
          if (idx >= 0) gotoChapter(idx, 0);
        };
        $("btn-next").onclick = gotoNext;
        $("btn-prev").onclick = gotoPrev;
        $("btn-read-mode").onclick = toggleReadMode;
        $("btn-immersive").onclick = toggleImmersive;
        $("btn-exit-immersive").onclick = () => setImmersive(false);
        const contentEl = $("content");
        contentEl.addEventListener("click", (e) => {
          if (view !== "reader" || !$("modal-mask").classList.contains("hidden")) return;
          if (book.swiped) {
            book.swiped = false;
            return;
          }
          if (e.target && e.target.closest && e.target.closest("button, a, input, select")) return;
          const x2 = Number(e.clientX) || 0, y = Number(e.clientY) || 0, t = Date.now();
          const near = Math.abs(x2 - book.lastX) < 34 && Math.abs(y - book.lastY) < 34;
          if (book.tapCount && t - book.lastTap < 360 && near) {
            clearTimeout(book.tapTimer);
            book.tapTimer = null;
            book.tapCount = 0;
            book.lastTap = 0;
            toggleImmersive();
            return;
          }
          book.tapCount = 1;
          book.lastTap = t;
          book.lastX = x2;
          book.lastY = y;
          clearTimeout(book.tapTimer);
          book.tapTimer = setTimeout(() => {
            book.tapTimer = null;
            book.tapCount = 0;
            if (!book.active || view !== "reader") return;
            const w = $("content").clientWidth;
            if (x2 < w * 0.32) flipPage(-1);
            else if (x2 > w * 0.68) flipPage(1);
          }, 360);
        });
        let touchStart = null;
        contentEl.addEventListener("touchstart", (e) => {
          touchStart = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
        }, { passive: true });
        contentEl.addEventListener("touchend", (e) => {
          if (!touchStart || !e.changedTouches.length) return;
          const dx = e.changedTouches[0].clientX - touchStart.x;
          const dy = e.changedTouches[0].clientY - touchStart.y;
          touchStart = null;
          if (!book.active || view !== "reader") return;
          if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            book.swiped = true;
            clearTimeout(book.tapTimer);
            book.tapTimer = null;
            book.tapCount = 0;
            book.lastTap = 0;
            flipPage(dx < 0 ? 1 : -1);
            setTimeout(() => {
              book.swiped = false;
            }, 450);
          }
        }, { passive: true });
        window.addEventListener("resize", scheduleBookRelayout);
        contentEl.addEventListener("wheel", (e) => {
          if (view !== "reader" || scan.active || stream.active || e.ctrlKey || e.metaKey || e.altKey) return;
          if (!$("modal-mask").classList.contains("hidden")) return;
          const t = Date.now();
          if (wheel.busy || t < wheel.until) return;
          const dir = Math.sign(e.deltaY);
          if (!dir) return;
          const atEnd = contentEl.scrollTop + contentEl.clientHeight >= contentEl.scrollHeight - 2;
          const atStart = contentEl.scrollTop <= 0;
          if (dir > 0 && !atEnd || dir < 0 && !atStart) {
            wheel.dir = dir;
            wheel.acc = 0;
            return;
          }
          if (dir !== wheel.dir) {
            wheel.dir = dir;
            wheel.acc = 0;
          }
          wheel.acc += Math.abs(e.deltaY);
          if (wheel.acc < 120) return;
          wheel.acc = 0;
          wheel.busy = true;
          e.preventDefault();
          const p = dir > 0 ? gotoNext() : gotoPrev();
          Promise.resolve(p).catch(() => {
          }).finally(() => {
            wheel.busy = false;
            wheel.until = Date.now() + 600;
            wheel.acc = 0;
          });
        }, { passive: false });
        $("btn-font-lg").onclick = () => changeFont(2);
        $("btn-font-sm").onclick = () => changeFont(-2);
        $("btn-theme").onclick = cycleTheme;
        $("btn-export-book").onclick = () => {
          if (current.id) androidExport("/api/export-book?id=" + encodeURIComponent(current.id));
        };
        $("btn-bookmark").onclick = () => __async(null, null, function* () {
          var _a2;
          if (!current.id || !current.chapterId) return;
          yield api("add-bookmark", {
            id: current.id,
            chapter_id: current.chapterId,
            offset: current.offset,
            note: ((_a2 = current.chapters.find((c) => c.id === current.chapterId)) == null ? void 0 : _a2.title) || ""
          });
          toast("\u5DF2\u6DFB\u52A0\u4E66\u7B7E");
          yield loadState();
        });
        $("search").oninput = (e) => {
          clearTimeout(searchTimer);
          const q = e.target.value.trim();
          filter.q = q;
          renderShelf();
          const box = $("search-result");
          if (!q) {
            box.classList.add("hidden");
            return;
          }
          searchTimer = setTimeout(() => __async(null, null, function* () {
            try {
              const r = yield api("search", { q });
              box.classList.remove("hidden");
              box.innerHTML = `<div class="muted" style="font-size:11px;padding:2px 10px 6px">\u5168\u6587\u547D\u4E2D ${r.results.length} \u6761</div>` + (r.results.length ? r.results.map((h) => `<div class="hit" data-id="${esc(h.bookId)}"><b>${esc(h.title)}</b><p>${esc(h.snippet)}</p></div>`).join("") : '<div class="hit muted">\u6CA1\u6709\u5339\u914D\u7ED3\u679C</div>');
              box.querySelectorAll(".hit[data-id]").forEach((el) => el.onclick = () => openBook(el.dataset.id));
            } catch (err2) {
              toast("\u641C\u7D22\u5931\u8D25\uFF1A" + err2.message);
            }
          }), 250);
        };
        document.addEventListener("keydown", (e) => {
          var _a2;
          if (e.key === "Escape") {
            if (!$("modal-mask").classList.contains("hidden")) {
              closeModal();
              return;
            }
            $("context-menu").classList.add("hidden");
            if (immersive) {
              setImmersive(false);
              return;
            }
            if (view === "reader") {
              stopScan();
              switchView("shelf");
              current.id = null;
              renderAll();
            }
            return;
          }
          if (e.key === "F11" || (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
            if (view === "reader") {
              e.preventDefault();
              toggleImmersive();
            }
            return;
          }
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "f") {
            e.preventDefault();
            $("search").focus();
            return;
          }
          if (view !== "reader" || ["INPUT", "SELECT", "TEXTAREA"].includes((_a2 = document.activeElement) == null ? void 0 : _a2.tagName)) return;
          if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
            e.preventDefault();
            gotoNext();
          }
          if (e.key === "ArrowLeft" || e.key === "PageUp") {
            e.preventDefault();
            gotoPrev();
          }
        });
        let dragDepth = 0;
        document.addEventListener("dragenter", (e) => {
          var _a2, _b2;
          if (!((_b2 = (_a2 = e.dataTransfer) == null ? void 0 : _a2.types) == null ? void 0 : _b2.includes("Files"))) return;
          dragDepth++;
          $("drop-mask").classList.remove("hidden");
        });
        document.addEventListener("dragover", (e) => {
          var _a2, _b2;
          if ((_b2 = (_a2 = e.dataTransfer) == null ? void 0 : _a2.types) == null ? void 0 : _b2.includes("Files")) e.preventDefault();
        });
        document.addEventListener("dragleave", () => {
          if (--dragDepth <= 0) {
            dragDepth = 0;
            $("drop-mask").classList.add("hidden");
          }
        });
        document.addEventListener("drop", (e) => __async(null, null, function* () {
          var _a2, _b2, _c, _d;
          if (!((_b2 = (_a2 = e.dataTransfer) == null ? void 0 : _a2.files) == null ? void 0 : _b2.length) && !((_d = (_c = e.dataTransfer) == null ? void 0 : _c.items) == null ? void 0 : _d.length)) return;
          e.preventDefault();
          dragDepth = 0;
          $("drop-mask").classList.add("hidden");
          const files = yield collectDroppedFiles(e.dataTransfer);
          yield importFiles(files);
        }));
        if (desktop) {
          desktop.onLibraryChanged(() => loadState().catch((e) => toast("\u5237\u65B0\u5931\u8D25\uFF1A" + e.message)));
          desktop.onMenu((action) => {
            var _a2;
            const map = {
              "import": () => $("file-input").click(),
              "export-library": () => exportLibrary2(),
              "import-library": () => $("lib-input").click(),
              "settings": openSettings,
              "about": openAbout,
              "font-up": () => changeFont(2),
              "font-down": () => changeFont(-2),
              "theme": cycleTheme,
              "reindex": () => api("reindex", { full: true }).then(() => loadState()),
              "back": () => {
                switchView("shelf");
                current.id = null;
                renderAll();
              },
              "bookmark": () => $("btn-bookmark").click(),
              "fullscreen": toggleImmersive
            };
            (_a2 = map[action]) == null ? void 0 : _a2.call(map);
          });
        }
      }
      bind();
      refreshUnread();
      startUnreadPolling();
      loadState().catch((e) => {
        toast("\u521D\u59CB\u5316\u5931\u8D25\uFF1A" + e.message);
        console.error(e);
      });
      var UPDATE_THROTTLE_MS = 24 * 60 * 60 * 1e3;
      function showUpdateDialog(p) {
        const cur = (document.querySelector('meta[name="or-version"]') || {}).content || "";
        showModal(`<h2>\u53D1\u73B0\u65B0\u7248\u672C ${esc(p.name || "")}</h2>
    <p class="mdesc">\u5F53\u524D\u7248\u672C ${esc(cur)}\u3000\u2192\u3000${esc(p.name || "")}</p>
    <p class="mdesc">${esc(p.notes || "\u4FEE\u590D\u4E0E\u4F18\u5316")}</p>
    <p class="mdesc">\u5B89\u88C5\u5305\u7EA6 200 KB\uFF0C\u8986\u76D6\u5B89\u88C5\u4E0D\u4F1A\u6E05\u7A7A\u672C\u5730\u4E66\u5E93\u3002\u9996\u6B21\u66F4\u65B0\u9700\u5141\u8BB8\u4E00\u6B21\u300C\u5B89\u88C5\u672A\u77E5\u5E94\u7528\u300D\u3002</p>
    <div class="modal-actions"><button id="m-cancel">\u7A0D\u540E</button>
      <button id="m-update" class="solid">\u4E0B\u8F7D\u5E76\u5B89\u88C5</button></div>`, (m) => {
          m.querySelector("#m-cancel").onclick = closeModal;
          m.querySelector("#m-update").onclick = () => {
            closeModal();
            window.AndroidNative.downloadAndInstall(p.url || "", p.sha256 || "");
            toast("\u6B63\u5728\u4E0B\u8F7D\u66F4\u65B0\u2026");
          };
        });
      }
      function showPermissionDialog() {
        showModal(`<h2>\u9700\u8981\u5141\u8BB8\u5B89\u88C5</h2>
    <p class="mdesc">\u7CFB\u7EDF\u8981\u6C42\u5148\u5141\u8BB8\u672C\u5E94\u7528\u5B89\u88C5\u672A\u77E5\u6765\u6E90\u5E94\u7528\u3002\u5DF2\u4E3A\u4F60\u6253\u5F00\u8BBE\u7F6E\u9875\uFF0C
      \u52FE\u9009\u300C\u5141\u8BB8\u300D\u540E\u8FD4\u56DE\uFF0C\u70B9\u4E0B\u9762\u6309\u94AE\u91CD\u8BD5\uFF08\u5B89\u88C5\u5305\u5DF2\u4E0B\u8F7D\uFF0C\u4E0D\u4F1A\u91CD\u590D\u4E0B\u8F7D\uFF09\u3002</p>
    <div class="modal-actions"><button id="m-cancel">\u53D6\u6D88</button>
      <button id="m-retry" class="solid">\u91CD\u8BD5\u5B89\u88C5</button></div>`, (m) => {
          m.querySelector("#m-cancel").onclick = closeModal;
          m.querySelector("#m-retry").onclick = () => {
            closeModal();
            window.AndroidNative.installNow();
          };
        });
      }
      window.__orUpdateResult = (p) => {
        if (!p || !p.state) return;
        const manual = !!p.manual;
        if (p.state === "available") {
          showUpdateDialog(p);
          return;
        }
        if (p.state === "latest") {
          if (manual) toast("\u5DF2\u662F\u6700\u65B0\u7248\u672C");
          return;
        }
        if (p.state === "error") {
          if (manual) toast(p.message || "\u68C0\u67E5\u66F4\u65B0\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
          return;
        }
        if (p.state === "need-permission") {
          showPermissionDialog();
          return;
        }
        if (p.state === "downloaded") {
          toast("\u4E0B\u8F7D\u5B8C\u6210\uFF0C\u6B63\u5728\u6253\u5F00\u5B89\u88C5\u754C\u9762\u2026");
          return;
        }
        if (p.state === "installing") {
          toast("\u5DF2\u6253\u5F00\u5B89\u88C5\u754C\u9762\uFF0C\u786E\u8BA4\u540E\u5373\u5B8C\u6210\u66F4\u65B0");
          return;
        }
      };
      function autoCheckUpdate() {
      }
      autoCheckUpdate();
    }
  });

  // app/src/main/assets/android-storage.mjs
  var DB_NAME = "openreader-library";
  var STORE = "files";
  var dbPromise = null;
  var keyCache = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  function request(mode, make) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const r = make(store);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      t.onabort = () => reject(t.error || new Error("IndexedDB transaction aborted"));
    }));
  }
  function allKeys() {
    return __async(this, null, function* () {
      if (!keyCache) keyCache = new Set(yield request("readonly", (s) => s.getAllKeys()));
      return keyCache;
    });
  }
  function get(key) {
    return request("readonly", (s) => s.get(key));
  }
  function put(key, value) {
    return __async(this, null, function* () {
      yield request("readwrite", (s) => s.put(value, key));
      (yield allKeys()).add(key);
    });
  }
  function del(key) {
    return __async(this, null, function* () {
      yield request("readwrite", (s) => s.delete(key));
      (yield allKeys()).delete(key);
    });
  }
  function norm(...parts) {
    var _a2;
    const segs = [];
    const absolute = String((_a2 = parts[0]) != null ? _a2 : "").startsWith("/");
    for (const p of parts) {
      for (const s of String(p != null ? p : "").split(/[\\/]+/)) {
        if (!s || s === ".") continue;
        if (s === "..") segs.pop();
        else segs.push(s);
      }
    }
    return (absolute ? "/" : "") + segs.join("/");
  }
  function toU8(data) {
    if (typeof data === "string") return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return data.slice();
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    throw new Error("writeFile: unsupported data type");
  }
  var AndroidStorage = class {
    join(...parts) {
      return norm(...parts);
    }
    dirname(p) {
      const k = norm(p);
      const i2 = k.lastIndexOf("/");
      return i2 <= 0 ? k.startsWith("/") ? "/" : "" : k.slice(0, i2);
    }
    basename(p) {
      const k = norm(p);
      return k.slice(k.lastIndexOf("/") + 1);
    }
    extname(p) {
      const b = this.basename(p);
      const i2 = b.lastIndexOf(".");
      return i2 > 0 ? b.slice(i2) : "";
    }
    resolve(p) {
      return norm(p);
    }
    exists(p) {
      return __async(this, null, function* () {
        const k = norm(p);
        const keys = yield allKeys();
        if (keys.has(k)) return true;
        const prefix = k === "/" ? "/" : k + "/";
        for (const key of keys) if (key.startsWith(prefix)) return true;
        return false;
      });
    }
    readFile(p) {
      return __async(this, null, function* () {
        const rec = yield get(norm(p));
        if (!rec || rec.kind !== "file") throw new Error("ENOENT: " + norm(p));
        return rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
      });
    }
    readText(p) {
      return __async(this, null, function* () {
        return new TextDecoder("utf-8").decode(yield this.readFile(p));
      });
    }
    writeFile(p, data) {
      return __async(this, null, function* () {
        yield put(norm(p), { kind: "file", bytes: toU8(data), mtime: Date.now() });
      });
    }
    mkdir(p) {
      return __async(this, null, function* () {
        const k = norm(p);
        if (k && k !== "/") yield put(k, { kind: "dir", mtime: Date.now() });
      });
    }
    readdir(p) {
      return __async(this, null, function* () {
        var _a2;
        const k = norm(p);
        const prefix = k === "/" ? "/" : k + "/";
        const keys = [...yield allKeys()];
        const names = /* @__PURE__ */ new Map();
        for (const key of keys) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          if (!rest) continue;
          const first = rest.split("/")[0];
          if (!first) continue;
          const isDir = rest.includes("/") || ((_a2 = yield get(prefix + first)) == null ? void 0 : _a2.kind) === "dir";
          names.set(first, names.get(first) || false || isDir);
        }
        return [...names].map(([name, isDir]) => ({
          name,
          isDirectory: () => isDir,
          isFile: () => !isDir
        }));
      });
    }
    isFile(p) {
      return __async(this, null, function* () {
        const rec = yield get(norm(p));
        return !!rec && rec.kind === "file";
      });
    }
    copyFile(src, dst) {
      return __async(this, null, function* () {
        yield this.writeFile(dst, yield this.readFile(src));
      });
    }
    remove(p) {
      return __async(this, null, function* () {
        const k = norm(p);
        const prefix = k === "/" ? "" : k + "/";
        const doomed = [...yield allKeys()].filter((key) => key === k || prefix && key.startsWith(prefix));
        for (const key of doomed) yield del(key);
      });
    }
    stat(p) {
      return __async(this, null, function* () {
        const rec = yield get(norm(p));
        if (!rec) throw new Error("ENOENT: " + norm(p));
        const isFile = rec.kind === "file";
        return {
          size: isFile ? rec.bytes.length : 0,
          mtimeMs: rec.mtime,
          mtime: new Date(rec.mtime),
          isFile: () => isFile,
          isDirectory: () => !isFile
        };
      });
    }
  };
  function createAndroidStorage() {
    return new AndroidStorage();
  }

  // app/src/main/assets/core/util.mjs
  var FORMAT = "open-library";
  var SCHEMA_VERSION = 1;
  var LIBRARY_FILE = "library.json";
  var COLLECTIONS_FILE = "collections.json";
  var SETTINGS_FILE = "settings.json";
  var BOOKS_DIR = "books";
  var INDEX_DIR = ".index";
  var INDEX_FILE = "search.db";
  var META_FILE = "meta.json";
  var DERIVED_TEXT = "derived/text.txt";
  function uuid() {
    return globalThis.crypto.randomUUID();
  }
  function nowIso() {
    return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  function parseTime(v) {
    if (typeof v !== "string") return -Infinity;
    const t = Date.parse(v);
    return Number.isNaN(t) ? -Infinity : t;
  }
  function sha256Hex(input) {
    return __async(this, null, function* () {
      let bytes;
      if (typeof input === "string") bytes = new TextEncoder().encode(input);
      else if (input instanceof Uint8Array) bytes = input;
      else bytes = new Uint8Array(input);
      const digest = yield globalThis.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    });
  }
  function encode(s) {
    return new TextEncoder().encode(s);
  }
  function decode(bytes) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  function toJson(obj) {
    return encode(JSON.stringify(obj, null, 2) + "\n");
  }
  function fromJson(bytes, fallback = null) {
    try {
      return JSON.parse(typeof bytes === "string" ? bytes : decode(bytes));
    } catch (e) {
      return fallback;
    }
  }
  function safeName(name) {
    const base = String(name || "untitled").split(/[\\/]/).pop();
    const cleaned = base.replace(/[<>:"|?*\x00-\x1f]/g, "_").trim();
    return cleaned.slice(0, 120) || "untitled";
  }
  function extOf(name) {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(safeName(name));
    return m ? m[1].toLowerCase() : "txt";
  }
  function titleFromName(name) {
    return safeName(name).replace(/\.[A-Za-z0-9]{1,8}$/, "").trim() || "\u672A\u547D\u540D";
  }
  function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
  }
  function makeSnippet(body, term, width = 36) {
    const text = String(body || "").replace(/\s+/g, " ");
    const i2 = text.toLowerCase().indexOf(String(term).toLowerCase());
    if (i2 < 0) return text.slice(0, width * 2);
    const a = Math.max(0, i2 - width);
    const b = Math.min(text.length, i2 + term.length + width);
    return (a > 0 ? "\u2026" : "") + text.slice(a, b) + (b < text.length ? "\u2026" : "");
  }

  // app/src/main/assets/core/library.mjs
  var DEFAULT_SETTINGS = {
    theme: "light",
    font_size: 18,
    line_height: 1.8,
    font_family: "serif",
    page_size: 6e3,
    // 书架排列：grid = 封面网格；list = 一行一本的紧凑列表（书名 / 作者 / 进度一目了然）。
    shelf_view: "grid",
    // 网格密度 large / medium / small；只影响封面网格，列表视图行高固定。
    // 默认中档：原来的 196px 大封面在手机上太占面积。
    shelf_density: "medium",
    // 阅读方式：scroll = 上下连续滑动自动续章；page = 仿真书页，一屏一页左右翻动。
    read_mode: "scroll",
    // 翻页动画：book = 3D 仿真翻书（老 WebView 自动降级为 slide）；
    // slide = 横向滑动；none = 直接换页。用户可在设置里关掉动画。
    page_effect: "book",
    // 内置书库维护者的在线页；新建 / 重建书库时自动带上，避免删 data 后页面变空白。
    // 想禁用某一项：把 data/settings.json 对应键改成 ""（磁盘值优先于默认值）。
    qiushu_url: "https://soshu.pythonanywhere.com/qiushu/",
    shuku_url: "https://soshu.pythonanywhere.com/shuku/",
    // 用户建议（内嵌在线页）。与上面两项一样属于程序内置默认值，不写盘。
    suggest_url: "https://soshu.pythonanywhere.com/suggest/"
  };
  function persistableSettings(s) {
    const out = __spreadValues({}, s);
    if (out.qiushu_url === DEFAULT_SETTINGS.qiushu_url) delete out.qiushu_url;
    if (out.shuku_url === DEFAULT_SETTINGS.shuku_url) delete out.shuku_url;
    if (out.suggest_url === DEFAULT_SETTINGS.suggest_url) delete out.suggest_url;
    return out;
  }
  function createLibrary(storage, root, name = "\u6211\u7684\u4E66\u5E93") {
    return __async(this, null, function* () {
      yield storage.mkdir(root);
      yield storage.mkdir(storage.join(root, BOOKS_DIR));
      yield storage.mkdir(storage.join(root, INDEX_DIR));
      const t = nowIso();
      const library = {
        format: FORMAT,
        schema_version: SCHEMA_VERSION,
        library_id: uuid(),
        name,
        created_at: t,
        updated_at: t
      };
      yield storage.writeFile(storage.join(root, LIBRARY_FILE), toJson(library));
      yield storage.writeFile(storage.join(root, COLLECTIONS_FILE), toJson({ updated_at: t, root: [] }));
      yield storage.writeFile(storage.join(root, SETTINGS_FILE), toJson(persistableSettings(DEFAULT_SETTINGS)));
      return library;
    });
  }
  function openLibrary(storage, root, name) {
    return __async(this, null, function* () {
      const libPath = storage.join(root, LIBRARY_FILE);
      if (!(yield storage.exists(libPath))) {
        return yield createLibrary(storage, root, name);
      }
      const library = fromJson(yield storage.readFile(libPath));
      if (!library || library.format !== FORMAT) {
        throw new Error("\u4E0D\u662F\u6709\u6548\u7684\u5F00\u653E\u4E66\u5E93\u76EE\u5F55\uFF08\u7F3A\u5C11 library.json \u6216 format \u4E0D\u5339\u914D\uFF09");
      }
      if (Number(library.schema_version) > SCHEMA_VERSION) {
        throw new Error(`\u4E66\u5E93\u7248\u672C ${library.schema_version} \u9AD8\u4E8E\u672C\u7A0B\u5E8F\u652F\u6301\u7684 ${SCHEMA_VERSION}\uFF0C\u8BF7\u5347\u7EA7\u7A0B\u5E8F\uFF0C\u5DF2\u62D2\u7EDD\u5199\u5165`);
      }
      yield storage.mkdir(storage.join(root, BOOKS_DIR));
      yield storage.mkdir(storage.join(root, INDEX_DIR));
      const colPath = storage.join(root, COLLECTIONS_FILE);
      if (!(yield storage.exists(colPath))) {
        yield storage.writeFile(colPath, toJson({ updated_at: nowIso(), root: [] }));
      }
      const setPath = storage.join(root, SETTINGS_FILE);
      if (!(yield storage.exists(setPath))) {
        yield storage.writeFile(setPath, toJson(persistableSettings(DEFAULT_SETTINGS)));
      }
      return library;
    });
  }
  function getCollections(storage, root) {
    return __async(this, null, function* () {
      const p = storage.join(root, COLLECTIONS_FILE);
      return fromJson(yield storage.readFile(p), { updated_at: nowIso(), root: [] });
    });
  }
  function saveCollections(storage, root, tree) {
    return __async(this, null, function* () {
      const nodes = Array.isArray(tree) ? tree : tree == null ? void 0 : tree.root;
      if (!Array.isArray(nodes)) throw new Error("\u4E66\u67B6\u6811\u683C\u5F0F\u4E0D\u6B63\u786E");
      const value = { updated_at: nowIso(), root: nodes };
      yield storage.writeFile(storage.join(root, COLLECTIONS_FILE), toJson(value));
      return value;
    });
  }
  function getSettings(storage, root) {
    return __async(this, null, function* () {
      const p = storage.join(root, SETTINGS_FILE);
      return __spreadValues(__spreadValues({}, DEFAULT_SETTINGS), fromJson(yield storage.readFile(p), {}));
    });
  }
  function saveSettings(storage, root, patch) {
    return __async(this, null, function* () {
      const next = __spreadValues(__spreadValues({}, yield getSettings(storage, root)), patch || {});
      yield storage.writeFile(storage.join(root, SETTINGS_FILE), toJson(persistableSettings(next)));
      return next;
    });
  }

  // app/src/main/assets/core/chapters.mjs
  var CHAPTER_RE = /^[ \t\u3000]*(?:(?:第[零〇一二三四五六七八九十百千两0-9０-９]{1,12}[章节回卷部篇集])|(?:卷[零〇一二三四五六七八九十百千0-9]{1,12})|(?:Chapter[ \t]+\d+)|(?:序章|楔子|引子|尾声|后记|番外))[ \t\u3000]*[^\n]{0,60}$/gmu;
  var CN_DIGITS = {
    \u96F6: 0,
    "\u3007": 0,
    \u4E00: 1,
    \u4E8C: 2,
    \u4E24: 2,
    \u4E09: 3,
    \u56DB: 4,
    \u4E94: 5,
    \u516D: 6,
    \u4E03: 7,
    \u516B: 8,
    \u4E5D: 9
  };
  function cnNumber(s) {
    var _a2;
    const t = String(s != null ? s : "").replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 65296));
    if (/^\d+$/.test(t)) return Number(t);
    if (!/^[零〇一二两三四五六七八九十百千]+$/.test(t)) return null;
    let total = 0, section = 0, digit = 0;
    for (const ch of t) {
      if (ch === "\u767E" || ch === "\u5343") {
        section += (digit || 1) * (ch === "\u767E" ? 100 : 1e3);
        digit = 0;
      } else if (ch === "\u5341") {
        section += (digit || 1) * 10;
        digit = 0;
      } else {
        digit = (_a2 = CN_DIGITS[ch]) != null ? _a2 : 0;
      }
    }
    return total + section + digit;
  }
  var LEAD_RE = /^[ \t\u3000]*第([零〇一二三四五六七八九十百千两0-9０-９]{1,12})([章节回卷部篇集])/;
  var PART_RE = /[ \t\u3000]*[（(][ \t\u3000]*([零〇一二三四五六七八九十百千两0-9０-９]{1,3})[ \t\u3000]*[）)]?[ \t\u3000]*$/;
  function describeChapterTitle(raw) {
    const title = String(raw != null ? raw : "").trim().slice(0, 60);
    const lead = LEAD_RE.exec(title);
    const num = lead ? cnNumber(lead[1]) : null;
    const afterLead = lead ? title.slice(lead[0].length) : title;
    const partOnTitle = PART_RE.exec(title);
    const partOnBase = PART_RE.exec(afterLead);
    const partNum = partOnBase ? cnNumber(partOnBase[1]) : null;
    const base = (partOnBase ? afterLead.slice(0, partOnBase.index) : afterLead).replace(/[ \t\u3000]+/g, "").trim();
    const clean2 = (partOnTitle ? title.slice(0, partOnTitle.index) : title).trim();
    return { title, num, partNum, base, clean: clean2 };
  }
  function sameGroup(prev, cur) {
    if (!prev || !cur || prev.num == null || cur.num == null) return false;
    if (cur.num !== prev.num + 1) return false;
    if (!prev.base || !cur.base || prev.base !== cur.base) return false;
    if (prev.partNum != null && cur.partNum != null && cur.partNum !== prev.partNum + 1) return false;
    return true;
  }
  function decodeText(bytes) {
    const u82 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const hadBom = u82.length >= 3 && u82[0] === 239 && u82[1] === 187 && u82[2] === 191;
    let encoding = "utf-8";
    let text;
    if (hadBom) {
      text = new TextDecoder("utf-8").decode(u82.subarray(3));
    } else {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(u82);
      } catch (e) {
        encoding = "gb18030";
        text = new TextDecoder("gb18030").decode(u82);
      }
    }
    text = text.replace(/\r\n?/g, "\n");
    return { text, encoding, hadBom };
  }
  function splitChapters(text) {
    const hits = [];
    for (const m of text.matchAll(CHAPTER_RE)) {
      hits.push(__spreadValues({ start: m.index }, describeChapterTitle(m[0])));
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
      marks.push({ start: 0, title: "\u5168\u6587" });
    } else {
      for (const g of groups) {
        const first = g.members[0];
        const last = g.members[g.members.length - 1];
        const merged = g.members.length >= 2 && g.members.some((x2) => x2.partNum != null);
        if (merged && first.num != null && last.num != null && first.base) {
          marks.push({
            start: first.start,
            title: `\u7B2C${first.num}\u2013${last.num}\u7AE0 ${first.base}`,
            num: first.num,
            numEnd: last.num
          });
        } else {
          marks.push(__spreadValues({
            start: first.start,
            title: first.title
          }, first.num != null ? { num: first.num } : {}));
        }
      }
      marks[0] = __spreadProps(__spreadValues({}, marks[0]), { start: 0 });
    }
    return marks.map((m, i2) => __spreadProps(__spreadValues(__spreadValues({
      id: uuid(),
      index: i2,
      title: m.title
    }, m.num != null ? { num: m.num } : {}), m.numEnd != null ? { numEnd: m.numEnd } : {}), {
      locator: {
        kind: "txt_offset",
        start: m.start,
        end: i2 + 1 < marks.length ? marks[i2 + 1].start : text.length
      }
    }));
  }
  function sliceChapter(fullText, chapter, offset = 0, limit = 6e3) {
    var _a2, _b2;
    const start = (_a2 = chapter.locator.start) != null ? _a2 : 0;
    const end = (_b2 = chapter.locator.end) != null ? _b2 : fullText.length;
    const a = Math.min(end, start + Math.max(0, offset | 0));
    const b = Math.min(end, a + Math.max(1, limit | 0));
    return {
      text: fullText.slice(a, b),
      offset: a - start,
      nextOffset: b - start,
      total: end - start,
      done: b >= end
    };
  }

  // app/src/main/assets/vendor/fflate.mjs
  var u8 = Uint8Array;
  var u16 = Uint16Array;
  var i32 = Int32Array;
  var fleb = new u8([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
    /* unused */
    0,
    0,
    /* impossible */
    0
  ]);
  var fdeb = new u8([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    /* unused */
    0,
    0
  ]);
  var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
  var freb = function(eb, start) {
    var b = new u16(31);
    for (var i2 = 0; i2 < 31; ++i2) {
      b[i2] = start += 1 << eb[i2 - 1];
    }
    var r = new i32(b[30]);
    for (var i2 = 1; i2 < 30; ++i2) {
      for (var j = b[i2]; j < b[i2 + 1]; ++j) {
        r[j] = j - b[i2] << 5 | i2;
      }
    }
    return { b, r };
  };
  var _a = freb(fleb, 2);
  var fl = _a.b;
  var revfl = _a.r;
  fl[28] = 258, revfl[258] = 28;
  var _b = freb(fdeb, 0);
  var fd = _b.b;
  var revfd = _b.r;
  var rev = new u16(32768);
  for (i = 0; i < 32768; ++i) {
    x = (i & 43690) >> 1 | (i & 21845) << 1;
    x = (x & 52428) >> 2 | (x & 13107) << 2;
    x = (x & 61680) >> 4 | (x & 3855) << 4;
    rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
  }
  var x;
  var i;
  var hMap = (function(cd, mb, r) {
    var s = cd.length;
    var i2 = 0;
    var l = new u16(mb);
    for (; i2 < s; ++i2) {
      if (cd[i2])
        ++l[cd[i2] - 1];
    }
    var le = new u16(mb);
    for (i2 = 1; i2 < mb; ++i2) {
      le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
    }
    var co;
    if (r) {
      co = new u16(1 << mb);
      var rvb = 15 - mb;
      for (i2 = 0; i2 < s; ++i2) {
        if (cd[i2]) {
          var sv = i2 << 4 | cd[i2];
          var r_1 = mb - cd[i2];
          var v = le[cd[i2] - 1]++ << r_1;
          for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
            co[rev[v] >> rvb] = sv;
          }
        }
      }
    } else {
      co = new u16(s);
      for (i2 = 0; i2 < s; ++i2) {
        if (cd[i2]) {
          co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2];
        }
      }
    }
    return co;
  });
  var flt = new u8(288);
  for (i = 0; i < 144; ++i)
    flt[i] = 8;
  var i;
  for (i = 144; i < 256; ++i)
    flt[i] = 9;
  var i;
  for (i = 256; i < 280; ++i)
    flt[i] = 7;
  var i;
  for (i = 280; i < 288; ++i)
    flt[i] = 8;
  var i;
  var fdt = new u8(32);
  for (i = 0; i < 32; ++i)
    fdt[i] = 5;
  var i;
  var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
  var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
  var max = function(a) {
    var m = a[0];
    for (var i2 = 1; i2 < a.length; ++i2) {
      if (a[i2] > m)
        m = a[i2];
    }
    return m;
  };
  var bits = function(d, p, m) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
  };
  var bits16 = function(d, p) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
  };
  var shft = function(p) {
    return (p + 7) / 8 | 0;
  };
  var slc = function(v, s, e) {
    if (s == null || s < 0)
      s = 0;
    if (e == null || e > v.length)
      e = v.length;
    return new u8(v.subarray(s, e));
  };
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data"
    // determined by unknown compression method
  ];
  var err = function(ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
      Error.captureStackTrace(e, err);
    if (!nt)
      throw e;
    return e;
  };
  var inflt = function(dat, st, buf, dict) {
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
      return buf || new u8(0);
    var noBuf = !buf;
    var resize = noBuf || st.i != 2;
    var noSt = st.i;
    if (noBuf)
      buf = new u8(sl * 3);
    var cbuf = function(l2) {
      var bl = buf.length;
      if (l2 > bl) {
        var nbuf = new u8(Math.max(bl * 2, l2));
        nbuf.set(buf);
        buf = nbuf;
      }
    };
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    var tbts = sl * 8;
    do {
      if (!lm) {
        final = bits(dat, pos, 1);
        var type = bits(dat, pos + 1, 3);
        pos += 3;
        if (!type) {
          var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
          if (t > sl) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + l);
          buf.set(dat.subarray(s, t), bt);
          st.b = bt += l, st.p = pos = t * 8, st.f = final;
          continue;
        } else if (type == 1)
          lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
        else if (type == 2) {
          var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
          var tl = hLit + bits(dat, pos + 5, 31) + 1;
          pos += 14;
          var ldt = new u8(tl);
          var clt = new u8(19);
          for (var i2 = 0; i2 < hcLen; ++i2) {
            clt[clim[i2]] = bits(dat, pos + i2 * 3, 7);
          }
          pos += hcLen * 3;
          var clb = max(clt), clbmsk = (1 << clb) - 1;
          var clm = hMap(clt, clb, 1);
          for (var i2 = 0; i2 < tl; ) {
            var r = clm[bits(dat, pos, clbmsk)];
            pos += r & 15;
            var s = r >> 4;
            if (s < 16) {
              ldt[i2++] = s;
            } else {
              var c = 0, n = 0;
              if (s == 16)
                n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i2 - 1];
              else if (s == 17)
                n = 3 + bits(dat, pos, 7), pos += 3;
              else if (s == 18)
                n = 11 + bits(dat, pos, 127), pos += 7;
              while (n--)
                ldt[i2++] = c;
            }
          }
          var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
          lbt = max(lt);
          dbt = max(dt);
          lm = hMap(lt, lbt, 1);
          dm = hMap(dt, dbt, 1);
        } else
          err(1);
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
      }
      if (resize)
        cbuf(bt + 131072);
      var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
      var lpos = pos;
      for (; ; lpos = pos) {
        var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
        pos += c & 15;
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (!c)
          err(2);
        if (sym < 256)
          buf[bt++] = sym;
        else if (sym == 256) {
          lpos = pos, lm = null;
          break;
        } else {
          var add = sym - 254;
          if (sym > 264) {
            var i2 = sym - 257, b = fleb[i2];
            add = bits(dat, pos, (1 << b) - 1) + fl[i2];
            pos += b;
          }
          var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
          if (!d)
            err(3);
          pos += d & 15;
          var dt = fd[dsym];
          if (dsym > 3) {
            var b = fdeb[dsym];
            dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
          }
          if (pos > tbts) {
            if (noSt)
              err(0);
            break;
          }
          if (resize)
            cbuf(bt + 131072);
          var end = bt + add;
          if (bt < dt) {
            var shift = dl - dt, dend = Math.min(dt, end);
            if (shift + bt < 0)
              err(3);
            for (; bt < dend; ++bt)
              buf[bt] = dict[shift + bt];
          }
          for (; bt < end; ++bt)
            buf[bt] = buf[bt - dt];
        }
      }
      st.l = lm, st.p = lpos, st.b = bt, st.f = final;
      if (lm)
        final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
  };
  var et = /* @__PURE__ */ new u8(0);
  var zls = function(d, dict) {
    if ((d[0] & 15) != 8 || d[0] >> 4 > 7 || (d[0] << 8 | d[1]) % 31)
      err(6, "invalid zlib data");
    if ((d[1] >> 5 & 1) == +!dict)
      err(6, "invalid zlib data: " + (d[1] & 32 ? "need" : "unexpected") + " dictionary");
    return (d[1] >> 3 & 4) + 2;
  };
  function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
  }
  function unzlibSync(data, opts) {
    return inflt(data.subarray(zls(data, opts && opts.dictionary), -4), { i: 2 }, opts && opts.out, opts && opts.dictionary);
  }
  var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
  var tds = 0;
  try {
    td.decode(et, { stream: true });
    tds = 1;
  } catch (e) {
  }

  // app/src/main/assets/core/pdf.mjs
  var latin1 = (b) => {
    let s = "";
    const CH = 32768;
    for (let i2 = 0; i2 < b.length; i2 += CH) {
      s += String.fromCharCode.apply(null, b.subarray(i2, Math.min(i2 + CH, b.length)));
    }
    return s;
  };
  var strBytes = (s) => {
    const u = new Uint8Array(s.length);
    for (let i2 = 0; i2 < s.length; i2++) u[i2] = s.charCodeAt(i2) & 255;
    return u;
  };
  var isTag = (v, k) => v !== null && typeof v === "object" && !Array.isArray(v) && v[k] !== void 0;
  var nameOf = (v) => isTag(v, "name") ? v.name : "";
  var dictOf = (v) => isTag(v, "dict") ? v.dict : {};
  var isKw = (v) => isTag(v, "kw");
  var WS = /* @__PURE__ */ new Set([0, 9, 10, 12, 13, 32]);
  var DELIM = /* @__PURE__ */ new Set([0, 9, 10, 12, 13, 32, 40, 41, 60, 62, 91, 93, 47, 37, 123, 125]);
  var Lexer = class {
    constructor(s, pos = 0) {
      this.s = s;
      this.i = pos;
      this.n = s.length;
    }
    skip() {
      while (this.i < this.n) {
        const c = this.s.charCodeAt(this.i);
        if (WS.has(c)) {
          this.i++;
          continue;
        }
        if (c === 37) {
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
      var _a2;
      this.i++;
      let depth = 1;
      const out = [];
      const ESC = { n: 10, r: 13, t: 9, b: 8, f: 12 };
      while (this.i < this.n && depth > 0) {
        const c = this.s[this.i++];
        if (c === "\\") {
          const nc = this.s[this.i++];
          if (nc === void 0) break;
          if (nc >= "0" && nc <= "7") {
            let oct = nc;
            for (let k = 0; k < 2 && this.s[this.i] >= "0" && this.s[this.i] <= "7"; k++) oct += this.s[this.i++];
            out.push(parseInt(oct, 8) & 255);
          } else if (nc === "\r") {
            if (this.s[this.i] === "\n") this.i++;
          } else if (nc === "\n") {
          } else out.push(((_a2 = ESC[nc]) != null ? _a2 : nc.charCodeAt(0)) & 255);
        } else if (c === "(") {
          depth++;
          out.push(40);
        } else if (c === ")") {
          depth--;
          if (depth > 0) out.push(41);
        } else if (c === "\r") {
          out.push(10);
          if (this.s[this.i] === "\n") this.i++;
        } else out.push(c.charCodeAt(0) & 255);
      }
      return { bytes: new Uint8Array(out) };
    }
    hexString() {
      this.i++;
      const a = this.i;
      while (this.i < this.n && this.s[this.i] !== ">") this.i++;
      const hex = this.s.slice(a, this.i).replace(/[^0-9a-fA-F]/g, "");
      this.i = Math.min(this.n, this.i + 1);
      const h = hex.length % 2 ? hex + "0" : hex;
      const out = new Uint8Array(h.length / 2);
      for (let i2 = 0; i2 < out.length; i2++) out[i2] = parseInt(h.slice(i2 * 2, i2 * 2 + 2), 16);
      return { bytes: out };
    }
    array() {
      this.i++;
      const a = [];
      while (true) {
        this.skip();
        if (this.i >= this.n) break;
        if (this.s[this.i] === "]") {
          this.i++;
          break;
        }
        const v = this.value();
        if (v === null) break;
        if (isKw(v) && v.kw === "]") break;
        a.push(v);
      }
      return a;
    }
    dict() {
      this.i += 2;
      const d = /* @__PURE__ */ Object.create(null);
      while (true) {
        this.skip();
        if (this.i >= this.n) break;
        if (this.s[this.i] === ">" && this.s[this.i + 1] === ">") {
          this.i += 2;
          break;
        }
        const k = this.value();
        if (k === null) break;
        if (isKw(k) && (k.kw === ">" || k.kw === ">>")) break;
        const v = this.value();
        if (isTag(k, "name")) d[k.name] = v === null ? null : v;
      }
      return { dict: d };
    }
    value() {
      this.skip();
      if (this.i >= this.n) return null;
      const c = this.s[this.i];
      if (c === "/") {
        this.i++;
        const w2 = this.word();
        return { name: w2.replace(/#([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))) };
      }
      if (c === "(") return this.literalString();
      if (c === "<" && this.s[this.i + 1] === "<") return this.dict();
      if (c === "<") return this.hexString();
      if (c === "[") return this.array();
      if (c === "]" || c === ">" || c === ")") {
        this.i++;
        return { kw: c };
      }
      const w = this.word();
      if (!w) {
        this.i++;
        return { kw: c };
      }
      if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(w)) {
        if (/^\d+$/.test(w)) {
          const save = this.i;
          this.skip();
          const w2 = this.word();
          this.skip();
          const w3 = this.word();
          if (/^\d+$/.test(w2) && w3 === "R") return { ref: Number(w) };
          this.i = save;
        }
        return Number(w);
      }
      if (w === "true") return true;
      if (w === "false") return false;
      if (w === "null") return null;
      return { kw: w };
    }
  };
  function flate(data) {
    return __async(this, null, function* () {
      try {
        return unzlibSync(data);
      } catch (e) {
      }
      try {
        return inflateSync(data);
      } catch (e) {
      }
      throw new Error("FlateDecode \u6570\u636E\u65E0\u6CD5\u89E3\u538B");
    });
  }
  function asciiHex(data) {
    let s = latin1(data).replace(/[^0-9a-fA-F]/g, "");
    const gt = s.indexOf(">");
    if (gt >= 0) s = s.slice(0, gt);
    if (s.length % 2) s += "0";
    const out = new Uint8Array(s.length / 2);
    for (let i2 = 0; i2 < out.length; i2++) out[i2] = parseInt(s.slice(i2 * 2, i2 * 2 + 2), 16);
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
      const b = [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
      out.push(...b.slice(0, 4 - pad));
      g = [];
    };
    for (let i2 = 0; i2 < s.length; i2++) {
      const ch = s[i2];
      if (ch === "~") break;
      if (WS.has(s.charCodeAt(i2))) continue;
      if (ch === "z" && g.length === 0) {
        out.push(0, 0, 0, 0);
        continue;
      }
      const v = s.charCodeAt(i2) - 33;
      if (v < 0 || v > 84) continue;
      g.push(v);
      if (g.length === 5) flush(0);
    }
    if (g.length) flush(5 - g.length);
    return new Uint8Array(out);
  }
  function runLength(data) {
    const out = [];
    let i2 = 0;
    while (i2 < data.length) {
      const n = data[i2++];
      if (n === 128) break;
      if (n < 128) {
        for (let k = 0; k <= n && i2 < data.length; k++) out.push(data[i2++]);
      } else if (i2 < data.length) {
        const b = data[i2++];
        for (let k = 0; k < 257 - n; k++) out.push(b);
      }
    }
    return new Uint8Array(out);
  }
  function lzw(data, early = 1) {
    let table = [], next = 258, size = 9, bit = 0, prev = null;
    const reset = () => {
      table = [];
      for (let i2 = 0; i2 < 256; i2++) table[i2] = [i2];
      table[256] = null;
      table[257] = null;
      next = 258;
      size = 9;
      prev = null;
    };
    const code = () => {
      let v = 0;
      for (let k = 0; k < size; k++) {
        const b = data[bit >> 3];
        if (b === void 0) return null;
        v = v << 1 | b >> 7 - (bit & 7) & 1;
        bit++;
      }
      return v;
    };
    reset();
    const out = [];
    while (true) {
      const c = code();
      if (c === null) break;
      if (c === 256) {
        reset();
        continue;
      }
      if (c === 257) break;
      let entry;
      if (c < next && table[c]) entry = table[c];
      else if (c === next && prev) entry = [...prev, prev[0]];
      else break;
      out.push(...entry);
      if (prev) {
        table[next++] = [...prev, entry[0]];
        if (next + early >= 1 << size && size < 12) size++;
      }
      prev = entry;
    }
    return new Uint8Array(out);
  }
  function undoPredictor(data, predictor, columns, colors = 1, bpc = 8) {
    const bpp = Math.max(1, Math.ceil(colors * bpc / 8));
    const row = Math.max(1, Math.ceil(columns * colors * bpc / 8));
    if (predictor === 2) {
      const out2 = data.slice();
      for (let i2 = bpp; i2 < out2.length; i2++) out2[i2] = out2[i2] + out2[i2 - bpp] & 255;
      return out2;
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
      for (let i2 = 0; i2 < row; i2++) {
        const raw = data[r * stride + 1 + i2];
        const a = i2 >= bpp ? cur[i2 - bpp] : 0;
        const b = prior[i2];
        const c = i2 >= bpp ? prior[i2 - bpp] : 0;
        let v = raw;
        if (ft === 1) v += a;
        else if (ft === 2) v += b;
        else if (ft === 3) v += a + b >> 1;
        else if (ft === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        cur[i2] = v & 255;
      }
      out.set(cur, r * row);
      prior = cur;
    }
    return out;
  }
  function resolveLength(doc, v) {
    if (typeof v === "number") return v;
    if (isTag(v, "ref")) {
      const st = doc.starts.get(v.ref);
      if (st !== void 0) {
        const lx = new Lexer(doc.s, st);
        const n = lx.value();
        if (typeof n === "number") return n;
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
    if (doc.s.startsWith("stream", lx.i)) {
      let p = lx.i + 6;
      if (doc.s[p] === "\r") {
        p++;
        if (doc.s[p] === "\n") p++;
      } else if (doc.s[p] === "\n") p++;
      const len = resolveLength(doc, d.Length);
      let end = Number.isFinite(len) && len >= 0 ? p + len : -1;
      if (end < 0 || end > doc.s.length) {
        const e = doc.s.indexOf("endstream", p);
        end = e >= 0 ? e : doc.s.length;
        while (end > p && (doc.s[end - 1] === "\n" || doc.s[end - 1] === "\r")) end--;
      }
      const fv = d.Filter;
      const fn = (Array.isArray(fv) ? fv : [fv]).map((x2) => nameOf(x2)).join(",");
      if (/DCTDecode|JPXDecode|CCITTFaxDecode|JBIG2Decode/.test(fn) || nameOf(d.Subtype) === "Image") {
        return { value: v, streamRaw: null, streamOffset: p, streamLength: end - p };
      }
      const raw = strBytes(doc.s.slice(p, end));
      return { value: v, streamRaw: raw, streamOffset: p, streamLength: end - p };
    }
    return { value: v, streamRaw: null };
  }
  function makeDoc(bytes) {
    var _a2, _b2;
    const u82 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const doc = { s: latin1(u82), starts: /* @__PURE__ */ new Map(), objs: /* @__PURE__ */ new Map() };
    const re = /(\d{1,10})\s+(\d{1,5})\s+obj\b/g;
    const found = [];
    let m;
    while (m = re.exec(doc.s)) found.push({ num: Number(m[1]), start: re.lastIndex });
    for (const f of found) if (!doc.starts.has(f.num)) doc.starts.set(f.num, f.start);
    for (const f of found) {
      if (doc.objs.has(f.num)) continue;
      let o;
      try {
        o = parseObjectAt(doc, f.start);
      } catch (e) {
        continue;
      }
      if (!o) continue;
      doc.objs.set(f.num, {
        num: f.num,
        value: o.value,
        dict: dictOf(o.value),
        streamRaw: o.streamRaw,
        streamOffset: (_a2 = o.streamOffset) != null ? _a2 : null,
        streamLength: (_b2 = o.streamLength) != null ? _b2 : null,
        decoded: null
      });
    }
    doc.resolve = (v) => {
      let cur = v, guard = 0;
      while (isTag(cur, "ref") && guard++ < 12) {
        const o = doc.objs.get(cur.ref);
        if (!o) return null;
        cur = o.value;
      }
      return cur;
    };
    doc.resolveObj = (v) => isTag(v, "ref") ? doc.objs.get(v.ref) || null : null;
    doc.stream = (o) => __async(null, null, function* () {
      if (!o || o.streamRaw === null || o.streamRaw === void 0) return null;
      if (o.decoded) return o.decoded;
      const d = o.dict || {};
      const fv = doc.resolve(d.Filter);
      const names = (Array.isArray(fv) ? fv : [fv]).map((x2) => nameOf(doc.resolve(x2))).filter(Boolean);
      let data = o.streamRaw;
      for (const f of names) {
        if (/^(FlateDecode|Fl)$/.test(f)) data = yield flate(data);
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
        data = undoPredictor(
          data,
          Number(doc.resolve(pd.Predictor) || 1),
          Number(doc.resolve(pd.Columns) || 1),
          Number(doc.resolve(pd.Colors) || 1),
          Number(doc.resolve(pd.BitsPerComponent) || 8)
        );
      }
      o.decoded = data;
      return data;
    });
    return doc;
  }
  function expandObjectStreams(doc) {
    return __async(this, null, function* () {
      var _a2;
      for (const o of [...doc.objs.values()]) {
        if (nameOf(doc.resolve((_a2 = o.dict) == null ? void 0 : _a2.Type)) !== "ObjStm") continue;
        let buf;
        try {
          buf = yield doc.stream(o);
        } catch (e) {
          continue;
        }
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
          } catch (e) {
          }
        }
      }
    });
  }
  function utf16be(b) {
    let s = "";
    for (let i2 = 0; i2 + 1 < b.length; i2 += 2) {
      const c = b[i2] << 8 | b[i2 + 1];
      if (c >= 55296 && c <= 56319 && i2 + 3 < b.length) {
        const c2 = b[i2 + 2] << 8 | b[i2 + 3];
        if (c2 >= 56320 && c2 <= 57343) {
          s += String.fromCodePoint(65536 + (c - 55296 << 10) + (c2 - 56320));
          i2 += 2;
          continue;
        }
      }
      if (c >= 32 || c === 10 || c === 13 || c === 9) s += String.fromCharCode(c);
    }
    return s;
  }
  var WINANSI = {
    128: "\u20AC",
    130: "\u201A",
    131: "\u0192",
    132: "\u201E",
    133: "\u2026",
    134: "\u2020",
    135: "\u2021",
    136: "\u02C6",
    137: "\u2030",
    138: "\u0160",
    139: "\u2039",
    140: "\u0152",
    142: "\u017D",
    145: "\u2018",
    146: "\u2019",
    147: "\u201C",
    148: "\u201D",
    149: "\u2022",
    150: "\u2013",
    151: "\u2014",
    152: "\u02DC",
    153: "\u2122",
    154: "\u0161",
    155: "\u203A",
    156: "\u0153",
    158: "\u017E",
    159: "\u0178"
  };
  var winAnsi = (b) => {
    var _a2;
    return (_a2 = WINANSI[b]) != null ? _a2 : String.fromCharCode(b);
  };
  function hexToUnicode(hex) {
    const h = hex.replace(/\s/g, "");
    if (!h || h.length % 2) return "";
    const b = new Uint8Array(h.length / 2);
    for (let i2 = 0; i2 < b.length; i2++) b[i2] = parseInt(h.slice(i2 * 2, i2 * 2 + 2), 16);
    return utf16be(b);
  }
  var hexNum = (hex) => parseInt(hex.replace(/\s/g, ""), 16);
  function parseCMap(s) {
    const map = /* @__PURE__ */ new Map();
    let codeLen = 0;
    const cs = /begincodespacerange([\s\S]*?)endcodespacerange/i.exec(s);
    if (cs) {
      for (const h of cs[1].matchAll(/<([0-9a-fA-F\s]+)>/g)) {
        codeLen = Math.max(codeLen, Math.floor(h[1].replace(/\s/g, "").length / 2));
      }
    }
    const bc = /beginbfchar([\s\S]*?)endbfchar/i.exec(s);
    if (bc) {
      const hs = [...bc[1].matchAll(/<([0-9a-fA-F\s]+)>/g)].map((x2) => x2[1].replace(/\s/g, ""));
      for (let i2 = 0; i2 + 1 < hs.length; i2 += 2) {
        const src = hexNum(hs[i2]);
        if (!Number.isFinite(src)) continue;
        map.set(src, hexToUnicode(hs[i2 + 1]));
        if (!codeLen) codeLen = Math.floor(hs[i2].length / 2);
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
            const h = (start + c - lo).toString(16).padStart(g[3].replace(/\s/g, "").length, "0");
            map.set(c, hexToUnicode(h));
          }
        } else if (g[4]) {
          const items = [...g[4].matchAll(/<([0-9a-fA-F\s]+)>/g)].map((x2) => hexToUnicode(x2[1]));
          for (let c = lo; c <= hi && c - lo < items.length; c++) map.set(c, items[c - lo]);
        }
      }
    }
    return { map, codeLen: codeLen || 1 };
  }
  function glyphNameToUnicode(n) {
    const uni = /^uni([0-9a-fA-F]{4})$/.exec(n) || /^u([0-9a-fA-F]{4,6})$/i.exec(n);
    if (uni) {
      try {
        return String.fromCodePoint(parseInt(uni[1], 16));
      } catch (e) {
        return "";
      }
    }
    if (n.length === 1 && /[A-Za-z0-9]/.test(n)) return n;
    return {
      space: " ",
      hyphen: "-",
      period: ".",
      comma: ",",
      quoteright: "\u2019",
      quoteleft: "\u2018",
      quotedblright: "\u201D",
      quotedblleft: "\u201C",
      emdash: "\u2014",
      endash: "\u2013",
      bullet: "\u2022",
      ellipsis: "\u2026"
    }[n] || "";
  }
  function decodeSimple(bytes, font) {
    var _a2;
    if (!bytes.length) return "";
    if (bytes.length >= 2 && bytes[0] === 254 && bytes[1] === 255) return utf16be(bytes.subarray(2));
    if ((_a2 = font.differences) == null ? void 0 : _a2.size) {
      return [...bytes].map((b) => font.differences.get(b) || winAnsi(b)).join("");
    }
    const enc = font.encName || "";
    if (/GB|UniGB|GBK|Adobe-GB1|Chinese|STSong|HYSMyeongJo/i.test(enc)) {
      try {
        return new TextDecoder("gb18030").decode(bytes);
      } catch (e) {
      }
    }
    if (font.type0 || /Identity|UTF16|UCS2|UniJIS|UniKS|Adobe-Japan/i.test(enc)) {
      const gb = new TextDecoder("gb18030").decode(bytes);
      const bad = (gb.match(/[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f]/g) || []).length;
      return bad > gb.length * 0.15 ? utf16be(bytes) : gb;
    }
    return [...bytes].map(winAnsi).join("");
  }
  function decodeGlyphs(bytes, font = {}) {
    if (!bytes.length) return "";
    const cmap = font.cmap;
    if (!cmap) return decodeSimple(bytes, font);
    const len = cmap.codeLen || (font.type0 ? 2 : 1);
    let out = "", i2 = 0;
    for (; i2 + len <= bytes.length; i2 += len) {
      let code = 0;
      for (let k = 0; k < len; k++) code = code << 8 | bytes[i2 + k];
      const s = cmap.map.get(code);
      if (s !== void 0) out += s;
      else if (len === 2) out += decodeSimple(bytes.subarray(i2, i2 + 2), __spreadProps(__spreadValues({}, font), { cmap: null }));
      else out += winAnsi(code);
    }
    if (i2 < bytes.length) out += decodeSimple(bytes.subarray(i2), __spreadProps(__spreadValues({}, font), { cmap: null }));
    return out;
  }
  function fontsOf(doc, page) {
    return __async(this, null, function* () {
      var _a2, _b2, _c;
      const fonts = /* @__PURE__ */ new Map();
      let node = page, res = null, guard = 0;
      while (node && guard++ < 20) {
        if ((_a2 = node.dict) == null ? void 0 : _a2.Resources) {
          res = doc.resolve(node.dict.Resources);
          break;
        }
        node = doc.resolveObj((_b2 = node.dict) == null ? void 0 : _b2.Parent);
      }
      const fd2 = dictOf(res).Font;
      const fontDict = dictOf(doc.resolve(fd2));
      for (const [key, ref] of Object.entries(fontDict)) {
        const o = doc.resolveObj(ref);
        const d = (o == null ? void 0 : o.dict) || dictOf(doc.resolve(ref));
        const subtype = nameOf(doc.resolve(d.Subtype));
        let touni = d.ToUnicode;
        if (!touni) {
          const desc = doc.resolve(d.DescendantFonts);
          if (Array.isArray(desc) && desc.length) {
            const d0 = doc.resolveObj(desc[0]);
            touni = (_c = d0 == null ? void 0 : d0.dict) == null ? void 0 : _c.ToUnicode;
          }
        }
        let cmap = null;
        if (touni) {
          try {
            const raw = yield doc.stream(doc.resolveObj(touni));
            if (raw) cmap = parseCMap(latin1(raw));
          } catch (e) {
          }
        }
        const encVal = doc.resolve(d.Encoding);
        const encName = nameOf(encVal);
        const differences = /* @__PURE__ */ new Map();
        const diff = dictOf(encVal).Differences;
        if (Array.isArray(diff)) {
          let code = 0;
          for (const it of diff) {
            if (typeof it === "number") code = it;
            else if (isTag(it, "name")) {
              differences.set(code, glyphNameToUnicode(it.name));
              code++;
            }
          }
        }
        fonts.set(key, { type0: subtype === "Type0", cmap, encName, differences, subtype });
      }
      if (!fonts.size) {
        for (const o of doc.objs.values()) {
          if (!o.dict || !o.dict.ToUnicode) continue;
          try {
            const raw = yield doc.stream(doc.resolveObj(o.dict.ToUnicode));
            if (raw) {
              fonts.set("default", { type0: true, cmap: parseCMap(latin1(raw)), encName: "Identity-H", differences: /* @__PURE__ */ new Map() });
              break;
            }
          } catch (e) {
          }
        }
      }
      return fonts;
    });
  }
  var TextBuilder = class {
    constructor() {
      this.lines = [];
      this.cur = "";
      this.y = null;
      this.x = 0;
      this.endX = 0;
      this.size = 12;
    }
    flush() {
      this.lines.push(this.cur.replace(/[ \t]+$/, ""));
      this.cur = "";
    }
    moveTo(x2, y, size) {
      this.size = size || this.size;
      if (this.y !== null && Math.abs(y - this.y) > 0.6) this.flush();
      else if (this.y !== null && x2 > this.endX + this.size * 0.15) this.cur += " ";
      this.y = y;
      this.x = x2;
      this.endX = x2;
    }
    moveRel(tx, ty, size) {
      var _a2;
      this.moveTo(this.x + tx, ((_a2 = this.y) != null ? _a2 : 0) + ty, size);
    }
    nextLine(leading, size) {
      var _a2;
      this.moveTo(this.x, ((_a2 = this.y) != null ? _a2 : 0) - Math.abs(leading || size * 1.2), size);
    }
    append(s) {
      this.cur += s;
      let w = 0;
      for (const ch of s) w += /[\u2e80-\uffff]/.test(ch) ? 1 : 0.5;
      this.endX = this.x + w * this.size;
      this.x = this.endX;
    }
    finish() {
      if (this.cur.trim()) this.flush();
      return this.lines.join("\n");
    }
  };
  function pageText(doc, page, fonts) {
    return __async(this, null, function* () {
      var _a2;
      const cv = (_a2 = page.dict) == null ? void 0 : _a2.Contents;
      const refs = Array.isArray(cv) ? cv : [cv];
      const chunks = [];
      for (const r of refs) {
        const o = doc.resolveObj(r);
        if (!o || o.streamRaw === null || o.streamRaw === void 0) continue;
        try {
          const b = yield doc.stream(o);
          if (b) chunks.push(latin1(b));
        } catch (e) {
        }
      }
      if (!chunks.length) return "";
      const lx = new Lexer(chunks.join("\n"), 0);
      const tb = new TextBuilder();
      let font = null, size = 12, leading = 0;
      const operands = [];
      const at = (k) => operands[operands.length - k];
      const show = (t) => {
        if (t && t.bytes) tb.append(decodeGlyphs(t.bytes, font || {}));
      };
      while (true) {
        let t;
        try {
          t = lx.value();
        } catch (e) {
          break;
        }
        if (t === null) break;
        if (!isKw(t)) {
          operands.push(t);
          continue;
        }
        const op = t.kw;
        switch (op) {
          case "BT":
            if (tb.cur.trim()) tb.flush();
            tb.y = null;
            break;
          case "ET":
            break;
          case "Tf": {
            const nm = nameOf(at(2));
            if (nm) font = fonts.get(nm) || font;
            if (typeof at(1) === "number") size = at(1);
            break;
          }
          case "Tm": {
            const a = operands.slice(-6);
            if (a.length === 6 && a.every((x2) => typeof x2 === "number")) tb.moveTo(a[4], a[5], size);
            break;
          }
          case "Td":
          case "TD": {
            const tx = Number(at(2)), ty = Number(at(1));
            if (Number.isFinite(tx) && Number.isFinite(ty)) {
              tb.moveRel(tx, ty, size);
              if (op === "TD") leading = -ty;
            }
            break;
          }
          case "T*":
            tb.nextLine(leading || size * 1.2, size);
            break;
          case "TL":
            if (typeof at(1) === "number") leading = at(1);
            break;
          case "'":
            tb.nextLine(leading || size * 1.2, size);
            show(at(1));
            break;
          case '"':
            tb.nextLine(leading || size * 1.2, size);
            show(at(1));
            break;
          case "Tj":
            show(at(1));
            break;
          case "TJ": {
            const arr = at(1);
            if (Array.isArray(arr)) {
              for (const it of arr) {
                if (it && it.bytes) show(it);
                else if (typeof it === "number" && it <= -120) tb.append(" ");
              }
            }
            break;
          }
          case "ID": {
            const rest = lx.s.slice(lx.i);
            const e = /\bEI\b/.exec(rest);
            if (e) lx.i += e.index + 2;
            break;
          }
          default:
            break;
        }
        operands.length = 0;
      }
      return tb.finish();
    });
  }
  function collectPages(doc) {
    const all = [...doc.objs.values()];
    const typeOf = (o) => {
      var _a2;
      return nameOf(doc.resolve((_a2 = o == null ? void 0 : o.dict) == null ? void 0 : _a2.Type));
    };
    const roots = all.filter((o) => typeOf(o) === "Pages" && !o.dict.Parent);
    const out = [], seen = /* @__PURE__ */ new Set();
    const walk = (o) => {
      var _a2;
      if (!o || seen.has(o.num)) return;
      seen.add(o.num);
      if (typeOf(o) === "Page") {
        out.push(o);
        return;
      }
      const kids = doc.resolve((_a2 = o.dict) == null ? void 0 : _a2.Kids);
      if (Array.isArray(kids)) for (const k of kids) {
        const ko = doc.resolveObj(k);
        if (ko) walk(ko);
        else if (isTag(k, "dict")) walk({ num: -Math.random(), dict: k.dict });
      }
    };
    for (const r of roots) walk(r);
    for (const o of all.filter((x2) => typeOf(x2) === "Page").sort((a, b) => a.num - b.num)) {
      if (!seen.has(o.num)) {
        out.push(o);
        seen.add(o.num);
      }
    }
    return out;
  }
  function pageImage(doc, page, num) {
    var _a2, _b2, _c;
    let node = page, res = null, guard = 0;
    while (node && guard++ < 20) {
      if ((_a2 = node.dict) == null ? void 0 : _a2.Resources) {
        res = doc.resolve(node.dict.Resources);
        break;
      }
      node = doc.resolveObj((_b2 = node.dict) == null ? void 0 : _b2.Parent);
    }
    const xobj = dictOf(doc.resolve(dictOf(res).XObject));
    let best = null;
    for (const [, ref] of Object.entries(xobj)) {
      const io = doc.resolveObj(ref);
      if (!io || !io.streamOffset || !io.streamLength) continue;
      if (nameOf(doc.resolve((_c = io.dict) == null ? void 0 : _c.Subtype)) !== "Image") continue;
      const fv = doc.resolve(io.dict.Filter);
      const fn = (Array.isArray(fv) ? fv : [fv]).map((x2) => nameOf(doc.resolve(x2))).join(",");
      const mime = /DCTDecode/.test(fn) ? "image/jpeg" : /JPXDecode/.test(fn) ? "image/jp2" : null;
      if (!mime) continue;
      if (!best || io.streamLength > best.length) {
        best = { offset: io.streamOffset, length: io.streamLength, mime };
      }
    }
    return best ? __spreadValues({ page: num }, best) : null;
  }
  function normalize(s) {
    return String(s || "").replace(/\r/g, "").replace(/[ \t]+$/gm, "").split("\n").map((x2) => x2.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function infoOf(doc) {
    for (const o of doc.objs.values()) {
      const d = o.dict;
      if (!d || !d.Title && !d.Author) continue;
      const str = (v) => {
        const r = doc.resolve(v);
        if (!r || !r.bytes) return "";
        if (r.bytes.length >= 2 && r.bytes[0] === 254 && r.bytes[1] === 255) return utf16be(r.bytes.subarray(2));
        try {
          return new TextDecoder("utf-8", { fatal: true }).decode(r.bytes);
        } catch (e) {
          return [...r.bytes].map(winAnsi).join("");
        }
      };
      return { title: str(d.Title).slice(0, 120), author: str(d.Author).slice(0, 120) };
    }
    return { title: "", author: "" };
  }
  var unsupported = (error) => ({
    text: "",
    chapters: [],
    encoding: null,
    parse_status: "unsupported",
    title: "",
    author: "",
    error
  });
  function parsePdf(bytes) {
    return __async(this, null, function* () {
      var _a2;
      const u82 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (latin1(u82.subarray(0, 5)).indexOf("%PDF-") !== 0) {
        return unsupported("\u4E0D\u662F\u6709\u6548\u7684 PDF \u6587\u4EF6\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559");
      }
      let doc;
      try {
        doc = makeDoc(u82);
      } catch (e) {
        return unsupported("PDF \u7ED3\u6784\u65E0\u6CD5\u89E3\u6790\uFF1A" + ((e == null ? void 0 : e.message) || String(e)));
      }
      if (/\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(doc.s)) {
        return unsupported("\u52A0\u5BC6 PDF \u6682\u4E0D\u89E3\u6790\uFF08\u4E0D\u505A\u7834\u89E3\uFF09\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559\uFF0C\u53EF\u70B9\u300C\u5BFC\u51FA\u300D\u53D6\u56DE");
      }
      yield expandObjectStreams(doc);
      const pages = collectPages(doc);
      if (!pages.length) return unsupported("\u672A\u627E\u5230 PDF \u9875\u9762\u5BF9\u8C61\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559");
      const outputs = [];
      for (let i2 = 0; i2 < pages.length; i2++) {
        const fonts = yield fontsOf(doc, pages[i2]);
        let text2 = "";
        try {
          text2 = yield pageText(doc, pages[i2], fonts);
        } catch (e) {
        }
        outputs.push({ page: i2 + 1, text: normalize(text2) });
      }
      const withText = outputs.filter((p) => p.text);
      if (!withText.length) {
        const imagePages = [];
        for (let i2 = 0; i2 < pages.length; i2++) {
          const im = pageImage(doc, pages[i2], i2 + 1);
          if (im) imagePages.push(im);
        }
        if (imagePages.length) {
          const chunks2 = [];
          let text2 = "";
          for (const p of imagePages) {
            const prefix = chunks2.length ? "\n\n" : "";
            const label = `\u7B2C ${p.page} \u9875\uFF08\u626B\u63CF\u56FE\u7247\uFF09`;
            chunks2.push({
              title: label,
              start: text2.length + prefix.length,
              image: { kind: "pdf_image", offset: p.offset, length: p.length, mime: p.mime }
            });
            text2 += prefix + label;
          }
          const chapters2 = chunks2.map((c, i2) => ({
            id: uuid(),
            index: i2,
            title: c.title,
            image: c.image,
            locator: {
              kind: "txt_offset",
              start: c.start,
              end: i2 + 1 < chunks2.length ? chunks2[i2 + 1].start : text2.length
            }
          }));
          const info2 = infoOf(doc);
          return {
            text: text2,
            chapters: chapters2,
            encoding: "pdf/image",
            parse_status: "ok",
            title: info2.title,
            author: info2.author,
            notice: "\u626B\u63CF\u7248 PDF\uFF1A\u6309\u539F\u9875\u56FE\u7247\u663E\u793A\uFF0C\u65E0\u6587\u5B57\u5C42\uFF0C\u4E0D\u652F\u6301\u5168\u6587\u68C0\u7D22"
          };
        }
        return unsupported("\u672A\u68C0\u6D4B\u5230\u6587\u5B57\u5C42\uFF0C\u4E5F\u6CA1\u6709\u6D4F\u89C8\u5668\u53EF\u76F4\u63A5\u663E\u793A\u7684\u9875\u9762\u56FE\u7247\uFF1B\u626B\u63CF\u7248 OCR \u4E0D\u5728\u652F\u6301\u8303\u56F4\u5185\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559");
      }
      const chunks = [];
      let text = "";
      for (const p of withText) {
        const prefix = chunks.length ? "\n\n" : "";
        const first = ((_a2 = p.text.split("\n").find((x2) => x2.trim())) == null ? void 0 : _a2.trim()) || "";
        const title = `\u7B2C ${p.page} \u9875` + (first && first.length <= 18 ? ` \xB7 ${first}` : "");
        chunks.push({ title, start: text.length + prefix.length });
        text += prefix + p.text;
      }
      const chapters = chunks.map((c, i2) => ({
        id: uuid(),
        index: i2,
        title: c.title,
        locator: {
          kind: "txt_offset",
          start: c.start,
          end: i2 + 1 < chunks.length ? chunks[i2 + 1].start : text.length
        }
      }));
      const info = infoOf(doc);
      return {
        text,
        chapters,
        encoding: "pdf/text",
        parse_status: "ok",
        title: info.title,
        author: info.author,
        notice: outputs.length > withText.length ? `\u5171 ${outputs.length} \u9875\uFF0C\u5176\u4E2D ${outputs.length - withText.length} \u9875\u65E0\u6587\u5B57\u5C42\uFF08\u5DF2\u8DF3\u8FC7\uFF09` : ""
      };
    });
  }

  // app/src/main/assets/core/formats.mjs
  var TD = (b, enc = "utf-8") => new TextDecoder(enc).decode(b);
  var latin12 = (b) => {
    let s = "";
    for (let i2 = 0; i2 < b.length; i2 += 32768) {
      s += String.fromCharCode.apply(null, b.subarray(i2, Math.min(i2 + 32768, b.length)));
    }
    return s;
  };
  function buildFromBlocks(blocks) {
    const parts = [], marks = [];
    let cursor = 0;
    for (const b of blocks) {
      if (b.heading) marks.push({ start: cursor, title: (b.text || "").slice(0, 60) });
      const seg = b.text + "\n\n";
      parts.push(seg);
      cursor += seg.length;
    }
    const text = parts.join("");
    if (!text.trim()) return { text: "", chapters: [] };
    const ms = marks.length ? marks : [{ start: 0, title: "\u5168\u6587" }];
    if (ms[0].start > 0) ms[0] = __spreadProps(__spreadValues({}, ms[0]), { start: 0 });
    const chapters = ms.map((m, i2) => ({
      id: uuid(),
      index: i2,
      title: m.title || "\u5168\u6587",
      locator: {
        kind: "txt_offset",
        start: m.start,
        end: i2 + 1 < ms.length ? ms[i2 + 1].start : text.length
      }
    }));
    return { text, chapters };
  }
  function clean(s) {
    return String(s || "").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  }
  function decodeByCharset(bytes, charset, ctx) {
    const c = String(charset || "").toLowerCase().replace(/["'\s]/g, "");
    const table = {
      "gb2312": "gb18030",
      "gbk": "gb18030",
      "gb18030": "gb18030",
      "big5": "big5",
      "utf-8": "utf-8",
      "utf8": "utf-8",
      "utf-16": "utf-16le",
      "utf-16le": "utf-16le",
      "windows-1252": "windows-1252",
      "iso-8859-1": "windows-1252",
      "cp1252": "windows-1252"
    };
    try {
      if (table[c]) return TD(bytes, table[c]);
    } catch (e) {
    }
    return ctx.decodeText(bytes).text;
  }
  var RTF_SKIP = /* @__PURE__ */ new Set([
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "header",
    "footer",
    "footnote",
    "annotation",
    "generator",
    "listtable",
    "listoverridetable",
    "revtbl",
    "rsidtbl",
    "xmlnstbl",
    "themedata",
    "datastore",
    "object",
    "fldinst",
    "filetbl"
  ]);
  function parseRtf(bytes, ctx) {
    var _a2;
    const u82 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const s = latin12(u82);
    if (!/^\{\s*\\rtf/i.test(s)) throw new Error("\u4E0D\u662F\u6709\u6548\u7684 RTF \u6587\u6863");
    const cpg = ((_a2 = /\\ansicpg(\d+)/i.exec(s)) == null ? void 0 : _a2[1]) || "1252";
    const codepage = { "936": "gb18030", "950": "big5", "65001": "utf-8", "1252": "windows-1252" }[cpg] || "windows-1252";
    let ucSkip = 1;
    const stack = [];
    const blocks = [];
    let cur = "";
    const pushBlock = () => {
      if (cur.trim()) blocks.push({ text: clean(cur), heading: false });
      cur = "";
    };
    let i2 = 0;
    while (i2 < s.length) {
      const ch = s[i2];
      const skip = stack.some((g) => g.skip);
      if (ch === "{") {
        stack.push({ skip, ignorable: false });
        i2++;
        continue;
      }
      if (ch === "}") {
        stack.pop();
        i2++;
        continue;
      }
      if (ch === "\\") {
        i2++;
        if (i2 >= s.length) break;
        const nc = s[i2];
        if (nc === "{" || nc === "}" || nc === "\\") {
          if (!skip) cur += nc;
          i2++;
          continue;
        }
        if (nc === "\n" || nc === "\r") {
          i2++;
          if (nc === "\r" && s[i2] === "\n") i2++;
          continue;
        }
        if (nc === "*") {
          if (stack.length) stack[stack.length - 1].skip = true;
          i2++;
          continue;
        }
        if (nc === "'") {
          const buf = [];
          while (i2 < s.length) {
            if (s[i2] === "'" && /^[0-9a-fA-F]{2}$/.test(s.slice(i2 + 1, i2 + 3))) {
              buf.push(parseInt(s.slice(i2 + 1, i2 + 3), 16));
              i2 += 3;
            } else if (s[i2] === "\\" && s[i2 + 1] === "'" && /^[0-9a-fA-F]{2}$/.test(s.slice(i2 + 2, i2 + 4))) {
              buf.push(parseInt(s.slice(i2 + 2, i2 + 4), 16));
              i2 += 4;
            } else break;
          }
          if (!skip && buf.length) cur += TD(new Uint8Array(buf), codepage);
          continue;
        }
        const m = /^([a-zA-Z]{1,32})(-?\d+)? ?/.exec(s.slice(i2));
        if (!m) {
          i2++;
          continue;
        }
        const word = m[1], param = m[2] === void 0 ? null : Number(m[2]);
        i2 += m[0].length;
        if (RTF_SKIP.has(word)) {
          if (stack.length) stack[stack.length - 1].skip = true;
          continue;
        }
        if (word === "uc") {
          ucSkip = Math.max(0, param != null ? param : 1);
          continue;
        }
        if (word === "u") {
          let cp = param != null ? param : 0;
          if (cp < 0) cp += 65536;
          if (!skip) cur += String.fromCharCode(cp);
          for (let k = 0; k < ucSkip && i2 < s.length; k++) {
            if (s[i2] === "\\" && s[i2 + 1] === "'" && /^[0-9a-fA-F]{2}$/.test(s.slice(i2 + 2, i2 + 4))) i2 += 4;
            else i2++;
          }
          continue;
        }
        if (word === "par" || word === "line") {
          pushBlock();
          continue;
        }
        if (word === "tab") {
          if (!skip) cur += "	";
          continue;
        }
        if (word === "enspace" || word === "emspace") {
          if (!skip) cur += " ";
          continue;
        }
        continue;
      }
      if (!skip && ch !== "\r" && ch !== "\n") cur += ch;
      i2++;
    }
    pushBlock();
    if (!blocks.length) throw new Error("RTF \u4E2D\u672A\u627E\u5230\u53EF\u9605\u8BFB\u7684\u6587\u5B57");
    const { text } = buildFromBlocks(blocks);
    return {
      text,
      chapters: ctx.splitChapters(text),
      encoding: "rtf/" + codepage,
      parse_status: "ok",
      title: "",
      author: ""
    };
  }
  function parseOdt(bytes, ctx) {
    return __async(this, null, function* () {
      var _a2, _b2;
      const zip = yield ctx.readZip(bytes);
      const content = yield zip.text("content.xml");
      if (content === null) throw new Error("ODT \u7F3A\u5C11 content.xml");
      const meta = (yield zip.text("meta.xml")) || "";
      const blocks = [];
      for (const m of content.matchAll(/<text:h\b[^>]*>([\s\S]*?)<\/text:h>|<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)) {
        const isH = m[0].startsWith("<text:h");
        const t = ctx.htmlToText((_b2 = (_a2 = m[1]) != null ? _a2 : m[2]) != null ? _b2 : "");
        if (!t) continue;
        blocks.push({ text: t, heading: isH });
      }
      if (!blocks.length) {
        const t = ctx.htmlToText(content.replace(/<\?xml[^>]*\?>/gi, "").replace(/<office:body\b[^>]*>|<\/office:body>/gi, "\n"));
        if (t) blocks.push({ text: t, heading: false });
      }
      if (!blocks.length) throw new Error("ODT \u4E2D\u672A\u627E\u5230\u53EF\u9605\u8BFB\u7684\u6587\u5B57");
      const { text, chapters } = buildFromBlocks(blocks);
      return {
        text,
        chapters,
        encoding: "odt/utf-8",
        parse_status: "ok",
        title: ctx.tagText(meta, "title") || "",
        author: ctx.tagText(meta, "creator") || ""
      };
    });
  }
  function parseFb2(bytes, ctx) {
    return __async(this, null, function* () {
      var _a2, _b2, _c, _d, _e;
      const xml = typeof bytes === "string" ? bytes : ctx.decodeText(bytes).text;
      const desc = ((_a2 = /<description\b[^>]*>([\s\S]*?)<\/description>/i.exec(xml)) == null ? void 0 : _a2[1]) || "";
      const title = ctx.tagText(desc, "book-title");
      const author = [ctx.tagText(desc, "first-name"), ctx.tagText(desc, "last-name")].filter(Boolean).join(" ");
      const body = ((_b2 = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(xml)) == null ? void 0 : _b2[1]) || ((_c = /<body\b[^>]*>([\s\S]*)/i.exec(xml)) == null ? void 0 : _c[1]) || "";
      const blocks = [];
      for (const m of body.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>|<p\b[^>]*>([\s\S]*?)<\/p>|<empty-line\s*\/?>/gi)) {
        if (!m[1] && !m[2]) {
          blocks.push({ text: "", heading: false });
          continue;
        }
        const t = ctx.htmlToText((_e = (_d = m[1]) != null ? _d : m[2]) != null ? _e : "");
        if (!t) continue;
        blocks.push({ text: t, heading: !!m[1] });
      }
      if (!blocks.length) {
        const t = ctx.htmlToText(body);
        if (t) blocks.push({ text: t, heading: false });
      }
      if (!blocks.length) throw new Error("FB2 \u4E2D\u672A\u627E\u5230\u6B63\u6587");
      const solid = blocks.filter((b) => b.text);
      const { text, chapters } = buildFromBlocks(solid);
      return { text, chapters, encoding: "fb2/xml", parse_status: "ok", title, author };
    });
  }
  function b64decode(s) {
    const clean2 = s.replace(/\s/g, "");
    const bin = atob(clean2);
    const out = new Uint8Array(bin.length);
    for (let i2 = 0; i2 < bin.length; i2++) out[i2] = bin.charCodeAt(i2);
    return out;
  }
  function qpDecode(s) {
    const out = [];
    const t = s.replace(/=\r?\n/g, "");
    for (let i2 = 0; i2 < t.length; i2++) {
      if (t[i2] === "=" && /^[0-9a-fA-F]{2}$/.test(t.slice(i2 + 1, i2 + 3))) {
        out.push(parseInt(t.slice(i2 + 1, i2 + 3), 16));
        i2 += 2;
      } else {
        const c = t.charCodeAt(i2);
        if (c < 128) out.push(c);
        else out.push(...new TextEncoder().encode(t[i2]));
      }
    }
    return new Uint8Array(out);
  }
  function parseMhtml(bytes, ctx) {
    return __async(this, null, function* () {
      var _a2, _b2, _c, _d, _e, _f;
      const raw = ctx.decodeText(bytes).text;
      const cut = /\r?\n\r?\n/.exec(raw);
      const headers = cut ? raw.slice(0, cut.index) : raw;
      const body = cut ? raw.slice(cut.index + cut[0].length) : "";
      const boundary = (_a2 = /boundary\s*=\s*"?([^";\r\n]+)"?/i.exec(headers)) == null ? void 0 : _a2[1];
      if (!boundary) {
        const html = ctx.htmlToText(raw);
        return {
          text: html,
          chapters: ctx.splitChapters(html),
          encoding: "mhtml",
          parse_status: "ok",
          title: "",
          author: ""
        };
      }
      const re = new RegExp("--" + boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const pieces = body.split(re);
      let best = null;
      for (const piece of pieces) {
        const p = piece.replace(/^\s*\r?\n/, "");
        const hm = /\r?\n\r?\n/.exec(p);
        if (!hm) continue;
        const ph = p.slice(0, hm.index);
        const pb = p.slice(hm.index + hm[0].length);
        const ct = /content-type\s*:\s*([^;\r\n]+)(?:[^\r\n]*charset\s*=\s*"?([^"\r\n;]+)"?)?/i.exec(ph);
        const type = ((ct == null ? void 0 : ct[1]) || "").toLowerCase().trim();
        if (type && type !== "text/html" && type !== "text/plain") continue;
        const enc = ((_c = (_b2 = /content-transfer-encoding\s*:\s*(\S+)/i.exec(ph)) == null ? void 0 : _b2[1]) == null ? void 0 : _c.toLowerCase()) || "";
        const charset = ((_d = /charset\s*=\s*"?([^"\r\n;]+)"?/i.exec(ph)) == null ? void 0 : _d[1]) || "utf-8";
        const data = enc === "base64" ? b64decode(pb.replace(/--\s*$/, "")) : enc === "quoted-printable" ? qpDecode(pb) : new TextEncoder().encode(pb);
        const html = decodeByCharset(data, charset, ctx);
        const candidate = { html, type };
        if (type === "text/html") {
          best = candidate;
          break;
        }
        if (!best) best = candidate;
      }
      if (!best) throw new Error("MHTML \u4E2D\u672A\u627E\u5230 HTML \u6216\u6587\u672C\u90E8\u5206");
      const text = ctx.htmlToText(best.html);
      const title = ((_f = (_e = /subject\s*:\s*(.+)/i.exec(headers)) == null ? void 0 : _e[1]) == null ? void 0 : _f.trim()) || ctx.tagText(best.html, "title") || "";
      return {
        text,
        chapters: ctx.splitChapters(text),
        encoding: "mhtml",
        parse_status: "ok",
        title,
        author: ""
      };
    });
  }
  function palmDocDecompress(data) {
    const out = [];
    let i2 = 0;
    while (i2 < data.length) {
      const c = data[i2++];
      if (c >= 192) {
        out.push(32, c ^ 128);
      } else if (c >= 128) {
        if (i2 >= data.length) break;
        const pair = c << 8 | data[i2++];
        const dist = pair >> 3 & 2047;
        const n = (pair & 7) + 3;
        for (let k = 0; k < n; k++) {
          const v = out[out.length - dist];
          out.push(v === void 0 ? 32 : v);
        }
      } else if (c >= 9) out.push(c);
      else if (c >= 1) {
        for (let k = 0; k < c && i2 < data.length; k++) out.push(data[i2++]);
      } else if (i2 < data.length) out.push(data[i2++]);
    }
    return new Uint8Array(out);
  }
  function parseMobi(bytes, ctx) {
    return __async(this, null, function* () {
      const u82 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const dv = new DataView(u82.buffer, u82.byteOffset, u82.byteLength);
      const type = latin12(u82.subarray(60, 64));
      const creator = latin12(u82.subarray(64, 68));
      if (u82.length < 80 || type !== "BOOK" && creator !== "MOBI") {
        throw new Error("\u4E0D\u662F\u6709\u6548\u7684 MOBI/PDB \u5BB9\u5668");
      }
      const numRecords = dv.getUint16(76, false);
      if (!numRecords || 78 + numRecords * 8 > u82.length) throw new Error("MOBI \u8BB0\u5F55\u8868\u635F\u574F");
      const offsets = [];
      for (let i2 = 0; i2 < numRecords; i2++) offsets.push(dv.getUint32(78 + i2 * 8, false));
      const rec = (i2) => {
        const a = offsets[i2];
        const b = i2 + 1 < numRecords ? offsets[i2 + 1] : u82.length;
        if (a === void 0 || b > u82.length || b < a) throw new Error("MOBI \u8BB0\u5F55\u504F\u79FB\u8D8A\u754C");
        return u82.subarray(a, b);
      };
      const r0 = rec(0);
      if (r0.length < 16) throw new Error("MOBI \u7F3A\u5C11 PalmDOC \u5934");
      const dv0 = new DataView(r0.buffer, r0.byteOffset, r0.byteLength);
      const compression = dv0.getUint16(0, false);
      const textLength = dv0.getUint32(4, false);
      const textRecords = dv0.getUint16(8, false);
      if (compression === 17480) {
        return {
          text: "",
          chapters: [],
          encoding: null,
          parse_status: "unsupported",
          title: "",
          author: "",
          error: "HUFF/CDIC \u538B\u7F29\u7684 MOBI \u6682\u4E0D\u89E3\u6790\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559"
        };
      }
      if (compression !== 1 && compression !== 2) {
        return {
          text: "",
          chapters: [],
          encoding: null,
          parse_status: "unsupported",
          title: "",
          author: "",
          error: `\u4E0D\u652F\u6301\u7684 MOBI \u538B\u7F29\u65B9\u5F0F ${compression}\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559`
        };
      }
      let charset = "utf-8";
      const mobiMagic = latin12(r0.subarray(16, 20));
      if (mobiMagic === "MOBI" && r0.length >= 24 + 32) {
        const enc = dv0.getUint32(16 + 28, false);
        if (enc === 1252) charset = "windows-1252";
      }
      let title = "", author = "";
      const flags = dv0.getUint16(12, false);
      if (flags & 64) {
        const exthOff = 16 + dv0.getUint32(16 + 20, false);
        if (latin12(r0.subarray(exthOff, exthOff + 4)) === "EXTH") {
          const count = dv0.getUint32(exthOff + 8, false);
          let p = exthOff + 12;
          for (let i2 = 0; i2 < count && p + 8 <= r0.length; i2++) {
            const t = dv0.getUint32(p, false), len = dv0.getUint32(p + 4, false);
            if (len < 8 || p + len > r0.length) break;
            const val = decodeByCharset(r0.subarray(p + 8, p + len), charset, ctx);
            if (t === 503 && !title) title = val.slice(0, 120);
            if (t === 100 && !author) author = val.slice(0, 120);
            p += len;
          }
        }
      }
      const chunks = [];
      for (let i2 = 1; i2 <= Math.min(textRecords, numRecords - 1); i2++) {
        const r = rec(i2);
        chunks.push(compression === 2 ? palmDocDecompress(r) : r);
      }
      let total = 0;
      for (const c of chunks) total += c.length;
      const buf = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) {
        buf.set(c, at);
        at += c.length;
      }
      const data = textLength > 0 && textLength <= buf.length ? buf.subarray(0, textLength) : buf;
      let html = decodeByCharset(data, charset, ctx);
      if (/<html|<body|<p\b|<h[1-6]\b|<mbp:/i.test(html) === false && /[\u0000-\u0008]{20,}/.test(html)) {
        return {
          text: "",
          chapters: [],
          encoding: null,
          parse_status: "unsupported",
          title,
          author,
          error: "AZW3/KF8 \u7ED3\u6784\u6682\u4E0D\u89E3\u6790\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559\uFF0C\u53EF\u70B9\u300C\u5BFC\u51FA\u300D\u53D6\u56DE"
        };
      }
      html = html.replace(/<mbp:pagebreak\s*\/?>/gi, "\n").replace(/<\s*br\s*\/?\s*>/gi, "\n").replace(/<\/\s*(?:p|div|h[1-6]|li)\s*>/gi, "\n");
      const text = clean(ctx.htmlToText(html));
      if (!text) throw new Error("MOBI \u4E2D\u672A\u627E\u5230\u53EF\u9605\u8BFB\u7684\u6587\u5B57");
      return {
        text,
        chapters: ctx.splitChapters(text),
        encoding: "mobi/" + charset,
        parse_status: "ok",
        title,
        author
      };
    });
  }
  function utf16le(b) {
    let s = "";
    for (let i2 = 0; i2 + 1 < b.length; i2 += 2) s += String.fromCharCode(b[i2] | b[i2 + 1] << 8);
    return s;
  }
  function parseOle(bytes) {
    const u82 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const sig = [208, 207, 17, 224, 161, 177, 26, 225];
    if (u82.length < 512 || sig.some((v, i2) => u82[i2] !== v)) return null;
    const dv = new DataView(u82.buffer, u82.byteOffset, u82.byteLength);
    const ss = 1 << dv.getUint16(30, true);
    const mss = 1 << dv.getUint16(32, true);
    const numFat = dv.getUint32(44, true);
    const firstDir = dv.getUint32(48, true);
    const cutoff = dv.getUint32(56, true) || 4096;
    const firstMiniFat = dv.getUint32(60, true);
    const numMiniFat = dv.getUint32(64, true);
    const secOff = (sid) => 512 + sid * ss;
    if (ss !== 512) return null;
    const fatSectors = [];
    for (let i2 = 0; i2 < Math.min(109, numFat); i2++) {
      const sid = dv.getUint32(76 + i2 * 4, true);
      if (sid < 4294967290) fatSectors.push(sid);
    }
    const fat = [];
    for (const sid of fatSectors) {
      const o = secOff(sid);
      if (o + ss > u82.length) break;
      for (let k = 0; k < ss / 4; k++) fat.push(dv.getUint32(o + k * 4, true));
    }
    if (!fat.length) return null;
    const chain = (start, table = fat, limit = 2e4) => {
      const out = [];
      let sid = start, guard = 0;
      while (sid < 4294967290 && guard++ < limit && table[sid] !== void 0) {
        out.push(sid);
        const nx = table[sid];
        if (nx === sid || nx >= 4294967290) break;
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
        if (o + sectorSize > u82.length) break;
        const len = Math.min(sectorSize, out.length - p);
        if (len <= 0) break;
        out.set(u82.subarray(o, o + len), p);
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
      const name = nameLen >= 2 ? utf16le(dirBytes.subarray(o, o + Math.min(64, nameLen - 2))) : "";
      entries.push({ name, type, start: dvE.getUint32(116, true), size: Number(dvE.getBigUint64(120, true)) });
    }
    const root = entries.find((e) => e.type === 5) || entries[0];
    const miniFat = [];
    if (numMiniFat && firstMiniFat < 4294967290) {
      for (const sid of chain(firstMiniFat)) {
        const o = secOff(sid);
        if (o + ss > u82.length) break;
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
    if (data.length < 426 || dv.getUint16(0, true) !== 42476) return null;
    const fcClx = dv.getUint32(418, true);
    const lcbClx = dv.getUint32(422, true);
    const clxEnd = Math.min(data.length, fcClx + lcbClx);
    if (lcbClx > 8 && clxEnd > fcClx + 8) {
      let p = fcClx;
      if (data[p] === 1) {
        p += 3 + dv.getUint16(p + 1, true);
      }
      if (data[p] === 2 && p + 5 <= clxEnd) {
        const lcb = dv.getUint32(p + 1, true);
        const plc = p + 5;
        const n = (lcb - 4) / 12;
        if (Number.isInteger(n) && n >= 1 && n < 1e4 && plc + lcb <= clxEnd) {
          const cps = [];
          for (let i2 = 0; i2 <= n; i2++) cps.push(dv.getUint32(plc + i2 * 4, true));
          const base = plc + (n + 1) * 4;
          let out = "";
          let valid = true;
          for (let i2 = 0; i2 < n; i2++) {
            const fc = dv.getUint32(base + i2 * 8 + 2, true);
            const compressed = (fc & 1073741824) !== 0;
            const off = compressed ? (fc & 1073741823) / 2 : fc & 1073741823;
            const len = Math.max(0, cps[i2 + 1] - cps[i2]);
            if (off + len * (compressed ? 1 : 2) > data.length) {
              valid = false;
              break;
            }
            out += compressed ? decodeByCharset(data.subarray(off, off + len), "windows-1252", ctx) : utf16le(data.subarray(off, off + len * 2));
          }
          if (valid && out.trim()) return out;
        }
      }
    }
    const runs = [];
    let cur = "";
    for (let i2 = 0; i2 + 1 < data.length; i2 += 2) {
      const c = data[i2] | data[i2 + 1] << 8;
      const printable = c >= 32 && c <= 126 || c >= 19968 && c <= 40959 || c >= 12288 && c <= 12351 || c >= 65280 && c <= 65519 || c === 13 || c === 10 || c === 9;
      if (printable) cur += String.fromCharCode(c);
      else {
        if (cur.length >= 8) runs.push(cur);
        cur = "";
      }
    }
    if (cur.length >= 8) runs.push(cur);
    return runs.length ? runs.join("\n") : null;
  }
  function parseDoc(bytes, ctx) {
    return __async(this, null, function* () {
      const ole = parseOle(bytes);
      if (!ole) throw new Error("\u4E0D\u662F\u6709\u6548\u7684 OLE \u590D\u5408\u6587\u6863\uFF08\u65E7\u7248 .doc\uFF09");
      const entry = ole.entries.find((e) => /^WordDocument$/i.test(e.name) && e.type === 2);
      const data = ole.streamOf(entry);
      if (!data || !data.length) throw new Error("DOC \u4E2D\u627E\u4E0D\u5230 WordDocument \u6D41");
      const raw = docTextFromWordStream(data, ctx);
      if (!raw) throw new Error("DOC \u6B63\u6587\u65E0\u6CD5\u63D0\u53D6\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559");
      const text = clean(raw.replace(/\x0b/g, "\n").replace(/\x07/g, "").replace(/[\x00-\x08\x0e-\x1f]/g, ""));
      if (!text) throw new Error("DOC \u6B63\u6587\u4E3A\u7A7A");
      let title = "", author = "";
      const si = ole.entries.find((e) => /^\x05SummaryInformation$/i.test(e.name));
      if (si) {
        const b = ole.streamOf(si);
        if (b) {
          const s = latin12(b);
          const m = /([\u4e00-\u9fffA-Za-z0-9 ·_]{4,60})/.exec(s.replace(/[\x00-\x1f]/g, " "));
          if (m) title = m[1].trim();
        }
      }
      return {
        text,
        chapters: ctx.splitChapters(text),
        encoding: "doc/ole",
        parse_status: "ok",
        title,
        author
      };
    });
  }
  function looksBinary(bytes) {
    const h = bytes.subarray(0, 64);
    const s4 = latin12(h.subarray(0, 8));
    if (h[0] === 80 && h[1] === 75) return true;
    if (s4.startsWith("%PDF")) return true;
    if (h[0] === 208 && h[1] === 207) return true;
    if (s4.startsWith("{\\rtf")) return true;
    if (h[0] === 31 && h[1] === 139) return true;
    if (h[0] === 137 && h[1] === 80) return true;
    if (h[0] === 255 && h[1] === 216) return true;
    if (latin12(bytes.subarray(60, 64)) === "BOOK") return true;
    const sample = bytes.subarray(0, Math.min(1024, bytes.length));
    let bad = 0;
    for (const b of sample) if (b < 9 || b > 13 && b < 32) bad++;
    return bad > sample.length * 0.06;
  }
  function sniffText(bytes, ctx) {
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
    return {
      text,
      chapters: ctx.splitChapters(text),
      encoding: encoding + "/sniff",
      parse_status: "ok",
      title: "",
      author: ""
    };
  }

  // app/src/main/assets/core/parsers.mjs
  var TD2 = (bytes, enc = "utf-8") => new TextDecoder(enc).decode(bytes);
  function inflateRaw(bytes) {
    return __async(this, null, function* () {
      return inflateSync(bytes);
    });
  }
  function readZip(input) {
    return __async(this, null, function* () {
      const u82 = input instanceof Uint8Array ? input : new Uint8Array(input);
      const dv = new DataView(u82.buffer, u82.byteOffset, u82.byteLength);
      let eocd = -1;
      const floor = Math.max(0, u82.length - 65557);
      for (let i2 = u82.length - 22; i2 >= floor; i2--) {
        if (dv.getUint32(i2, true) === 101010256) {
          eocd = i2;
          break;
        }
      }
      if (eocd < 0) throw new Error("\u4E0D\u662F\u6709\u6548\u7684 ZIP \u5BB9\u5668");
      const total = dv.getUint16(eocd + 10, true);
      let p = dv.getUint32(eocd + 16, true);
      const entries = /* @__PURE__ */ new Map();
      for (let n = 0; n < total && p + 46 <= u82.length; n++) {
        if (dv.getUint32(p, true) !== 33639248) break;
        const method = dv.getUint16(p + 10, true);
        const compSize = dv.getUint32(p + 20, true);
        const nameLen = dv.getUint16(p + 28, true);
        const extraLen = dv.getUint16(p + 30, true);
        const commentLen = dv.getUint16(p + 32, true);
        const localOff = dv.getUint32(p + 42, true);
        const name = TD2(u82.subarray(p + 46, p + 46 + nameLen));
        entries.set(name, { method, compSize, localOff });
        p += 46 + nameLen + extraLen + commentLen;
      }
      function bytes(name) {
        return __async(this, null, function* () {
          let key = name;
          if (!entries.has(key)) {
            key = [...entries.keys()].find((k) => k.replace(/^\.\//, "") === name) || name;
          }
          const e = entries.get(key);
          if (!e) return null;
          if (e.localOff + 30 > u82.length || dv.getUint32(e.localOff, true) !== 67324752) return null;
          const nameLen = dv.getUint16(e.localOff + 26, true);
          const extraLen = dv.getUint16(e.localOff + 28, true);
          const a = e.localOff + 30 + nameLen + extraLen;
          const raw = u82.subarray(a, a + e.compSize);
          if (e.method === 0) return raw;
          if (e.method === 8) return yield inflateRaw(raw);
          throw new Error("\u4E0D\u652F\u6301\u7684 ZIP \u538B\u7F29\u65B9\u5F0F: " + e.method);
        });
      }
      const text = (name) => __async(null, null, function* () {
        const b = yield bytes(name);
        return b === null ? null : TD2(b);
      });
      const names = () => [...entries.keys()];
      return { bytes, text, names };
    });
  }
  function decodeEntities(s) {
    const named = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      nbsp: "\xA0",
      mdash: "\u2014",
      ndash: "\u2013",
      hellip: "\u2026",
      ldquo: "\u201C",
      rdquo: "\u201D",
      lsquo: "\u2018",
      rsquo: "\u2019"
    };
    return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
      var _a2;
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try {
          return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m;
        } catch (e2) {
          return m;
        }
      }
      return (_a2 = named[e.toLowerCase()]) != null ? _a2 : m;
    });
  }
  function htmlToText(html) {
    let s = String(html || "").replace(/<\?xml[^>]*\?>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|head|nav|footer)[^>]*>[\s\S]*?<\/\1\s*>/gi, "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|td)\s*>/gi, "\n").replace(/<[^>]+>/g, "");
    s = decodeEntities(s);
    return s.replace(/[\t\u00a0 ]+/g, " ").split("\n").map((x2) => x2.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function tagText(xml, tag) {
    const m = new RegExp(`<\\s*(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\s*/\\s*(?:\\w+:)?${tag}\\s*>`, "i").exec(xml);
    return m ? htmlToText(m[1]) : "";
  }
  function attrOf(xml, tag, attr) {
    const re = new RegExp(`<\\s*${tag}\\b[^>]*>`, "gi");
    let m;
    while (m = re.exec(xml)) {
      const a = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i").exec(m[0]);
      if (a) return decodeEntities(a[1]);
    }
    return "";
  }
  var CTX = { readZip, htmlToText, decodeEntities, tagText, attrOf, splitChapters, decodeText };
  function parseEpub(bytes) {
    return __async(this, null, function* () {
      var _a2, _b2, _c, _d;
      const zip = yield readZip(bytes);
      const container = yield zip.text("META-INF/container.xml");
      if (container === null) throw new Error("EPUB \u7F3A\u5C11 META-INF/container.xml");
      const opfPath = ((_a2 = /full-path\s*=\s*["']([^"']+)["']/i.exec(container)) == null ? void 0 : _a2[1]) || "OEBPS/content.opf";
      const opf = yield zip.text(opfPath);
      if (opf === null) throw new Error("EPUB \u7F3A\u5C11 " + opfPath);
      const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
      const manifest = /* @__PURE__ */ new Map();
      for (const m of opf.matchAll(/<item\b[^>]*\/?>/gi)) {
        const tag = m[0];
        const id = (_b2 = /\bid\s*=\s*["']([^"']+)["']/i.exec(tag)) == null ? void 0 : _b2[1];
        const href = (_c = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)) == null ? void 0 : _c[1];
        const type = ((_d = /\bmedia-type\s*=\s*["']([^"']+)["']/i.exec(tag)) == null ? void 0 : _d[1]) || "";
        if (id && href) manifest.set(id, { href, type });
      }
      const spine = [...opf.matchAll(/<itemref\b[^>]*\/?>/gi)].map((m) => {
        var _a3;
        return (_a3 = /\bidref\s*=\s*["']([^"']+)["']/i.exec(m[0])) == null ? void 0 : _a3[1];
      }).filter((id) => id && manifest.has(id));
      if (!spine.length) {
        for (const [id, v] of manifest) {
          if (/xhtml|html/i.test(v.type) || /\.x?html?$/i.test(v.href)) spine.push(id);
        }
      }
      const parts = [];
      let cursor = 0;
      const chapters = [];
      for (const id of spine) {
        const href = decodeURIComponent(manifest.get(id).href.split("#")[0]);
        const doc = (yield zip.text(base + href)) || (yield zip.text(href));
        if (doc === null) continue;
        const body = htmlToText(doc);
        if (!body) continue;
        const heading = tagText(doc, "h1") || tagText(doc, "h2") || tagText(doc, "title");
        const title = (heading || `\u7B2C ${chapters.length + 1} \u8282`).split("\n")[0].slice(0, 60);
        const prefix = chapters.length ? "\n\n" : "";
        if (chapters.length) chapters[chapters.length - 1].locator.end = cursor + prefix.length;
        const segment = title + "\n\n" + body + "\n";
        const start = cursor + prefix.length;
        chapters.push({
          id: uuid(),
          index: chapters.length,
          title,
          locator: { kind: "txt_offset", start, end: start + segment.length }
        });
        parts.push(prefix + segment);
        cursor += prefix.length + segment.length;
      }
      if (!chapters.length) throw new Error("EPUB \u4E2D\u672A\u627E\u5230\u53EF\u9605\u8BFB\u7684\u6B63\u6587");
      const text = parts.join("");
      chapters[chapters.length - 1].locator.end = text.length;
      return {
        text,
        chapters,
        encoding: "epub/utf-8",
        parse_status: "ok",
        title: tagText(opf, "title") || "",
        author: tagText(opf, "creator") || ""
      };
    });
  }
  function parseDocx(bytes) {
    return __async(this, null, function* () {
      var _a2;
      const zip = yield readZip(bytes);
      const xml = yield zip.text("word/document.xml");
      if (xml === null) throw new Error("DOCX \u7F3A\u5C11 word/document.xml");
      const core = (yield zip.text("docProps/core.xml")) || "";
      const blocks = [];
      for (const m of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
        const inner = m[1];
        let para = [...inner.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((x2) => decodeEntities(x2[1])).join("");
        para = para.replace(/[\t\u00a0 ]+/g, " ").trim();
        if (!para) continue;
        const style = ((_a2 = /<w:pStyle\s+w:val\s*=\s*["']([^"']+)["']/i.exec(inner)) == null ? void 0 : _a2[1]) || "";
        const isHeading = /heading|标题|title/i.test(style) || /<w:outlineLvl\b/.test(inner);
        blocks.push({ text: para, heading: isHeading });
      }
      if (!blocks.length) throw new Error("DOCX \u4E2D\u672A\u627E\u5230\u6587\u672C\u6BB5\u843D");
      const parts = [];
      const marks = [];
      let cursor = 0;
      for (const b of blocks) {
        if (b.heading || !marks.length && /^(第[零〇一二三四五六七八九十百千两0-9]{1,12}[章节回卷部篇集]|Chapter\s+\d+)/i.test(b.text)) {
          marks.push({ start: cursor, title: b.text.slice(0, 60) });
        }
        const seg = b.text + "\n\n";
        parts.push(seg);
        cursor += seg.length;
      }
      const text = parts.join("");
      const chapters = (marks.length ? marks : [{ start: 0, title: "\u5168\u6587" }]).map((m, i2, arr) => ({
        id: uuid(),
        index: i2,
        title: m.title,
        locator: { kind: "txt_offset", start: m.start, end: i2 + 1 < arr.length ? arr[i2 + 1].start : text.length }
      }));
      if (!marks.length) chapters[0].locator.start = 0;
      return {
        text,
        chapters,
        encoding: "docx/utf-8",
        parse_status: "ok",
        title: tagText(core, "title") || "",
        author: tagText(core, "creator") || ""
      };
    });
  }
  function parseZipBook(bytes) {
    return __async(this, null, function* () {
      const zip = yield readZip(bytes);
      const names = zip.names();
      const mime = yield zip.text("mimetype");
      if (mime && /epub/i.test(mime)) return yield parseEpub(bytes);
      const fb2 = names.find((n) => /\.fb2$/i.test(n));
      if (fb2) return yield parseFb2(yield zip.bytes(fb2), CTX);
      const txt = names.find((n) => /\.(txt|md|text)$/i.test(n));
      if (txt) {
        const b = yield zip.bytes(txt);
        const { text, encoding } = decodeText(b);
        return {
          text,
          chapters: splitChapters(text),
          encoding: encoding + "/zip",
          parse_status: "ok",
          title: "",
          author: ""
        };
      }
      throw new Error("ZIP \u91CC\u6CA1\u6709\u53EF\u9605\u8BFB\u7684 EPUB / FB2 / TXT \u6587\u4EF6");
    });
  }
  var UNSUPPORTED_HINT = {
    azw3: "AZW3 / KF8 \u6682\u4E0D\u89E3\u6790\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559\uFF0C\u53EF\u70B9\u300C\u5BFC\u51FA\u300D\u53D6\u56DE",
    chm: "CHM \u6682\u4E0D\u89E3\u6790\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559",
    djvu: "DjVu \u6682\u4E0D\u89E3\u6790\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559",
    cbz: "CBZ \u662F\u6F2B\u753B\u538B\u7F29\u5305\uFF0C\u6682\u4E0D\u89E3\u6790\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559",
    cbr: "CBR \u662F\u6F2B\u753B\u538B\u7F29\u5305\uFF0C\u6682\u4E0D\u89E3\u6790\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559"
  };
  var PLAIN_TEXT = [
    "txt",
    "md",
    "markdown",
    "text",
    "log",
    "rst",
    "tex",
    "srt",
    "csv",
    "json",
    "yaml",
    "yml",
    "ini",
    "conf",
    "xml",
    "nfo",
    "me",
    "1st"
  ];
  function isPlainText(ext) {
    return PLAIN_TEXT.includes(String(ext || "").toLowerCase());
  }
  function parseBook(filename, bytes) {
    return __async(this, null, function* () {
      const ext = extOf(filename);
      try {
        if (ext === "epub") return yield parseEpub(bytes);
        if (ext === "docx") return yield parseDocx(bytes);
        if (ext === "pdf") return yield parsePdf(bytes);
        if (ext === "rtf") return yield parseRtf(bytes, CTX);
        if (ext === "odt" || ext === "ott") return yield parseOdt(bytes, CTX);
        if (ext === "fb2") return yield parseFb2(bytes, CTX);
        if (ext === "mht" || ext === "mhtml") return yield parseMhtml(bytes, CTX);
        if (ext === "mobi" || ext === "prc" || ext === "pdb" || ext === "azw") return yield parseMobi(bytes, CTX);
        if (ext === "doc") return yield parseDoc(bytes, CTX);
        if (ext === "zip") return yield parseZipBook(bytes);
        if (UNSUPPORTED_HINT[ext]) {
          return {
            text: "",
            chapters: [],
            encoding: null,
            parse_status: "unsupported",
            title: "",
            author: "",
            error: UNSUPPORTED_HINT[ext]
          };
        }
        if (ext === "html" || ext === "htm" || ext === "xhtml") {
          const { text: raw, encoding } = decodeText(bytes);
          const body = htmlToText(raw);
          return {
            text: body,
            chapters: splitChapters(body),
            encoding: encoding + "/html",
            parse_status: "ok",
            title: tagText(raw, "title") || "",
            author: ""
          };
        }
        if (PLAIN_TEXT.includes(ext)) {
          const { text, encoding } = decodeText(bytes);
          return { text, chapters: splitChapters(text), encoding, parse_status: "ok", title: "", author: "" };
        }
        const sniffed = sniffText(bytes, CTX);
        if (sniffed) return sniffed;
      } catch (e) {
        return {
          text: "",
          chapters: [],
          encoding: null,
          parse_status: "error",
          error: (e == null ? void 0 : e.message) || String(e),
          title: "",
          author: ""
        };
      }
      return {
        text: "",
        chapters: [],
        encoding: null,
        parse_status: "unsupported",
        title: "",
        author: "",
        error: "\u6682\u4E0D\u89E3\u6790\u8BE5\u683C\u5F0F\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559\uFF0C\u53EF\u70B9\u300C\u5BFC\u51FA\u300D\u53D6\u56DE"
      };
    });
  }

  // app/src/main/assets/core/books.mjs
  var ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var PARSER_VERSION = 3;
  function bookDir(storage, root, id) {
    return storage.join(root, BOOKS_DIR, id);
  }
  function checkId(id) {
    if (!ID_RE.test(String(id || ""))) throw new Error("\u975E\u6CD5\u4E66\u7C4D ID");
    return String(id);
  }
  function importBook(_0, _1, _2) {
    return __async(this, arguments, function* (storage, root, { filename, bytes, collectionIds = [], id = null }) {
      var _a2, _b2;
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const ext = extOf(filename);
      const bookId = id ? checkId(id) : uuid();
      const dir = bookDir(storage, root, bookId);
      yield storage.mkdir(dir);
      yield storage.writeFile(storage.join(dir, `source.${ext}`), data);
      const parsed = yield parseBook(filename, data);
      if (!isPlainText(ext)) {
        yield storage.writeFile(storage.join(dir, DERIVED_TEXT), encode(parsed.text));
      }
      const t = nowIso();
      const chapters = parsed.chapters || [];
      const meta = __spreadProps(__spreadValues({
        id: bookId,
        title: parsed.title || titleFromName(filename),
        author: parsed.author || "",
        original_filename: safeName(filename),
        format: ext,
        encoding: parsed.encoding,
        size_bytes: data.byteLength,
        sha256: yield sha256Hex(data),
        collection_ids: Array.isArray(collectionIds) ? collectionIds : [],
        tags: [],
        added_at: t,
        updated_at: t,
        revision: 1,
        parser_version: PARSER_VERSION,
        parse_status: parsed.parse_status
      }, parsed.error ? { parse_error: parsed.error } : {}), {
        chapters,
        progress: {
          chapter_id: (_b2 = (_a2 = chapters[0]) == null ? void 0 : _a2.id) != null ? _b2 : null,
          percent: 0,
          locator: { kind: "txt_offset", offset: 0 },
          updated_at: t
        },
        bookmarks: []
      });
      yield saveMeta(storage, root, meta, { bump: false });
      return meta;
    });
  }
  function listBooks(storage, root) {
    return __async(this, null, function* () {
      const dir = storage.join(root, BOOKS_DIR);
      const entries = yield storage.readdir(dir);
      const out = [];
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const p = storage.join(dir, e.name, META_FILE);
        if (!(yield storage.exists(p))) continue;
        const meta = fromJson(yield storage.readFile(p));
        if (meta && meta.id) out.push(meta);
      }
      out.sort((a, b) => String(a.added_at || "").localeCompare(String(b.added_at || "")));
      return out;
    });
  }
  function getMeta(storage, root, id) {
    return __async(this, null, function* () {
      const bookId = checkId(id);
      const p = storage.join(root, BOOKS_DIR, bookId, META_FILE);
      if (!(yield storage.exists(p))) throw new Error("\u4E66\u7C4D\u4E0D\u5B58\u5728: " + bookId);
      const meta = fromJson(yield storage.readFile(p));
      if (!meta) throw new Error("meta.json \u635F\u574F: " + bookId);
      return meta;
    });
  }
  function saveMeta(_0, _1, _2) {
    return __async(this, arguments, function* (storage, root, meta, { bump = true } = {}) {
      if (bump) {
        meta.revision = (Number(meta.revision) || 1) + 1;
        meta.updated_at = nowIso();
      }
      yield storage.writeFile(storage.join(root, BOOKS_DIR, meta.id, META_FILE), toJson(meta));
      return meta;
    });
  }
  function getBookText(storage, root, id) {
    return __async(this, null, function* () {
      const bookId = checkId(id);
      const derived = storage.join(root, BOOKS_DIR, bookId, DERIVED_TEXT);
      if (yield storage.exists(derived)) return decode(yield storage.readFile(derived));
      const meta = yield getMeta(storage, root, bookId);
      const src = storage.join(root, BOOKS_DIR, bookId, `source.${meta.format}`);
      const { text } = decodeText(yield storage.readFile(src));
      return text;
    });
  }
  function migrateChapterAnchors(oldChapters, newChapters, meta) {
    var _a2, _b2, _c;
    const oldById = new Map((oldChapters || []).map((c) => [c.id, c]));
    const list = newChapters || [];
    const remap = (chapterId, offset) => {
      var _a3, _b3, _c2, _d, _e;
      const old = oldById.get(chapterId);
      if (!old || !list.length) return null;
      const abs = (Number((_a3 = old.locator) == null ? void 0 : _a3.start) || 0) + (Number(offset) || 0);
      let target = list[list.length - 1];
      for (const n of list) {
        const s2 = Number((_b3 = n.locator) == null ? void 0 : _b3.start) || 0;
        const e2 = Number((_c2 = n.locator) == null ? void 0 : _c2.end) || 0;
        if (abs >= s2 && abs < e2) {
          target = n;
          break;
        }
      }
      const s = Number((_d = target.locator) == null ? void 0 : _d.start) || 0;
      const e = Number((_e = target.locator) == null ? void 0 : _e.end) || 0;
      const len = Math.max(1, e - s);
      return { chapter_id: target.id, offset: Math.max(0, Math.min(len - 1, abs - s)) };
    };
    const out = __spreadValues({}, meta);
    const p = remap((_a2 = meta.progress) == null ? void 0 : _a2.chapter_id, (_c = (_b2 = meta.progress) == null ? void 0 : _b2.locator) == null ? void 0 : _c.offset);
    if (p && out.progress) {
      out.progress = __spreadProps(__spreadValues({}, out.progress), {
        chapter_id: p.chapter_id,
        locator: __spreadProps(__spreadValues({}, out.progress.locator || {}), { offset: p.offset })
      });
    }
    if (Array.isArray(out.bookmarks)) {
      out.bookmarks = out.bookmarks.map((bm) => {
        const r = remap(bm.chapter_id, bm.offset);
        return r ? __spreadProps(__spreadValues({}, bm), { chapter_id: r.chapter_id, offset: r.offset }) : bm;
      });
    }
    return out;
  }
  function ensureParsed(storage, root, meta) {
    return __async(this, null, function* () {
      var _a2;
      if (Number(meta.parser_version) >= PARSER_VERSION) return meta;
      const dir = bookDir(storage, root, meta.id);
      const src = storage.join(dir, `source.${meta.format}`);
      if (!(yield storage.exists(src))) return meta;
      let parsed = null;
      try {
        parsed = yield parseBook(meta.original_filename, yield storage.readFile(src));
      } catch (e) {
      }
      let next = __spreadProps(__spreadValues({}, meta), { parser_version: PARSER_VERSION });
      if (parsed && parsed.parse_status === "ok" && (parsed.chapters || []).length) {
        next = migrateChapterAnchors(meta.chapters, parsed.chapters, next);
        next.parse_status = "ok";
        delete next.parse_error;
        next.chapters = parsed.chapters;
        next.encoding = parsed.encoding;
        if (parsed.title && !meta.title) next.title = parsed.title;
        if (parsed.author) next.author = parsed.author;
        if (!((_a2 = next.progress) == null ? void 0 : _a2.chapter_id)) {
          next.progress = __spreadProps(__spreadValues({}, next.progress || {}), {
            chapter_id: parsed.chapters[0].id,
            percent: 0,
            locator: { kind: "txt_offset", offset: 0 },
            updated_at: next.updated_at
          });
        }
        if (!isPlainText(meta.format)) {
          yield storage.writeFile(storage.join(dir, DERIVED_TEXT), encode(parsed.text));
        }
      } else if (parsed) {
        next.parse_status = parsed.parse_status;
        if (parsed.error) next.parse_error = parsed.error;
        else delete next.parse_error;
      }
      return yield saveMeta(storage, root, next);
    });
  }
  function readChapter(storage, root, id, chapterId, offset = 0, limit = 6e3) {
    return __async(this, null, function* () {
      const meta = yield ensureParsed(storage, root, yield getMeta(storage, root, id));
      const ch = meta.chapters.find((c) => c.id === chapterId) || meta.chapters[0];
      if (!ch) {
        const notice = meta.parse_error || (meta.parse_status === "unsupported" ? "\u8BE5\u683C\u5F0F\u6682\u4E0D\u89E3\u6790\uFF0C\u539F\u4EF6\u5DF2\u5B8C\u6574\u4FDD\u7559\uFF0C\u53EF\u70B9\u300C\u5BFC\u51FA\u300D\u53D6\u56DE\u3002" : "\u672C\u4E66\u6CA1\u6709\u53EF\u89E3\u6790\u7684\u6B63\u6587");
        return { chapter: null, text: "", offset: 0, nextOffset: 0, total: 0, done: true, notice };
      }
      const full = yield getBookText(storage, root, id);
      const slice = sliceChapter(full, ch, offset, limit);
      return __spreadProps(__spreadValues({
        chapter: __spreadValues(__spreadValues(__spreadValues({
          id: ch.id,
          index: ch.index,
          title: ch.title
        }, ch.num != null ? { num: ch.num } : {}), ch.numEnd != null ? { numEnd: ch.numEnd } : {}), ch.image ? { image: ch.image } : {})
      }, slice), {
        chapterIndex: ch.index,
        chapterCount: meta.chapters.length,
        notice: ch.image ? "\u626B\u63CF\u7248 PDF\uFF1A\u6309\u539F\u9875\u56FE\u7247\u663E\u793A\uFF0C\u65E0\u6587\u5B57\u5C42\uFF0C\u4E0D\u652F\u6301\u5168\u6587\u68C0\u7D22" : null
      });
    });
  }
  function exportBookBytes(storage, root, id) {
    return __async(this, null, function* () {
      const meta = yield getMeta(storage, root, id);
      const p = storage.join(root, BOOKS_DIR, meta.id, `source.${meta.format}`);
      return { bytes: yield storage.readFile(p), filename: meta.original_filename, meta };
    });
  }
  function deleteBook(storage, root, id) {
    return __async(this, null, function* () {
      const meta = yield getMeta(storage, root, id);
      yield storage.remove(bookDir(storage, root, meta.id));
      return { deleted: meta.id };
    });
  }

  // app/src/main/assets/core/progress.mjs
  function mergeMeta(a, b) {
    const base = parseTime(b.updated_at) > parseTime(a.updated_at) ? b : a;
    const out = deepClone(base);
    out.revision = Math.max(Number(a.revision) || 1, Number(b.revision) || 1) + 1;
    out.updated_at = nowIso();
    const pa = a.progress || {};
    const pb = b.progress || {};
    let progress;
    if ((Number(pb.percent) || 0) > (Number(pa.percent) || 0)) progress = pb;
    else if ((Number(pa.percent) || 0) > (Number(pb.percent) || 0)) progress = pa;
    else progress = parseTime(pb.updated_at) > parseTime(pa.updated_at) ? pb : pa;
    out.progress = deepClone(progress);
    const map = /* @__PURE__ */ new Map();
    for (const bm of [...a.bookmarks || [], ...b.bookmarks || []]) {
      if (!bm || !bm.id) continue;
      const cur = map.get(bm.id);
      if (!cur || parseTime(bm.updated_at) >= parseTime(cur.updated_at)) map.set(bm.id, bm);
    }
    out.bookmarks = [...map.values()].sort((x2, y) => String(x2.created_at || "").localeCompare(String(y.created_at || "")));
    return out;
  }
  function applyProgress(meta, patch) {
    var _a2, _b2, _c, _d, _e, _f, _g, _h, _i;
    const out = deepClone(meta);
    const prev = out.progress || {};
    const pct = Number((_b2 = (_a2 = patch.percent) != null ? _a2 : prev.percent) != null ? _b2 : 0);
    out.progress = {
      chapter_id: (_g = (_f = (_c = patch.chapter_id) != null ? _c : prev.chapter_id) != null ? _f : (_e = (_d = out.chapters) == null ? void 0 : _d[0]) == null ? void 0 : _e.id) != null ? _g : null,
      percent: Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0)),
      locator: (_i = (_h = patch.locator) != null ? _h : prev.locator) != null ? _i : { kind: "txt_offset", offset: 0 },
      updated_at: nowIso()
    };
    out.revision = (Number(out.revision) || 1) + 1;
    out.updated_at = nowIso();
    return out;
  }
  function applyBookmark(meta, patch) {
    var _a2, _b2, _c, _d;
    const out = deepClone(meta);
    const t = nowIso();
    const bm = {
      id: patch.id || uuid(),
      chapter_id: (_d = (_c = patch.chapter_id) != null ? _c : (_b2 = (_a2 = meta.chapters) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.id) != null ? _d : null,
      offset: Number(patch.offset) || 0,
      note: String(patch.note || ""),
      created_at: t,
      updated_at: t,
      deleted_at: null
    };
    out.bookmarks = [...out.bookmarks || [], bm];
    out.revision = (Number(out.revision) || 1) + 1;
    out.updated_at = t;
    return out;
  }
  function applyRemoveBookmark(meta, id) {
    const out = deepClone(meta);
    const t = nowIso();
    out.bookmarks = (out.bookmarks || []).map((b) => b.id === id ? __spreadProps(__spreadValues({}, b), { deleted_at: t, updated_at: t }) : b);
    out.revision = (Number(out.revision) || 1) + 1;
    out.updated_at = t;
    return out;
  }

  // app/src/main/assets/core/indexer.mjs
  var DatabaseSync = null;
  function openIndex(_0, _1) {
    return __async(this, arguments, function* (storage, root, { forceMemory = false } = {}) {
      if (forceMemory || !DatabaseSync) {
        return {
          kind: "memory",
          rows: /* @__PURE__ */ new Map(),
          storage,
          root,
          fallbackReason: forceMemory ? "forced" : "node:sqlite unavailable"
        };
      }
      try {
        yield storage.mkdir(storage.join(root, INDEX_DIR));
        const db = new DatabaseSync(storage.join(root, INDEX_DIR, INDEX_FILE));
        db.exec(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY, title TEXT, author TEXT, updated_at TEXT, revision INTEGER
      );
      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY, book_id TEXT, idx INTEGER, title TEXT,
        start_offset INTEGER, end_offset INTEGER
      );
      CREATE TABLE IF NOT EXISTS book_search (
        book_id TEXT PRIMARY KEY, title TEXT, body TEXT
      );
    `);
        let migrated = false;
        try {
          const old = db.prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='book_fts'"
          ).get();
          if (old) {
            db.exec("DROP TABLE book_fts;");
            db.exec("DELETE FROM books; DELETE FROM chapters;");
            db.exec("VACUUM;");
            migrated = true;
          }
        } catch (e) {
        }
        return { kind: "sqlite", db, tokenizer: null, migrated, storage, root };
      } catch (e) {
        return { kind: "memory", rows: /* @__PURE__ */ new Map(), storage, root, fallbackReason: e.message };
      }
    });
  }
  function bodyOf(storage, root, meta) {
    return __async(this, null, function* () {
      const p = storage.join(root, BOOKS_DIR, meta.id, DERIVED_TEXT);
      if (yield storage.exists(p)) return decode(yield storage.readFile(p));
      if (isPlainText(meta.format)) {
        const src = storage.join(root, BOOKS_DIR, meta.id, `source.${meta.format}`);
        if (yield storage.exists(src)) return decodeText(yield storage.readFile(src)).text;
      }
      return "";
    });
  }
  function reindex(_0) {
    return __async(this, arguments, function* (idx, { incremental = true, books = null } = {}) {
      var _a2, _b2, _c, _d;
      const list = books || (yield listBooks(idx.storage, idx.root));
      const stats = { scanned: list.length, indexed: 0, skipped: 0, removed: 0, kind: idx.kind };
      if (!incremental && idx.kind === "sqlite") {
        idx.db.exec("DELETE FROM book_search; DELETE FROM chapters; DELETE FROM books;");
      } else if (!incremental) {
        idx.rows.clear();
      }
      if (idx.kind === "sqlite") {
        const known = /* @__PURE__ */ new Map();
        for (const r of idx.db.prepare("SELECT id, updated_at, revision FROM books").all()) {
          known.set(r.id, r);
        }
        const ids = new Set(list.map((b) => b.id));
        for (const id of known.keys()) {
          if (!ids.has(id)) {
            idx.db.prepare("DELETE FROM book_search WHERE book_id = ?").run(id);
            idx.db.prepare("DELETE FROM chapters WHERE book_id = ?").run(id);
            idx.db.prepare("DELETE FROM books WHERE id = ?").run(id);
            stats.removed++;
          }
        }
        for (const meta of list) {
          const k = known.get(meta.id);
          if (incremental && k && k.updated_at === meta.updated_at && Number(k.revision) === Number(meta.revision)) {
            stats.skipped++;
            continue;
          }
          const body = yield bodyOf(idx.storage, idx.root, meta);
          idx.db.prepare("DELETE FROM book_search WHERE book_id = ?").run(meta.id);
          idx.db.prepare("DELETE FROM chapters WHERE book_id = ?").run(meta.id);
          idx.db.prepare("INSERT OR REPLACE INTO books (id,title,author,updated_at,revision) VALUES (?,?,?,?,?)").run(meta.id, meta.title || "", meta.author || "", meta.updated_at || "", Number(meta.revision) || 1);
          idx.db.prepare("INSERT INTO book_search (book_id,title,body) VALUES (?,?,?)").run(meta.id, meta.title || "", body);
          const insCh = idx.db.prepare("INSERT OR REPLACE INTO chapters (id,book_id,idx,title,start_offset,end_offset) VALUES (?,?,?,?,?,?)");
          for (const c of meta.chapters || []) {
            insCh.run(c.id, meta.id, c.index, c.title, (_b2 = (_a2 = c.locator) == null ? void 0 : _a2.start) != null ? _b2 : 0, (_d = (_c = c.locator) == null ? void 0 : _c.end) != null ? _d : 0);
          }
          stats.indexed++;
        }
      } else {
        for (const meta of list) {
          idx.rows.set(meta.id, {
            id: meta.id,
            title: meta.title || "",
            author: meta.author || "",
            body: yield bodyOf(idx.storage, idx.root, meta),
            updated_at: meta.updated_at,
            revision: meta.revision
          });
          stats.indexed++;
        }
      }
      return stats;
    });
  }
  function search(idx, term) {
    const q = String(term || "").trim();
    if (!q) return [];
    const like = `%${q}%`;
    let rows;
    if (idx.kind === "sqlite") {
      rows = idx.db.prepare(
        "SELECT book_id, title, body FROM book_search WHERE title LIKE ? OR body LIKE ? LIMIT 50"
      ).all(like, like);
    } else {
      rows = [...idx.rows.values()].filter((r) => r.title.includes(q) || r.body.includes(q)).slice(0, 50);
    }
    return rows.map((r) => {
      var _a2;
      return {
        bookId: (_a2 = r.book_id) != null ? _a2 : r.id,
        title: r.title,
        snippet: makeSnippet(r.body, q)
      };
    });
  }
  function searchFts(idx, term) {
    return search(idx, term);
  }
  function closeIndex(idx) {
    if ((idx == null ? void 0 : idx.kind) === "sqlite") {
      try {
        idx.db.close();
      } catch (e) {
      }
    }
    if ((idx == null ? void 0 : idx.kind) === "memory") idx.rows.clear();
  }

  // app/src/main/assets/core/pack.mjs
  var CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u82) {
    let c = 4294967295;
    for (let i2 = 0; i2 < u82.length; i2++) c = CRC_TABLE[(c ^ u82[i2]) & 255] ^ c >>> 8;
    return (c ^ 4294967295) >>> 0;
  }
  function dosStamp(d) {
    return {
      time: d.getHours() << 11 | d.getMinutes() << 5 | d.getSeconds() >> 1,
      date: d.getFullYear() - 1980 << 9 | d.getMonth() + 1 << 5 | d.getDate()
    };
  }
  function createZip(entries) {
    const enc = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.name);
      const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
      const crc = crc32(data);
      const { time, date } = dosStamp(/* @__PURE__ */ new Date());
      const lh = new Uint8Array(30 + name.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 67324752, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 2048, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      lh.set(name, 30);
      locals.push(lh, data);
      const ch = new Uint8Array(46 + name.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 33639248, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 2048, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(name, 46);
      centrals.push(ch);
      offset += lh.length + data.length;
    }
    const cdSize = centrals.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 101010256, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);
    const parts = [...locals, ...centrals, eocd];
    const out = new Uint8Array(parts.reduce((s, p2) => s + p2.length, 0));
    let p = 0;
    for (const part of parts) {
      out.set(part, p);
      p += part.length;
    }
    return out;
  }
  function decodeZipName(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (e) {
      try {
        return new TextDecoder("gb18030").decode(bytes);
      } catch (e2) {
        return new TextDecoder("utf-8").decode(bytes);
      }
    }
  }
  function inflateRaw2(bytes) {
    return __async(this, null, function* () {
      return inflateSync(bytes);
    });
  }
  function readZip2(bytes) {
    return __async(this, null, function* () {
      const u82 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const dv = new DataView(u82.buffer, u82.byteOffset, u82.byteLength);
      let eocd = -1;
      const floor = Math.max(0, u82.length - 65557);
      for (let i2 = u82.length - 22; i2 >= floor; i2--) {
        if (dv.getUint32(i2, true) === 101010256) {
          eocd = i2;
          break;
        }
      }
      if (eocd < 0) throw new Error("\u4E0D\u662F\u6709\u6548\u7684 zip / openlib \u5305");
      const count = dv.getUint16(eocd + 10, true);
      const cdOffset = dv.getUint32(eocd + 16, true);
      if (count === 65535 || cdOffset === 4294967295) {
        throw new Error("\u6682\u4E0D\u652F\u6301 Zip64 \u5305\uFF0C\u8BF7\u7528\u666E\u901A\u6A21\u5F0F\u91CD\u65B0\u538B\u7F29");
      }
      let p = cdOffset;
      const out = /* @__PURE__ */ new Map();
      for (let n = 0; n < count && p + 46 <= u82.length; n++) {
        if (dv.getUint32(p, true) !== 33639248) throw new Error("zip \u4E2D\u592E\u76EE\u5F55\u635F\u574F");
        const method = dv.getUint16(p + 10, true);
        const csize = dv.getUint32(p + 20, true);
        const nameLen = dv.getUint16(p + 28, true);
        const extraLen = dv.getUint16(p + 30, true);
        const commentLen = dv.getUint16(p + 32, true);
        const localOff = dv.getUint32(p + 42, true);
        const name = decodeZipName(u82.subarray(p + 46, p + 46 + nameLen));
        p += 46 + nameLen + extraLen + commentLen;
        if (localOff + 30 > u82.length || dv.getUint32(localOff, true) !== 67324752) continue;
        const lhNameLen = dv.getUint16(localOff + 26, true);
        const lhExtraLen = dv.getUint16(localOff + 28, true);
        const start = localOff + 30 + lhNameLen + lhExtraLen;
        const raw = u82.slice(start, start + csize);
        if (method === 0) out.set(name, raw);
        else if (method === 8) out.set(name, yield inflateRaw2(raw));
        else throw new Error(`\u4E0D\u652F\u6301\u7684 ZIP \u538B\u7F29\u65B9\u5F0F\uFF08method=${method}\uFF09\uFF1A${name}`);
      }
      return out;
    });
  }
  function normalizeZip(files) {
    const libKey = [...files.keys()].find((k) => /(?:^|\/)library\.json$/i.test(k));
    const prefix = libKey ? libKey.slice(0, libKey.length - "library.json".length) : "";
    const out = /* @__PURE__ */ new Map();
    for (const [k, v] of files) {
      const rel = prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k;
      out.set(rel.replace(/^\.\//, ""), v);
    }
    return out;
  }
  function exportLibrary(storage, root) {
    return __async(this, null, function* () {
      const entries = [];
      for (const f of [LIBRARY_FILE, COLLECTIONS_FILE, SETTINGS_FILE]) {
        const p = storage.join(root, f);
        if (yield storage.exists(p)) entries.push({ name: f, data: yield storage.readFile(p) });
      }
      const base = storage.join(root, BOOKS_DIR);
      const walk = (rel) => __async(null, null, function* () {
        const abs = rel ? storage.join(base, rel) : base;
        for (const e of yield storage.readdir(abs)) {
          const child = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) yield walk(child);
          else entries.push({ name: `${BOOKS_DIR}/${child}`, data: yield storage.readFile(storage.join(base, child)) });
        }
      });
      yield walk("");
      return createZip(entries);
    });
  }
  function isLibraryEntry(name) {
    return name === LIBRARY_FILE || name === COLLECTIONS_FILE || name === SETTINGS_FILE || name.startsWith(BOOKS_DIR + "/");
  }
  function importLibraryFiles(storage, root, files) {
    return __async(this, null, function* () {
      const lib = fromJson(files.get(LIBRARY_FILE));
      if (!lib || lib.format !== FORMAT) throw new Error("\u4E0D\u662F\u5F00\u653E\u4E66\u5E93\u5305");
      if (Number(lib.schema_version) > SCHEMA_VERSION) throw new Error("\u5305\u7248\u672C\u9AD8\u4E8E\u672C\u7A0B\u5E8F\uFF0C\u8BF7\u5347\u7EA7\u540E\u518D\u5BFC\u5165");
      yield storage.mkdir(root);
      yield storage.mkdir(storage.join(root, BOOKS_DIR));
      yield storage.mkdir(storage.join(root, INDEX_DIR));
      const stats = { files: 0, books: 0, merged: 0 };
      for (const [name, data] of files) {
        if (name.startsWith("/") || name.includes("..") || !isLibraryEntry(name)) continue;
        const dest = storage.join(root, name);
        if (name.endsWith("/meta.json") && (yield storage.exists(dest))) {
          const local = fromJson(yield storage.readFile(dest));
          const remote = fromJson(data);
          if (local && remote) {
            yield storage.writeFile(dest, toJson(mergeMeta(local, remote)));
            stats.merged++;
            stats.files++;
            stats.books++;
            continue;
          }
        }
        yield storage.writeFile(dest, data);
        stats.files++;
        if (name.endsWith("/meta.json")) stats.books++;
      }
      return stats;
    });
  }
  function importLibraryPack(storage, root, bytes) {
    return __async(this, null, function* () {
      return yield importLibraryFiles(storage, root, normalizeZip(yield readZip2(bytes)));
    });
  }

  // app/src/main/assets/core/api.mjs
  var BOOK_EXT = /* @__PURE__ */ new Set([
    "txt",
    "md",
    "markdown",
    "text",
    "log",
    "rst",
    "tex",
    "srt",
    "csv",
    "json",
    "xml",
    "nfo",
    "epub",
    "docx",
    "doc",
    "pdf",
    "rtf",
    "odt",
    "ott",
    "fb2",
    "html",
    "htm",
    "xhtml",
    "mht",
    "mhtml",
    "mobi",
    "prc",
    "pdb",
    "azw",
    "azw3"
  ]);
  var SKIP_NAMES = /* @__PURE__ */ new Set([
    "library.json",
    "collections.json",
    "settings.json",
    "meta.json",
    ".ds_store",
    "thumbs.db",
    "desktop.ini"
  ]);
  function bookSummary(m) {
    var _a2;
    return {
      id: m.id,
      title: m.title,
      author: m.author || "",
      format: m.format,
      encoding: m.encoding,
      size_bytes: m.size_bytes,
      sha256: m.sha256,
      original_filename: m.original_filename,
      added_at: m.added_at,
      updated_at: m.updated_at,
      revision: m.revision,
      parse_status: m.parse_status,
      parse_error: m.parse_error || null,
      collection_ids: m.collection_ids || [],
      // 封面标记：所有返回书籍摘要的接口都带上，避免 get-book 覆盖掉书架列表里的字段。
      // withCovers() 会再按真实文件存在与否覆盖一次，以文件为准。
      hasCover: !!((_a2 = m.cover) == null ? void 0 : _a2.file),
      chapterCount: (m.chapters || []).length,
      chapters: (m.chapters || []).map((c) => __spreadValues(__spreadProps(__spreadValues(__spreadValues({
        id: c.id,
        index: c.index,
        title: c.title
      }, c.num != null ? { num: c.num } : {}), c.numEnd != null ? { numEnd: c.numEnd } : {}), {
        locator: c.locator
      }), c.image ? { image: c.image } : {})),
      progress: m.progress || null,
      bookmarks: (m.bookmarks || []).filter((b) => !b.deleted_at)
    };
  }
  var LibraryApp = class {
    constructor(storage, root, opts = {}) {
      this.storage = storage;
      this.root = root;
      this.opts = opts;
      this.library = null;
      this.index = null;
    }
    init() {
      return __async(this, null, function* () {
        this.library = yield openLibrary(this.storage, this.root, this.opts.name);
        this.index = yield openIndex(this.storage, this.root, { forceMemory: !!this.opts.forceMemory });
        yield this.migrateParsing();
        yield this.reindex(false);
        return this.library;
      });
    }
    // 升级解析器后，把旧版本导入的书从原件重跑一次（幂等，只做一次）。
    // 只按 parser_version 判断，不能因为「已解析成功」就跳过——v3 的分节合并
    // 需要对已经能读的书也重跑，否则目录永远是旧结构。
    migrateParsing() {
      return __async(this, null, function* () {
        for (const m of yield listBooks(this.storage, this.root)) {
          if (Number(m.parser_version) >= PARSER_VERSION) continue;
          try {
            yield ensureParsed(this.storage, this.root, m);
          } catch (e) {
          }
        }
      });
    }
    state() {
      return __async(this, null, function* () {
        return {
          library: this.library,
          root: this.root,
          collections: yield getCollections(this.storage, this.root),
          settings: yield getSettings(this.storage, this.root),
          books: yield this.withCovers((yield listBooks(this.storage, this.root)).map(bookSummary)),
          index: {
            kind: this.index.kind,
            tokenizer: this.index.tokenizer || null,
            fallbackReason: this.index.fallbackReason || null
          }
        };
      });
    }
    listBooks() {
      return __async(this, null, function* () {
        return yield this.withCovers((yield listBooks(this.storage, this.root)).map(bookSummary));
      });
    }
    getBook(id) {
      return __async(this, null, function* () {
        const summary = bookSummary(yield ensureParsed(
          this.storage,
          this.root,
          yield getMeta(this.storage, this.root, id)
        ));
        return (yield this.withCovers([summary]))[0];
      });
    }
    importBook(_0) {
      return __async(this, arguments, function* ({ filename, bytes, collectionIds }) {
        const meta = yield importBook(this.storage, this.root, { filename, bytes, collectionIds });
        yield this.reindex(false);
        return bookSummary(meta);
      });
    }
    // 智能导入：一个入口自动分诊。
    // ① 有 library.json + books/*/meta.json → 整库合并（保留 UUID / 进度 / 分类 / 封面）
    // ② 否则把包内每个书文件当单本导入，按 sha256 去重，逐条给出明细
    // 支持 store / deflate 与 UTF-8 / GBK 文件名，包外再套一层目录也能识别。
    importSmart(_0) {
      return __async(this, arguments, function* ({ filename, bytes }) {
        var _a2;
        const label = filename || "\u538B\u7F29\u5305";
        let files;
        try {
          files = normalizeZip(yield readZip2(bytes));
        } catch (e) {
          throw new Error(`${label}\uFF1A${e.message}`);
        }
        const names = [...files.keys()];
        const isPack = files.has("library.json") && names.some((n) => /^books\/[^/]+\/meta\.json$/i.test(n));
        if (isPack) {
          const stats = yield importLibraryFiles(this.storage, this.root, files);
          this.library = yield openLibrary(this.storage, this.root);
          yield this.reindex(true);
          return {
            kind: "library",
            file: label,
            books: stats.books,
            merged: stats.merged,
            files: stats.files,
            ok: [],
            skip: [],
            fail: []
          };
        }
        const seen = new Set((yield listBooks(this.storage, this.root)).map((m) => m.sha256).filter(Boolean));
        const report = { kind: "books", file: label, ok: [], skip: [], fail: [] };
        for (const [name, data] of files) {
          const base = String(name).split("/").pop();
          if (!base || name.endsWith("/") || base.startsWith(".")) continue;
          if (/^__MACOSX\//i.test(name)) continue;
          const low = base.toLowerCase();
          if (SKIP_NAMES.has(low)) continue;
          const ext = (((_a2 = /\.([A-Za-z0-9]{1,8})$/.exec(low)) == null ? void 0 : _a2[1]) || "").toLowerCase();
          if (!BOOK_EXT.has(ext)) continue;
          if (!(data == null ? void 0 : data.length)) {
            report.skip.push({ name: base, reason: "\u7A7A\u6587\u4EF6" });
            continue;
          }
          try {
            const hash = yield sha256Hex(data);
            if (seen.has(hash)) {
              report.skip.push({ name: base, reason: "\u5185\u5BB9\u91CD\u590D\uFF08\u5DF2\u5B58\u5728\uFF09" });
              continue;
            }
            const meta = yield importBook(this.storage, this.root, { filename: base, bytes: data });
            seen.add(hash);
            report.ok.push({ name: base, title: meta.title });
          } catch (e) {
            report.fail.push({ name: base, error: e.message || String(e) });
          }
        }
        if (report.ok.length) yield this.reindex(false);
        return report;
      });
    }
    readChapter(id, chapterId, offset = 0, limit = 6e3) {
      return __async(this, null, function* () {
        const settings = yield getSettings(this.storage, this.root);
        const size = Math.max(500, Math.min(5e4, Number(limit) || settings.page_size || 6e3));
        return yield readChapter(this.storage, this.root, id, chapterId, offset, size);
      });
    }
    setProgress(id, patch) {
      return __async(this, null, function* () {
        const meta = yield getMeta(this.storage, this.root, id);
        return bookSummary(yield saveMeta(this.storage, this.root, applyProgress(meta, patch)));
      });
    }
    addBookmark(id, patch) {
      return __async(this, null, function* () {
        const meta = yield getMeta(this.storage, this.root, id);
        return bookSummary(yield saveMeta(this.storage, this.root, applyBookmark(meta, patch)));
      });
    }
    removeBookmark(id, bookmarkId) {
      return __async(this, null, function* () {
        const meta = yield getMeta(this.storage, this.root, id);
        return bookSummary(yield saveMeta(this.storage, this.root, applyRemoveBookmark(meta, bookmarkId)));
      });
    }
    search(q) {
      return __async(this, null, function* () {
        return { mode: "like", results: search(this.index, q) };
      });
    }
    searchFts(q) {
      return __async(this, null, function* () {
        return { mode: "like", tokenizer: null, results: searchFts(this.index, q) };
      });
    }
    reindex(full = false) {
      return __async(this, null, function* () {
        return yield reindex(this.index, { incremental: !full });
      });
    }
    setCollections(tree) {
      return __async(this, null, function* () {
        return yield saveCollections(this.storage, this.root, tree);
      });
    }
    setBookCollections(id, collectionIds) {
      return __async(this, null, function* () {
        const meta = yield getMeta(this.storage, this.root, id);
        meta.collection_ids = Array.isArray(collectionIds) ? [...new Set(collectionIds.map(String))] : [];
        return bookSummary(yield saveMeta(this.storage, this.root, meta));
      });
    }
    /* ---------- 手动封面：统一转 JPEG 存 derived/cover.jpg ----------
       放在 books/ 目录内，导出 .openlib 时 pack.mjs 整目录打包会自动带上。 */
    coverFile(id) {
      return this.storage.join(bookDir(this.storage, this.root, id), "derived", "cover.jpg");
    }
    // 只给书目附加一个布尔标记，图片本体走 /api/cover 按需加载，state() 不塞 base64。
    withCovers(list) {
      return __async(this, null, function* () {
        return yield Promise.all(list.map((b) => __async(this, null, function* () {
          return __spreadProps(__spreadValues({}, b), {
            hasCover: yield this.storage.exists(this.coverFile(b.id))
          });
        })));
      });
    }
    getBookCover(id) {
      return __async(this, null, function* () {
        const p = this.coverFile(id);
        if (!(yield this.storage.exists(p))) throw new Error("\u8FD9\u672C\u4E66\u8FD8\u6CA1\u6709\u5C01\u9762");
        return yield this.storage.readFile(p);
      });
    }
    // dataUrl 由前端 canvas 生成，固定为 data:image/jpeg;base64,...；上限 3 MB。
    setBookCover(id, dataUrl) {
      return __async(this, null, function* () {
        const meta = yield getMeta(this.storage, this.root, id);
        const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
        if (!m) throw new Error("\u5C01\u9762\u6570\u636E\u683C\u5F0F\u4E0D\u6B63\u786E");
        const bin = atob(m[1]);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        if (bytes.length < 2) throw new Error("\u5C01\u9762\u6570\u636E\u4E3A\u7A7A");
        if (bytes.length > 3 * 1024 * 1024) throw new Error("\u5C01\u9762\u8FC7\u5927\uFF08\u4E0A\u9650 3 MB\uFF09");
        if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error("\u4E0D\u662F\u6709\u6548\u7684 JPEG \u56FE\u7247");
        yield this.storage.writeFile(this.coverFile(id), bytes);
        meta.cover = { file: "derived/cover.jpg", updated_at: (/* @__PURE__ */ new Date()).toISOString() };
        yield saveMeta(this.storage, this.root, meta);
        return { ok: true, size: bytes.length };
      });
    }
    removeBookCover(id) {
      return __async(this, null, function* () {
        const meta = yield getMeta(this.storage, this.root, id);
        yield this.storage.remove(this.coverFile(id));
        if (meta.cover) {
          delete meta.cover;
          yield saveMeta(this.storage, this.root, meta);
        }
        return { ok: true };
      });
    }
    renameBook(id, title) {
      return __async(this, null, function* () {
        const meta = yield getMeta(this.storage, this.root, id);
        const t = String(title || "").trim().slice(0, 120);
        if (!t) throw new Error("\u4E66\u540D\u4E0D\u80FD\u4E3A\u7A7A");
        meta.title = t;
        return bookSummary(yield saveMeta(this.storage, this.root, meta));
      });
    }
    listBookmarks() {
      return __async(this, null, function* () {
        const out = [];
        for (const m of yield listBooks(this.storage, this.root)) {
          for (const b of (m.bookmarks || []).filter((x2) => !x2.deleted_at)) {
            out.push(__spreadProps(__spreadValues({}, b), { bookId: m.id, bookTitle: m.title }));
          }
        }
        return out.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      });
    }
    getSettings() {
      return __async(this, null, function* () {
        return yield getSettings(this.storage, this.root);
      });
    }
    setSettings(patch) {
      return __async(this, null, function* () {
        return yield saveSettings(this.storage, this.root, patch);
      });
    }
    exportBook(id) {
      return __async(this, null, function* () {
        return yield exportBookBytes(this.storage, this.root, id);
      });
    }
    // 扫描版 PDF：按 meta 里记录的字节区间，从原 PDF 直接切片返回页面图片。
    // 不额外存一份 74 MB 的图片副本，原件仍然只有一份。
    getPageImage(id, chapterId) {
      return __async(this, null, function* () {
        const meta = yield getMeta(this.storage, this.root, id);
        const ch = meta.chapters.find((c) => c.id === chapterId) || meta.chapters[0];
        const img = ch == null ? void 0 : ch.image;
        if (!img || img.kind !== "pdf_image" || !Number.isFinite(img.offset) || !Number.isFinite(img.length)) {
          throw new Error("\u8BE5\u7AE0\u8282\u6CA1\u6709\u53EF\u663E\u793A\u7684\u9875\u9762\u56FE\u7247");
        }
        const src = this.storage.join(bookDir(this.storage, this.root, meta.id), `source.${meta.format}`);
        const all = yield this.storage.readFile(src);
        const bytes = all.subarray(img.offset, img.offset + img.length);
        if (!bytes.length) throw new Error("\u9875\u9762\u56FE\u7247\u6570\u636E\u4E3A\u7A7A");
        return { bytes, mime: img.mime || "image/jpeg" };
      });
    }
    exportLibrary() {
      return __async(this, null, function* () {
        return yield exportLibrary(this.storage, this.root);
      });
    }
    importLibrary(bytes) {
      return __async(this, null, function* () {
        const stats = yield importLibraryPack(this.storage, this.root, bytes);
        this.library = yield openLibrary(this.storage, this.root);
        yield this.reindex(true);
        return stats;
      });
    }
    deleteBook(id) {
      return __async(this, null, function* () {
        const r = yield deleteBook(this.storage, this.root, id);
        yield this.reindex(true);
        return r;
      });
    }
    close() {
      closeIndex(this.index);
    }
  };

  // app/src/main/assets/api-bridge.mjs
  var app = null;
  function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }
  function binaryResponse(bytes, mime, filename) {
    const headers = { "Content-Type": mime || "application/octet-stream" };
    if (filename) headers["Content-Disposition"] = "attachment; filename*=UTF-8''" + encodeURIComponent(filename);
    return new Response(bytes, { status: 200, headers });
  }
  function headerName(init) {
    const h = init.headers;
    let v = "";
    if (h instanceof Headers) v = h.get("x-file-name") || "";
    else if (Array.isArray(h)) v = (h.find((x2) => String(x2[0]).toLowerCase() === "x-file-name") || [])[1] || "";
    else if (h && typeof h === "object") {
      const k = Object.keys(h).find((x2) => x2.toLowerCase() === "x-file-name");
      v = k ? h[k] : "";
    }
    try {
      return decodeURIComponent(String(v || "untitled.txt"));
    } catch (e) {
      return String(v || "untitled.txt");
    }
  }
  function bodyBytes(init) {
    return __async(this, null, function* () {
      const b = init.body;
      if (b == null) return new Uint8Array();
      if (b instanceof ArrayBuffer) return new Uint8Array(b);
      if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      if (typeof Blob !== "undefined" && b instanceof Blob) return new Uint8Array(yield b.arrayBuffer());
      if (typeof b === "string") return new TextEncoder().encode(b);
      return new Uint8Array();
    });
  }
  function bodyJson(init) {
    const raw = new TextDecoder("utf-8").decode(bodyBytesSync(init));
    return raw ? JSON.parse(raw) : {};
  }
  function bodyBytesSync(init) {
    const b = init.body;
    if (b == null) return new Uint8Array();
    if (b instanceof ArrayBuffer) return new Uint8Array(b);
    if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    if (typeof b === "string") return new TextEncoder().encode(b);
    return new Uint8Array();
  }
  function dispatch(action, body) {
    return __async(this, null, function* () {
      var _a2;
      switch (action) {
        case "state":
          return yield app.state();
        case "list-books":
          return yield app.listBooks();
        case "get-book":
          return yield app.getBook(body.id);
        case "read-chapter":
          return yield app.readChapter(body.id, body.chapterId, body.offset, body.limit);
        case "set-progress":
          return yield app.setProgress(body.id, body);
        case "add-bookmark":
          return yield app.addBookmark(body.id, body);
        case "remove-bookmark":
          return yield app.removeBookmark(body.id, body.bookmarkId);
        case "search":
          return yield app.search(body.q);
        case "search-fts":
          return yield app.searchFts(body.q);
        case "reindex":
          return yield app.reindex(!!body.full);
        case "set-collections":
          return yield app.setCollections(body.tree);
        case "set-book-collections":
          return yield app.setBookCollections(body.id, body.collectionIds);
        case "set-book-cover":
          return yield app.setBookCover(body.id, body.dataUrl);
        case "remove-book-cover":
          return yield app.removeBookCover(body.id);
        case "rename-book":
          return yield app.renameBook(body.id, body.title);
        case "list-bookmarks":
          return yield app.listBookmarks();
        case "get-settings":
          return yield app.getSettings();
        case "set-settings":
          return yield app.setSettings((_a2 = body.patch) != null ? _a2 : body);
        case "delete-book":
          return yield app.deleteBook(body.id);
        default:
          throw new Error("\u672A\u77E5\u64CD\u4F5C: " + action);
      }
    });
  }
  function handle(url, init) {
    return __async(this, null, function* () {
      const p = url.pathname;
      const method = String(init.method || "GET").toUpperCase();
      if (method === "GET" && p === "/api/state") return jsonResponse(yield app.state());
      if (method === "GET" && p === "/api/cover") {
        return binaryResponse(yield app.getBookCover(url.searchParams.get("id")), "image/jpeg");
      }
      if (method === "GET" && p === "/api/page-image") {
        const out = yield app.getPageImage(url.searchParams.get("id"), url.searchParams.get("chapterId"));
        return binaryResponse(out.bytes, out.mime || "image/jpeg");
      }
      if (method === "GET" && p === "/api/export-book") {
        const out = yield app.exportBook(url.searchParams.get("id"));
        return binaryResponse(out.bytes, "text/plain; charset=utf-8", out.filename);
      }
      if (method === "GET" && p === "/api/export-library") {
        return binaryResponse(yield app.exportLibrary(), "application/zip", "my-library.openlib");
      }
      if (method === "POST" && p === "/api/import-book") {
        const bytes = yield bodyBytes(init);
        if (!bytes.length) throw new Error("\u6587\u4EF6\u4E3A\u7A7A");
        return jsonResponse(yield app.importBook({ filename: headerName(init), bytes }));
      }
      if (method === "POST" && p === "/api/import-library") {
        return jsonResponse(yield app.importLibrary(yield bodyBytes(init)));
      }
      if (method === "POST" && p === "/api/import-smart") {
        const bytes = yield bodyBytes(init);
        if (!bytes.length) throw new Error("\u6587\u4EF6\u4E3A\u7A7A");
        return jsonResponse(yield app.importSmart({ filename: headerName(init), bytes }));
      }
      if (method === "POST" && p.startsWith("/api/")) {
        return jsonResponse(yield dispatch(p.slice(5), bodyJson(init)));
      }
      return new Response("Not found", { status: 404 });
    });
  }
  function initBridge() {
    return __async(this, null, function* () {
      const storage = createAndroidStorage();
      app = new LibraryApp(storage, "/library", { name: "\u6211\u7684\u4E66\u5E93", forceMemory: true });
      yield app.init();
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (_0, ..._1) => __async(null, [_0, ..._1], function* (input, init = {}) {
        let url;
        try {
          const raw = typeof input === "string" ? input : input && input.url || "";
          url = new URL(raw, location.href);
        } catch (e) {
          return nativeFetch(input, init);
        }
        if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) {
          return nativeFetch(input, init);
        }
        try {
          return yield handle(url, init);
        } catch (e) {
          return jsonResponse({ error: (e == null ? void 0 : e.message) || String(e) }, 400);
        }
      });
      return app;
    });
  }

  // app/src/main/assets/bootstrap.mjs
  function fatal(e) {
    const msg = e && (e.stack || e.message) ? String(e.stack || e.message) : String(e);
    console.error("[openreader] bootstrap failed", e);
    if (window.__orErrors) window.__orErrors.push("bootstrap: " + msg.slice(0, 200));
    const box = document.getElementById("or-diag");
    if (box) {
      const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
      box.innerHTML = '<b>\u5F00\u653E\u4E66\u5E93\u542F\u52A8\u5931\u8D25</b><div>\u53EF\u5C1D\u8BD5\uFF1A\u8BBE\u7F6E \u2192 \u5E94\u7528 \u2192 \u5F00\u653E\u4E66\u5E93 \u2192 \u6E05\u9664\u6570\u636E\u540E\u91CD\u65B0\u6253\u5F00\u3002</div><pre style="white-space:pre-wrap;word-break:break-all;font-size:11px;margin:6px 0 0">' + esc(msg.slice(0, 1200)) + "</pre>";
      box.classList.remove("hidden");
      return;
    }
    document.body.innerHTML = '<div style="padding:24px;font:14px/1.7 sans-serif;color:#333"><h2>\u5F00\u653E\u4E66\u5E93\u542F\u52A8\u5931\u8D25</h2><pre style="white-space:pre-wrap;word-break:break-all">' + msg.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]) + "</pre></div>";
  }
  function installImageHydrator() {
    const hydrate = () => {
      const imgs = document.querySelectorAll('img[src^="/api/"]');
      for (const img of imgs) {
        const src = img.getAttribute("src");
        if (!src || img.dataset.hydrated === src) continue;
        img.dataset.hydrated = src;
        fetch(src).then((r) => r.ok ? r.blob() : null).then((blob) => {
          if (!blob) return;
          const u = URL.createObjectURL(blob);
          img.src = u;
          img.addEventListener("load", () => URL.revokeObjectURL(u), { once: true });
          img.addEventListener("error", () => URL.revokeObjectURL(u), { once: true });
        }).catch(() => {
        });
      }
    };
    new MutationObserver(hydrate).observe(document.documentElement, { childList: true, subtree: true });
    hydrate();
  }
  function installExport() {
    window.androidExport = (url) => __async(null, null, function* () {
      var _a2, _b2, _c, _d;
      try {
        const isLib = url.indexOf("export-library") >= 0;
        const custom = isLib ? window.__orBackupName || "" : "";
        if (isLib) window.__orBackupName = "";
        const r = yield fetch(url);
        if (!r.ok) {
          const j = yield r.json().catch(() => ({}));
          if ((_a2 = window.AndroidNative) == null ? void 0 : _a2.toast) window.AndroidNative.toast("\u5BFC\u51FA\u5931\u8D25\uFF1A" + (j.error || r.status));
          return;
        }
        const cd = r.headers.get("Content-Disposition") || "";
        const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
        const name = custom || (m ? decodeURIComponent(m[1]) : isLib ? "my-library.openlib" : "book.txt");
        const bytes = new Uint8Array(yield r.arrayBuffer());
        let bin = "";
        const CH = 32768;
        for (let i2 = 0; i2 < bytes.length; i2 += CH) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i2, Math.min(i2 + CH, bytes.length)));
        }
        if (isLib && ((_b2 = window.AndroidNative) == null ? void 0 : _b2.saveBackup)) {
          window.AndroidNative.saveBackup(name, btoa(bin));
        } else if ((_c = window.AndroidNative) == null ? void 0 : _c.saveFile) {
          window.AndroidNative.saveFile(name, btoa(bin));
        } else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([bytes]));
          a.download = name;
          a.click();
        }
      } catch (e) {
        console.error("[openreader] export failed", e);
        if ((_d = window.AndroidNative) == null ? void 0 : _d.toast) window.AndroidNative.toast("\u5BFC\u51FA\u5931\u8D25\uFF1A" + e.message);
      }
    });
  }
  function installAndroidCopy() {
    const patch = () => {
      const p = document.querySelector("#shelf-grid .empty-state p");
      if (!p || p.dataset.orCopy === "1") return;
      if (!/拖进窗口|点左上角/.test(p.textContent)) return;
      p.dataset.orCopy = "1";
      p.innerHTML = "\u70B9\u9876\u90E8\u300C\uFF0B \u5BFC\u5165\u300D\u6216\u83DC\u5355\u91CC\u7684\u300C\u5BFC\u5165\u4E66\u7C4D\u300D\u3002<br>\u652F\u6301 PDF / EPUB / MOBI / DOCX / DOC / RTF / ODT / FB2 / TXT \u7B49\u3002";
    };
    new MutationObserver(patch).observe(document.documentElement, { childList: true, subtree: true });
    patch();
  }
  (() => __async(null, null, function* () {
    var _a2;
    try {
      yield initBridge();
      installImageHydrator();
      installExport();
      installAndroidCopy();
      window.__orBootOK = true;
      yield Promise.resolve().then(() => __toESM(require_app(), 1));
      if (window.innerWidth <= 860) {
        (_a2 = document.getElementById("btn-toc-collapse")) == null ? void 0 : _a2.click();
      }
    } catch (e) {
      fatal(e);
    }
  }))();
})();
