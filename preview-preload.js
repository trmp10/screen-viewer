const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('previewAPI', {
  saveToDesktop: (p) => ipcRenderer.send('preview-save', p),
  discard:       (p) => ipcRenderer.send('preview-discard', p),
  minimize:      ()  => ipcRenderer.send('preview-minimize'),
  maximize:      ()  => ipcRenderer.send('preview-maximize'),
})
