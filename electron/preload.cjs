/* 只暴露最小能力集给前端，保持浏览器版本可独立运行。 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  onMenu: (cb) => ipcRenderer.on('menu', (_event, action) => cb(action)),
  onLibraryChanged: (cb) => ipcRenderer.on('library-changed', () => cb()),
  openLibraryDir: () => ipcRenderer.invoke('open-library-dir'),
  armWebview: (id) => ipcRenderer.invoke('arm-webview', id),
  qiushuUnread: () => ipcRenderer.invoke('qiushu-unread'),
  setFullscreen: (on) => ipcRenderer.invoke('set-fullscreen', !!on),
});
