'use strict';

// Aplicación de escritorio: arranca el servidor dentro de la app y muestra el editor
// en una ventana propia, sin terminal ni navegador.

const path = require('node:path');
const { app, BrowserWindow, dialog, shell, Menu } = require('electron');

// Los binarios de FFmpeg viven fuera del .asar para poder ejecutarse.
function binaryPath(modulePath) {
  return modulePath && modulePath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

function configureEnvironment() {
  // Datos del usuario (proyectos, medios, exportaciones) en la carpeta de datos de la app.
  process.env.VE_DATA_DIR = path.join(app.getPath('userData'), 'data');
  try {
    process.env.FFMPEG_PATH = binaryPath(require('ffmpeg-static'));
    process.env.FFPROBE_PATH = binaryPath(require('ffprobe-static').path);
    process.env.VE_FONT_PATH = binaryPath(path.join(__dirname, '..', 'assets', 'fonts', 'Inter-Bold.otf'));
  } catch (_) {
    // Sin binarios empaquetados se usa el FFmpeg del sistema.
  }
}

let mainWindow = null;
let serverUrl = null;

async function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Editor de video',
    backgroundColor: '#0b0c11',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Los enlaces externos se abren en el navegador, no dentro de la app.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: 'deny' };
  });
  await mainWindow.loadURL(url);
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function boot() {
  try {
    if (!serverUrl) {
      configureEnvironment();
      const { start } = require('../server');
      // Puerto libre elegido por el sistema: evita conflictos con otras apps.
      serverUrl = await start({ port: 0, host: '127.0.0.1' });
    }
    await createWindow(serverUrl);
  } catch (err) {
    dialog.showErrorBox('No se pudo iniciar el editor', String(err && err.message || err));
    app.quit();
  }
}

// Una sola instancia: si se abre de nuevo, se enfoca la ventana existente.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    boot();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && serverUrl) createWindow(serverUrl);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
