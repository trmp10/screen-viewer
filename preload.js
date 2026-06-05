const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  setFullScreen: (val) => ipcRenderer.send('set-fullscreen', val),
  onKey: (cb) => ipcRenderer.on('key', (_, key) => cb(key)),
  takeScreenshot: () => ipcRenderer.send('take-screenshot'),
  takeScreenshotDesktop: () => ipcRenderer.send('take-screenshot-desktop'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update-not-available', () => cb()),
  onUpdateError: (cb) => ipcRenderer.on('update-error', (_, msg) => cb(msg)),
  installUpdate: () => ipcRenderer.send('install-update'),
})
