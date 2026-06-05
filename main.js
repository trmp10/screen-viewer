const { app, BrowserWindow, session, ipcMain, shell, screen, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execSync } = require('child_process')
const { autoUpdater } = require('electron-updater')

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = false

let activeWebviewContents = null
let mainWin = null

function stripFrameHeaders(details, callback) {
  const headers = { ...details.responseHeaders }
  delete headers['x-frame-options']
  delete headers['X-Frame-Options']
  delete headers['content-security-policy']
  delete headers['Content-Security-Policy']
  callback({ responseHeaders: headers })
}

function showPreview(tempPath) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const pw = Math.round(Math.min(1000, sw * 0.75))
  const ph = Math.round(Math.min(700, sh * 0.75))
  const preview = new BrowserWindow({
    width: pw,
    height: ph,
    x: Math.round((sw - pw) / 2),
    y: Math.round((sh - ph) / 2),
    frame: false,
    backgroundColor: '#1c1c1c',
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preview-preload.js'),
    },
  })
  preview.loadFile('preview.html', { query: { path: tempPath } })
}

function showThumbnail(tempPath) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const thumb = new BrowserWindow({
    width: 200,
    height: 130,
    x: sw - 220,
    y: sh - 150,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'thumbnail-preload.js'),
    },
  })
  thumb.loadFile('thumbnail.html', { query: { path: tempPath } })
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

  mainWin = win

  session.defaultSession.webRequest.onHeadersReceived(stripFrameHeaders)

  ipcMain.on('set-fullscreen', (_, val) => win.setFullScreen(val))

  ipcMain.on('check-for-updates', () => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdates()
    } else {
      win.webContents.send('update-not-available')
    }
  })

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  ipcMain.on('release', (event) => {
    const dir = app.isPackaged
      ? path.join(os.homedir(), 'Documents', 'Cursor', 'screen-viewer')
      : __dirname
    try {
      const pkgPath = path.join(dir, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const parts = pkg.version.split('.').map(Number)
      parts[2]++
      const newVersion = parts.join('.')
      pkg.version = newVersion
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
      const opts = { cwd: dir }
      execSync('git add -A', opts)
      execSync(`git commit -m "chore: release v${newVersion}"`, opts)
      execSync(`git tag v${newVersion}`, opts)
      execSync('git push origin master --tags', opts)
      event.sender.send('release-done', newVersion)
    } catch (e) {
      event.sender.send('release-error', e.message)
    }
  })

  ipcMain.on('take-screenshot', async () => {
    if (!activeWebviewContents) return
    const img = await activeWebviewContents.capturePage()
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const tempPath = path.join(os.tmpdir(), `sv-${ts}.png`)
    fs.writeFileSync(tempPath, img.toPNG({ scaleFactor: 2 }))
    showThumbnail(tempPath)
  })

  ipcMain.on('start-drag', (event, tempPath) => {
    const icon = nativeImage.createFromPath(tempPath).resize({ width: 64 })
    event.sender.startDrag({ file: tempPath, icon })
  })

  ipcMain.on('open-preview', (_, tempPath) => {
    showPreview(tempPath)
  })

  ipcMain.on('preview-save', (event, tempPath) => {
    try {
      const dest = path.join(os.homedir(), 'Desktop', path.basename(tempPath))
      fs.copyFileSync(tempPath, dest)
      fs.unlinkSync(tempPath)
    } catch (e) {}
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('preview-discard', (event, tempPath) => {
    try { fs.unlinkSync(tempPath) } catch (e) {}
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('preview-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on('preview-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.isMaximized() ? win.unmaximize() : win?.maximize()
  })

  ipcMain.on('save-to-desktop', (_, tempPath) => {
    try {
      const filename = path.basename(tempPath)
      const dest = path.join(os.homedir(), 'Desktop', filename)
      fs.copyFileSync(tempPath, dest)
      fs.unlinkSync(tempPath)
    } catch (e) {}
  })

  ipcMain.on('delete-temp', (_, tempPath) => {
    try { fs.unlinkSync(tempPath) } catch (e) {}
  })

  ipcMain.on('close-thumbnail', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.on('reveal-file', (_, filepath) => {
    shell.showItemInFolder(filepath)
  })

  win.webContents.on('did-attach-webview', (_, webviewContents) => {
    activeWebviewContents = webviewContents
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

app.on('web-contents-created', (_, contents) => {
  contents.on('will-attach-webview', (_, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'webview-preload.js')
  })
})

autoUpdater.on('update-downloaded', () => {
  mainWin?.webContents.send('update-downloaded')
})

autoUpdater.on('update-not-available', () => {
  mainWin?.webContents.send('update-not-available')
})

autoUpdater.on('error', (err) => {
  mainWin?.webContents.send('update-error', err.message)
})

app.whenReady().then(() => {
  createWindow()
  if (app.isPackaged) autoUpdater.checkForUpdates()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
