'use strict';

// Actualizaciones automáticas: la app revisa GitHub Releases al abrirse.
// Windows: descarga e instala la versión nueva al confirmar.
// Mac: sin firma de Apple no se puede instalar sola; avisa y abre la página de descarga.

const { app, dialog, shell } = require('electron');

const RELEASES_URL = 'https://github.com/sanmiguelyt955/Claude/releases/latest';

function setupUpdates() {
  // En desarrollo (npm run app) no hay nada que actualizar.
  if (!app.isPackaged) return;

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = process.platform !== 'darwin';
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('update-available', (info) => {
    if (process.platform !== 'darwin') return;
    dialog.showMessageBox({
      type: 'info',
      buttons: ['Descargar', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
      title: 'Hay una versión nueva',
      message: `Hay una versión nueva del editor (${info.version}).`,
      detail: 'Descárgala y reemplaza la app actual en Aplicaciones.',
    }).then(({ response }) => {
      if (response === 0) shell.openExternal(RELEASES_URL);
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type: 'info',
      buttons: ['Reiniciar ahora', 'Después'],
      defaultId: 0,
      cancelId: 1,
      title: 'Actualización lista',
      message: `La versión ${info.version} ya está descargada.`,
      detail: 'Reinicia el editor para usarla. Tus proyectos se conservan.',
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  // Un error de actualización nunca debe impedir usar el editor.
  autoUpdater.on('error', () => {});

  autoUpdater.checkForUpdates().catch(() => {});
}

module.exports = { setupUpdates };
