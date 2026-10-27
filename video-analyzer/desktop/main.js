'use strict'

// Desktop app: starts Video Analyzer from the bundled runtime (its own Node,
// Python and FFmpeg) and shows it in its own window, no terminal or browser.

const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow, Menu, dialog, shell } = require('electron')
const { startApp, readEnvFile } = require('./runtime')

const runtimeDir = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : path.join(__dirname, 'runtime')
const dataDir = () => path.join(app.getPath('userData'), 'data')
const configFile = () => path.join(app.getPath('userData'), 'configuracion.env')

const CONFIG_TEMPLATE = `# Configuración de Video Analyzer
# Pon al menos una clave para analizar videos y usar el chat.
# Guarda el archivo y reinicia la app (menú Archivo > Reiniciar).

# Claude: https://platform.claude.com/settings/keys
ANTHROPIC_API_KEY=

# Gemini: https://aistudio.google.com/apikey  (también activa la búsqueda semántica)
GEMINI_API_KEY=

# Opcional
# Instagram y algunos TikTok piden sesión iniciada: el navegador donde la
# tienes abierta (firefox, edge, chrome o safari).
# YTDLP_COOKIES_FROM_BROWSER=firefox
# CLAUDE_VISION_MODEL=claude-sonnet-5-5
# WHISPER_MODEL=small
# OBSIDIAN_VAULT_PATH=C:\\Users\\tu-usuario\\Documents\\MiVault
`

let mainWindow = null
let running = null

const SPLASH = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0c11;color:#c9ccd6;font:16px system-ui,sans-serif"><div style="text-align:center"><div style="font-size:20px;color:#fff;margin-bottom:8px">Video Analyzer</div>Iniciando…</div></body></html>`)}`

function ensureConfig() {
  if (!fs.existsSync(configFile())) {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true })
    fs.writeFileSync(configFile(), CONFIG_TEMPLATE)
  }
  return readEnvFile(configFile())
}

function openConfig() {
  ensureConfig()
  shell.openPath(configFile())
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Archivo',
        submenu: [
          { label: 'Configuración (claves de IA)…', click: openConfig },
          { label: 'Abrir carpeta de datos', click: () => shell.openPath(dataDir()) },
          { label: 'Abrir registros', click: () => shell.openPath(path.join(dataDir(), 'logs')) },
          { type: 'separator' },
          { label: 'Reiniciar', click: () => { app.relaunch(); app.quit() } },
          { role: 'quit', label: 'Salir' },
        ],
      },
      {
        label: 'Ver',
        submenu: [
          { role: 'reload', label: 'Recargar' },
          { role: 'zoomIn', label: 'Acercar' },
          { role: 'zoomOut', label: 'Alejar' },
          { role: 'resetZoom', label: 'Tamaño normal' },
          { role: 'togglefullscreen', label: 'Pantalla completa' },
        ],
      },
    ]),
  )
}

async function boot() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Video Analyzer',
    backgroundColor: '#0b0c11',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  // External links open in the browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => { mainWindow = null })
  await mainWindow.loadURL(SPLASH)

  try {
    const settings = ensureConfig()
    running = await startApp({ runtimeDir, dataDir: dataDir(), settings })
    if (!mainWindow) return
    await mainWindow.loadURL(running.url)
    require('./updater').setupUpdates()

    if (!settings.ANTHROPIC_API_KEY && !settings.GEMINI_API_KEY) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Abrir configuración', 'Más tarde'],
        defaultId: 0,
        cancelId: 1,
        title: 'Falta una clave de IA',
        message: 'Para analizar videos y usar el chat necesitas una clave de Claude o de Gemini.',
        detail: 'Pégala en el archivo que se abrirá, guárdalo y reinicia la app (Archivo > Reiniciar). Puedes subir videos mientras tanto.',
      })
      if (response === 0) openConfig()
    }
  } catch (error) {
    dialog.showErrorBox('No se pudo iniciar Video Analyzer', String((error && error.message) || error))
    app.quit()
  }
}

// One instance: opening it again focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.whenReady().then(() => {
    buildMenu()
    boot()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && running) {
        boot()
      }
    })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  // The web server and the worker are child processes: never leave them running.
  app.on('will-quit', () => running && running.stop())
}
