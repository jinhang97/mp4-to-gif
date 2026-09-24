const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectVideo: () => ipcRenderer.invoke('select-video'),
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  probeVideo: (filePath) => ipcRenderer.invoke('probe-video', filePath),
  convert: (opts) => ipcRenderer.invoke('convert', opts),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  // 拖拽文件时获取真实路径（新版 Electron 中 File.path 已移除）
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onProgress: (cb) => ipcRenderer.on('convert-progress', (_e, pct) => cb(pct))
});
