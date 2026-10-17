'use strict'

// Automatic updates: on start the app checks its own release feed on GitHub
// (the "video-analyzer-latest" release, separate from the video editor's).
// Windows: downloads in the background and installs on restart.
// Mac: without Apple signing it cannot install itself; it says so and opens
// the download page.

const { app, dialog, shell } = require('electron')

const RELEASES_URL = 'https://github.com/sanmiguelyt955/Claude/releases/tag/video-analyzer-latest'

function setupUpdates() {
  // In development (npm run app) there is nothing to update.
  if (!app.isPackaged) return

  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = process.platform !== 'darwin'
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('update-available', (info) => {
    if (process.platform !== 'darwin') return
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Descargar', 'Más tarde'],
        defaultId: 0,
        cancelId: 1,
        title: 'Hay una versión nueva',
        message: `Hay una versión nueva de Video Analyzer (${info.version}).`,
        detail: 'Descárgala y reemplaza la app actual en Aplicaciones. Tus videos y análisis se conservan.',
      })
      .then(({ response }) => {
        if (response === 0) shell.openExternal(RELEASES_URL)
      })
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Reiniciar ahora', 'Después'],
        defaultId: 0,
        cancelId: 1,
        title: 'Actualización lista',
        message: `La versión ${info.version} ya está descargada.`,
        detail: 'Reinicia Video Analyzer para usarla. Tus videos y análisis se conservan.',
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })

  // An update error must never stop the app from working.
  autoUpdater.on('error', () => {})

  autoUpdater.checkForUpdates().catch(() => {})
}

module.exports = { setupUpdates }
