import {
  FORMAT, SCHEMA_VERSION, LIBRARY_FILE, COLLECTIONS_FILE, SETTINGS_FILE,
  BOOKS_DIR, INDEX_DIR, uuid, nowIso, toJson, fromJson, encode,
} from './util.mjs';

const DEFAULT_SETTINGS = {
  theme: 'light',
  font_size: 18,
  line_height: 1.8,
  font_family: 'serif',
  page_size: 6000,
  // 书架排列：grid = 封面网格；list = 一行一本的紧凑列表（书名 / 作者 / 进度一目了然）。
  shelf_view: 'grid',
  // 网格密度 large / medium / small；只影响封面网格，列表视图行高固定。
  // 默认中档：原来的 196px 大封面在手机上太占面积。
  shelf_density: 'medium',
  // 阅读方式：scroll = 上下连续滑动自动续章；page = 仿真书页，一屏一页左右翻动。
  read_mode: 'scroll',
  // 翻页动画：book = 3D 仿真翻书（老 WebView 自动降级为 slide）；
  // slide = 横向滑动；none = 直接换页。用户可在设置里关掉动画。
  page_effect: 'book',
  // 内置书库维护者的在线页；新建 / 重建书库时自动带上，避免删 data 后页面变空白。
  // 想禁用某一项：把 data/settings.json 对应键改成 ""（磁盘值优先于默认值）。
  qiushu_url: 'https://soshu.pythonanywhere.com/qiushu/',
  shuku_url: 'https://soshu.pythonanywhere.com/shuku/',
  // 用户建议（内嵌在线页）。与上面两项一样属于程序内置默认值，不写盘。
  suggest_url: 'https://soshu.pythonanywhere.com/suggest/',
};

// 在线页地址属于程序内置默认值，不写进 data/settings.json；
// 只有用户显式改成别的地址（或清空以禁用）时才落盘，保持可覆盖能力。
function persistableSettings(s) {
  const out = { ...s };
  if (out.qiushu_url === DEFAULT_SETTINGS.qiushu_url) delete out.qiushu_url;
  if (out.shuku_url === DEFAULT_SETTINGS.shuku_url) delete out.shuku_url;
  if (out.suggest_url === DEFAULT_SETTINGS.suggest_url) delete out.suggest_url;
  return out;
}

export async function createLibrary(storage, root, name = '我的书库') {
  await storage.mkdir(root);
  await storage.mkdir(storage.join(root, BOOKS_DIR));
  await storage.mkdir(storage.join(root, INDEX_DIR));
  const t = nowIso();
  const library = {
    format: FORMAT,
    schema_version: SCHEMA_VERSION,
    library_id: uuid(),
    name,
    created_at: t,
    updated_at: t,
  };
  await storage.writeFile(storage.join(root, LIBRARY_FILE), toJson(library));
  await storage.writeFile(storage.join(root, COLLECTIONS_FILE), toJson({ updated_at: t, root: [] }));
  await storage.writeFile(storage.join(root, SETTINGS_FILE), toJson(persistableSettings(DEFAULT_SETTINGS)));
  return library;
}

// 打开已有库；目录不存在则新建。读到更高 schema_version 时拒绝写入（规范第 8 节）。
export async function openLibrary(storage, root, name) {
  const libPath = storage.join(root, LIBRARY_FILE);
  if (!(await storage.exists(libPath))) {
    return await createLibrary(storage, root, name);
  }
  const library = fromJson(await storage.readFile(libPath));
  if (!library || library.format !== FORMAT) {
    throw new Error('不是有效的开放书库目录（缺少 library.json 或 format 不匹配）');
  }
  if (Number(library.schema_version) > SCHEMA_VERSION) {
    throw new Error(`书库版本 ${library.schema_version} 高于本程序支持的 ${SCHEMA_VERSION}，请升级程序，已拒绝写入`);
  }
  await storage.mkdir(storage.join(root, BOOKS_DIR));
  await storage.mkdir(storage.join(root, INDEX_DIR));
  const colPath = storage.join(root, COLLECTIONS_FILE);
  if (!(await storage.exists(colPath))) {
    await storage.writeFile(colPath, toJson({ updated_at: nowIso(), root: [] }));
  }
  const setPath = storage.join(root, SETTINGS_FILE);
  if (!(await storage.exists(setPath))) {
    // 与 createLibrary 一致：内置在线页地址不落盘，删掉 settings.json 也能自动恢复。
    await storage.writeFile(setPath, toJson(persistableSettings(DEFAULT_SETTINGS)));
  }
  return library;
}

export async function getCollections(storage, root) {
  const p = storage.join(root, COLLECTIONS_FILE);
  return fromJson(await storage.readFile(p), { updated_at: nowIso(), root: [] });
}

export async function saveCollections(storage, root, tree) {
  const nodes = Array.isArray(tree) ? tree : tree?.root;
  if (!Array.isArray(nodes)) throw new Error('书架树格式不正确');
  const value = { updated_at: nowIso(), root: nodes };
  await storage.writeFile(storage.join(root, COLLECTIONS_FILE), toJson(value));
  return value;
}

export async function getSettings(storage, root) {
  const p = storage.join(root, SETTINGS_FILE);
  return { ...DEFAULT_SETTINGS, ...fromJson(await storage.readFile(p), {}) };
}

export async function saveSettings(storage, root, patch) {
  const next = { ...(await getSettings(storage, root)), ...(patch || {}) };
  // 返回值保留完整的 next（前端 state.settings 不丢求书地址），落盘时剔除默认地址。
  await storage.writeFile(storage.join(root, SETTINGS_FILE), toJson(persistableSettings(next)));
  return next;
}

export function libraryFilePaths() {
  return [LIBRARY_FILE, COLLECTIONS_FILE, SETTINGS_FILE];
}

export { DEFAULT_SETTINGS };
