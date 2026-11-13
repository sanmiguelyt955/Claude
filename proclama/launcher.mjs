#!/usr/bin/env node
// Arranque como app de escritorio: inicia el servidor (si no está ya en marcha) y abre Proclama en una ventana
// propia, sin pestañas ni barra de direcciones. Los datos van a la carpeta del usuario, fuera de la instalación.
// Lo usa el acceso directo que crea el instalador de Windows; también sirve a mano: node launcher.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const home = os.homedir();
const dataDir = process.env.PROCLAMA_DATA || (process.platform === 'win32'
  ? path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Proclama')
  : process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'Proclama')
    : path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'proclama'));
fs.mkdirSync(dataDir, { recursive: true });
process.env.PROCLAMA_DATA = dataDir;
process.env.PROCLAMA_AUTO_EXIT ??= '1'; // se cierra solo cuando ya no queda ninguna ventana abierta

// Sin consola a la vista: lo que se imprima queda en un archivo para poder diagnosticar.
const logFile = path.join(dataDir, 'proclama.log');
try { if (fs.statSync(logFile).size > 512 * 1024) fs.renameSync(logFile, logFile + '.1'); } catch { /* aún no existe */ }
const log = (...a) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${a.map(x => (x instanceof Error ? x.stack : String(x))).join(' ')}\n`); } catch { /* disco lleno o sin permiso */ } };
console.log = log; console.error = log; console.warn = log;
process.on('uncaughtException', (e) => { log('ERROR', e); process.exit(1); });

const isProclama = async (port) => {
  try { return (await (await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(1200) })).json()).name === 'Proclama'; }
  catch { return false; }
};
const isFree = (port) => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true))).listen(port, '0.0.0.0');
});

function openWindow(url) {
  const run = (cmd, args) => { try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', (e) => log('No se pudo abrir', cmd, e.message)).unref(); return true; } catch { return false; } };
  const appArgs = [`--app=${url}`, '--window-size=1400,860'];
  if (process.platform === 'win32') {
    const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    const browsers = ['Microsoft\\Edge\\Application\\msedge.exe', 'Google\\Chrome\\Application\\chrome.exe', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'];
    for (const b of browsers) for (const r of roots) { const exe = path.join(r, b); if (fs.existsSync(exe)) return run(exe, appArgs); }
    return run('cmd', ['/c', 'start', '', url]); // navegador predeterminado
  }
  if (process.platform === 'darwin') {
    for (const app of ['Google Chrome', 'Microsoft Edge', 'Brave Browser']) if (fs.existsSync(`/Applications/${app}.app`)) return run('open', ['-na', app, '--args', ...appArgs]);
    return run('open', [url]);
  }
  for (const b of ['chromium', 'chromium-browser', 'google-chrome', 'microsoft-edge', 'brave-browser']) {
    if ((process.env.PATH || '').split(':').some(d => fs.existsSync(path.join(d, b)))) return run(b, appArgs);
  }
  return run('xdg-open', [url]);
}

const first = Number(process.env.PORT) || 7700;
let port = 0;
for (let p = first; p < first + 10 && !port; p++) {
  if (await isProclama(p)) { // ya está abierta: solo se muestra otra ventana
    if (!process.env.PROCLAMA_NO_WINDOW) openWindow(`http://localhost:${p}/`);
    process.exit(0);
  }
  if (await isFree(p)) port = p;
}
if (!port) { log('No hay un puerto libre entre', first, 'y', first + 9); process.exit(1); }
process.env.PORT = String(port);
await import('./server.js');
// Tras una actualización el servidor se reinicia solo y las ventanas ya abiertas se recargan: no hace falta otra.
if (!process.env.PROCLAMA_RESTARTED && !process.env.PROCLAMA_NO_WINDOW) {
  for (let i = 0; i < 40 && !(await isProclama(port)); i++) await new Promise(r => setTimeout(r, 150));
  openWindow(`http://localhost:${port}/`);
}
