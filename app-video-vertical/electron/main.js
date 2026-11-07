'use strict';

// Envoltorio de escritorio: arranca el servidor local y lo muestra en una ventana.
const path = require('node:path');
const { app, BrowserWindow, shell, dialog } = require('electron');

// FFmpeg empaquetado (ffmpeg-static) queda dentro de app.asar.unpacked al construir el instalador.
for (const name of ['ffmpeg-static', 'ffprobe-static']) {
  try {
    const mod = require(name);
    const bin = typeof mod === 'string' ? mod : mod.path;
    const env = name === 'ffmpeg-static' ? 'VV_FFMPEG' : 'VV_FFPROBE';
    if (bin && !process.env[env]) process.env[env] = bin.replace('app.asar', 'app.asar.unpacked');
  } catch {
    // sin binario empaquetado: se usa el FFmpeg del sistema
  }
}

const { start } = require('../server');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

async function createWindow() {
  let ctx;
  try {
    ctx = await start({ port: 0 });
  } catch (err) {
    dialog.showErrorBox('Vertiflow no pudo arrancar', err.message);
    app.quit();
    return;
  }
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Vertiflow',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Enlaces externos (descargas de versiones nuevas) en el navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(ctx.url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(ctx.url);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
