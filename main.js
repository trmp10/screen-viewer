const { app, BrowserWindow, session, ipcMain } = require('electron')
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

  win.webContents.on('did-attach-webview', (_, webviewContents) => {
    webviewContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      if (['Escape', 'ArrowLeft', 'ArrowRight'].includes(input.key)) {
        win.webContents.send('key', input.key)
      }
    })
  })

  win.loadFile('index.html')
  win.setMenuBarVisibility(false)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
