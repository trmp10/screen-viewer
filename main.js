const { app, BrowserWindow, session, ipcMain, shell, screen, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const https = require('https')
const { execFile } = require('child_process')

let mainWin = null
let activeWebviewContents = null

// --- Updater ---

const YML_URL = 'https://github.com/trmp10/screen-viewer/releases/latest/download/latest-mac.yml'

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'screen-viewer-updater' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        return httpsGet(res.headers.location).then(resolve).catch(reject)
      }
      resolve(res)
    }).on('error', reject)
  })
}

function fetchText(url) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await httpsGet(url)
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    } catch (e) { reject(e) }
  })
}

function downloadFile(url, destPath, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await httpsGet(url)
      const total = parseInt(res.headers['content-length'] || '0', 10)
      let received = 0
      const file = fs.createWriteStream(destPath)
      res.on('data', chunk => {
        received += chunk.length
        file.write(chunk)
        if (total > 0 && onProgress) onProgress(Math.round((received / total) * 100))
      })
      res.on('end', () => { file.end(); resolve() })
      res.on('error', err => { file.destroy(); reject(err) })
    } catch (e) { reject(e) }
  })
}

function execFileAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout) => err ? reject(err) : resolve(stdout || ''))
  })
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}

async function checkForUpdates(manual) {
  try {
    const yml = await fetchText(YML_URL)
    const versionMatch = yml.match(/^version:\s*(.+)$/m)
    if (!versionMatch) throw new Error('Could not parse version from update manifest')
    const latest = versionMatch[1].trim()
    if (compareVersions(latest, app.getVersion()) <= 0) {
      if (manual) mainWin?.webContents.send('update-not-available')
      return
    }
    const urlMatch = yml.match(/url:\s*(Screen-Viewer[^\s\n]+\.dmg)/m)
    if (!urlMatch) throw new Error('No DMG found in update manifest')
    const dmgUrl = `https://github.com/trmp10/screen-viewer/releases/latest/download/${urlMatch[1].trim()}`
    if (manual) mainWin?.webContents.send('update-available', latest)
    await downloadAndInstall(dmgUrl, manual)
  } catch (e) {
    if (manual) mainWin?.webContents.send('update-error', e.message)
  }
}

async function downloadAndInstall(dmgUrl, manual) {
  const tmpDmg = path.join(os.tmpdir(), `sv-update-${Date.now()}.dmg`)
  const mountPoint = path.join(os.tmpdir(), `sv-mount-${Date.now()}`)
  try {
    await downloadFile(dmgUrl, tmpDmg, pct => {
      if (manual) mainWin?.webContents.send('update-progress', pct)
    })
    await execFileAsync('hdiutil', ['attach', '-nobrowse', '-quiet', '-mountpoint', mountPoint, tmpDmg])
    await execFileAsync('ditto', [path.join(mountPoint, 'Screen-Viewer.app'), '/Applications/Screen-Viewer.app'])
    await execFileAsync('hdiutil', ['detach', mountPoint, '-quiet']).catch(() => {})
    try { fs.unlinkSync(tmpDmg) } catch {}
    mainWin?.webContents.send('update-downloaded')
  } catch (e) {
    try { fs.unlinkSync(tmpDmg) } catch {}
    execFile('hdiutil', ['detach', mountPoint, '-quiet'], () => {})
    if (manual) mainWin?.webContents.send('update-error', e.message)
  }
}

// --- IPC (all registered once, outside createWindow) ---

ipcMain.handle('get-version', () => app.getVersion())
ipcMain.on('set-fullscreen', (_, val) => mainWin?.setFullScreen(val))
ipcMain.on('check-for-updates', () => checkForUpdates(true))
ipcMain.on('install-update', () => { app.relaunch(); app.exit() })

ipcMain.on('take-screenshot', async () => {
  if (!activeWebviewContents) return
  const img = await activeWebviewContents.capturePage()
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const tempPath = path.join(os.tmpdir(), `sv-${ts}.png`)
  fs.writeFileSync(tempPath, img.toPNG())
  showThumbnail(tempPath)
})

ipcMain.on('take-screenshot-desktop', async () => {
  if (!activeWebviewContents) return
  const img = await activeWebviewContents.capturePage()
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const destPath = path.join(os.homedir(), 'Desktop', `sv-${ts}.png`)
  fs.writeFileSync(destPath, img.toPNG())
})

ipcMain.on('start-drag', (event, tempPath) => {
  const icon = nativeImage.createFromPath(tempPath).resize({ width: 64 })
  event.sender.startDrag({ file: tempPath, icon })
})

ipcMain.on('open-preview', (_, tempPath) => { showPreview(tempPath) })

ipcMain.on('preview-save', (event, tempPath) => {
  try {
    const dest = path.join(os.homedir(), 'Desktop', path.basename(tempPath))
    fs.copyFileSync(tempPath, dest)
    fs.unlinkSync(tempPath)
  } catch {}
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.on('preview-discard', (event, tempPath) => {
  try { fs.unlinkSync(tempPath) } catch {}
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.on('preview-minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize())

ipcMain.on('preview-maximize', event => {
  const win = BrowserWindow.fromWebContents(event.sender)
  win?.isMaximized() ? win.unmaximize() : win.maximize()
})

ipcMain.on('save-to-desktop', (_, tempPath) => {
  try {
    fs.copyFileSync(tempPath, path.join(os.homedir(), 'Desktop', path.basename(tempPath)))
    fs.unlinkSync(tempPath)
  } catch {}
})

ipcMain.on('delete-temp', (_, tempPath) => { try { fs.unlinkSync(tempPath) } catch {} })

ipcMain.on('close-thumbnail', event => BrowserWindow.fromWebContents(event.sender)?.close())

ipcMain.on('reveal-file', (_, filepath) => shell.showItemInFolder(filepath))

// --- Window helpers ---

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
    width: pw, height: ph,
    x: Math.round((sw - pw) / 2), y: Math.round((sh - ph) / 2),
    frame: false, backgroundColor: '#1c1c1c', resizable: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preview-preload.js') },
  })
  preview.loadFile('preview.html', { query: { path: tempPath } })
}

function showThumbnail(tempPath) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const thumb = new BrowserWindow({
    width: 200, height: 130, x: sw - 220, y: sh - 150,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'thumbnail-preload.js') },
  })
  thumb.loadFile('thumbnail.html', { query: { path: tempPath } })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, title: 'Screen Viewer',
    webPreferences: {
      webSecurity: false, nodeIntegration: false,
      contextIsolation: true, webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  mainWin = win
  session.defaultSession.webRequest.onHeadersReceived(stripFrameHeaders)
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

app.whenReady().then(() => {
  createWindow()
  if (app.isPackaged) checkForUpdates(false)
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
