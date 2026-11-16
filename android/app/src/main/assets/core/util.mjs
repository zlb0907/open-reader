export const FORMAT = 'open-library';
export const SCHEMA_VERSION = 1;
export const LIBRARY_FILE = 'library.json';
export const COLLECTIONS_FILE = 'collections.json';
export const SETTINGS_FILE = 'settings.json';
export const BOOKS_DIR = 'books';
export const INDEX_DIR = '.index';
export const INDEX_FILE = 'search.db';
export const META_FILE = 'meta.json';
export const DERIVED_TEXT = 'derived/text.txt';
export const PACK_SUFFIX = '.openlib';

export function uuid() {
  return globalThis.crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function parseTime(v) {
  if (typeof v !== 'string') return -Infinity;
  const t = Date.parse(v);
  return Number.isNaN(t) ? -Infinity : t;
}

export function laterIso(a, b) {
  return parseTime(b) > parseTime(a) ? b : a;
}

export async function sha256Hex(input) {
  let bytes;
  if (typeof input === 'string') bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function encode(s) {
  return new TextEncoder().encode(s);
}

export function decode(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

export function toJson(obj) {
  return encode(JSON.stringify(obj, null, 2) + '\n');
}

export function fromJson(bytes, fallback = null) {
  try {
    return JSON.parse(typeof bytes === 'string' ? bytes : decode(bytes));
  } catch {
    return fallback;
  }
}

export function safeName(name) {
  const base = String(name || 'untitled').split(/[\\/]/).pop();
  const cleaned = base.replace(/[<>:"|?*\x00-\x1f]/g, '_').trim();
  return cleaned.slice(0, 120) || 'untitled';
}

export function extOf(name) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(safeName(name));
  return m ? m[1].toLowerCase() : 'txt';
}

export function titleFromName(name) {
  return safeName(name).replace(/\.[A-Za-z0-9]{1,8}$/, '').trim() || '未命名';
}

export function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

export function makeSnippet(body, term, width = 36) {
  const text = String(body || '').replace(/\s+/g, ' ');
  const i = text.toLowerCase().indexOf(String(term).toLowerCase());
  if (i < 0) return text.slice(0, width * 2);
  const a = Math.max(0, i - width);
  const b = Math.min(text.length, i + term.length + width);
  return (a > 0 ? '…' : '') + text.slice(a, b) + (b < text.length ? '…' : '');
}
