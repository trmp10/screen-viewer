const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  setFullScreen: (val) => ipcRenderer.send('set-fullscreen', val),
  onKey: (cb) => ipcRenderer.on('key', (_, key) => cb(key)),
  takeScreenshot: () => ipcRenderer.send('take-screenshot'),
  release: () => ipcRenderer.send('release'),
  onUpdateDone: (cb) => ipcRenderer.on('release-done', (_, version) => cb(version)),
  onUpdateError: (cb) => ipcRenderer.on('release-error', (_, msg) => cb(msg)),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
  installUpdate: () => ipcRenderer.send('install-update'),
})
