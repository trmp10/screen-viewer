const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  setFullScreen: (val) => ipcRenderer.send('set-fullscreen', val),
  onKey: (cb) => ipcRenderer.on('key', (_, key) => cb(key)),
  takeScreenshot: () => ipcRenderer.send('take-screenshot'),
})
