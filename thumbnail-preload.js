const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('thumbAPI', {
  startDrag:    (p) => ipcRenderer.send('start-drag', p),
  openPreview:  (p) => ipcRenderer.send('open-preview', p),
  saveToDesktop:(p) => ipcRenderer.send('save-to-desktop', p),
  deleteTemp:   (p) => ipcRenderer.send('delete-temp', p),
  close:        ()  => ipcRenderer.send('close-thumbnail'),
})
