import { deepClone, nowIso, parseTime, uuid } from './util.mjs';

// 多端合并（规范第 4 节）：元信息 last-write-wins，progress 取进度更靠前者，
// 书签按 id 取并集（deleted_at 为墓碑）。纯函数，便于测试与 Android 端复用。
export function mergeMeta(a, b) {
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

  const map = new Map();
  for (const bm of [...(a.bookmarks || []), ...(b.bookmarks || [])]) {
    if (!bm || !bm.id) continue;
    const cur = map.get(bm.id);
    if (!cur || parseTime(bm.updated_at) >= parseTime(cur.updated_at)) map.set(bm.id, bm);
  }
  out.bookmarks = [...map.values()].sort((x, y) =>
    String(x.created_at || '').localeCompare(String(y.created_at || '')));
  return out;
}

// 本地写入：允许用户主动回退进度；LWW 只在多端合并时生效。
export function applyProgress(meta, patch) {
  const out = deepClone(meta);
  const prev = out.progress || {};
  const pct = Number(patch.percent ?? prev.percent ?? 0);
  out.progress = {
    chapter_id: patch.chapter_id ?? prev.chapter_id ?? out.chapters?.[0]?.id ?? null,
    percent: Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0)),
    locator: patch.locator ?? prev.locator ?? { kind: 'txt_offset', offset: 0 },
    updated_at: nowIso(),
  };
  out.revision = (Number(out.revision) || 1) + 1;
  out.updated_at = nowIso();
  return out;
}

export function applyBookmark(meta, patch) {
  const out = deepClone(meta);
  const t = nowIso();
  const bm = {
    id: patch.id || uuid(),
    chapter_id: patch.chapter_id ?? meta.chapters?.[0]?.id ?? null,
    offset: Number(patch.offset) || 0,
    note: String(patch.note || ''),
    created_at: t,
    updated_at: t,
    deleted_at: null,
  };
  out.bookmarks = [...(out.bookmarks || []), bm];
  out.revision = (Number(out.revision) || 1) + 1;
  out.updated_at = t;
  return out;
}

export function applyRemoveBookmark(meta, id) {
  const out = deepClone(meta);
  const t = nowIso();
  out.bookmarks = (out.bookmarks || []).map((b) =>
    b.id === id ? { ...b, deleted_at: t, updated_at: t } : b);
  out.revision = (Number(out.revision) || 1) + 1;
  out.updated_at = t;
  return out;
}

export function activeBookmarks(meta) {
  return (meta?.bookmarks || []).filter((b) => !b.deleted_at);
}
