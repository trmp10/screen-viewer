const { ipcRenderer } = require('electron')
window.__svSend = (data) => ipcRenderer.sendToHost(JSON.stringify(data))
