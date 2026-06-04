const { app, BrowserWindow, session, ipcMain, globalShortcut } = require('electron')
const path = require('path')

function stripFrameHeaders(details, callback) {
  const headers = { ...details.responseHeaders }
  delete headers['x-frame-options']
  delete headers['X-Frame-Options']
  delete headers['content-security-policy']
  delete headers['Content-Security-Policy']
  callback({ responseHeaders: headers })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Screen Viewer',
    webPreferences: {
      webSecurity: false,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  session.defaultSession.webRequest.onHeadersReceived(stripFrameHeaders)

  ipcMain.on('set-fullscreen', (_, val) => win.setFullScreen(val))

  win.loadFile('index.html')
  win.setMenuBarVisibility(false)

  win.on('focus', () => {
    globalShortcut.register('Escape', () => win.webContents.send('key', 'Escape'))
    globalShortcut.register('Left', () => win.webContents.send('key', 'ArrowLeft'))
    globalShortcut.register('Right', () => win.webContents.send('key', 'ArrowRight'))
  })

  win.on('blur', () => globalShortcut.unregisterAll())
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
