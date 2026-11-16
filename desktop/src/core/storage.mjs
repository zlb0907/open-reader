import * as fs from 'node:fs/promises';
import path from 'node:path';

// StorageBackend: 各端唯一的平台相关层。
// 桌面/Node 用真实文件系统；Android 端用 Capacitor Filesystem + SAF 实现同一组方法即可，
// core 其余模块无需改动。
export class NodeStorage {
  join(...parts) { return path.join(...parts); }
  dirname(p) { return path.dirname(p); }
  basename(p) { return path.basename(p); }
  extname(p) { return path.extname(p); }
  resolve(p) { return path.resolve(p); }
  async exists(p) { try { await fs.access(p); return true; } catch { return false; } }
  async readFile(p) { return new Uint8Array(await fs.readFile(p)); }
  async writeFile(p, data) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  }
  async readText(p) { return await fs.readFile(p, 'utf8'); }
  async mkdir(p) { await fs.mkdir(p, { recursive: true }); }
  async readdir(p) {
    try { return await fs.readdir(p, { withFileTypes: true }); }
    catch { return []; }
  }
  async isFile(p) { try { return (await fs.stat(p)).isFile(); } catch { return false; } }
  async copyFile(src, dst) {
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst);
  }
  async remove(p) { await fs.rm(p, { recursive: true, force: true }); }
  async stat(p) { return await fs.stat(p); }
}

export function createNodeStorage() {
  return new NodeStorage();
}
