// Construye el instalador de Windows: Proclama-Setup-<versión>.exe
// Incluye la app, un Node.js propio (no hace falta instalar nada más) y un lanzador sin ventana de consola.
// Requisitos para construirlo: Node 22+, makensis (NSIS 3) y acceso a nodejs.org la primera vez.
// Uso: node tools/build-installer.mjs [carpeta de salida]      (en Linux: apt install nsis)
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles } from '../lib/update.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const here = path.join(root, 'tools', 'installer');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const outDir = path.resolve(process.argv[2] || path.join(root, '..', 'instaladores'));
const cache = path.join(os.tmpdir(), 'proclama-build-cache');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'proclama-installer-'));
const NODE_LINE = 'latest-v22.x';
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return Buffer.from(await r.arrayBuffer()); };

// 1. La app: los mismos archivos que reparte el actualizador, más release.json.
for (const rel of [...Object.keys(await listFiles(root)), 'release.json']) {
  const dest = path.join(stage, 'app', rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, rel), dest);
}

// 2. Node.js para Windows, comprobado contra la lista oficial de huellas.
const sums = (await get(`https://nodejs.org/dist/${NODE_LINE}/SHASUMS256.txt`)).toString();
const nodeVersion = /node-(v[\d.]+)-win-x64\.zip/.exec(sums)[1];
const want = /^([0-9a-f]{64})\s+win-x64\/node\.exe$/m.exec(sums)[1];
fs.mkdirSync(cache, { recursive: true });
const cached = path.join(cache, `node-${nodeVersion}.exe`);
if (!fs.existsSync(cached) || crypto.createHash('sha256').update(fs.readFileSync(cached)).digest('hex') !== want) {
  const buf = await get(`https://nodejs.org/dist/${nodeVersion}/win-x64/node.exe`);
  if (crypto.createHash('sha256').update(buf).digest('hex') !== want) throw new Error('node.exe no coincide con su huella oficial');
  fs.writeFileSync(cached, buf);
}
fs.mkdirSync(path.join(stage, 'runtime'), { recursive: true });
fs.copyFileSync(cached, path.join(stage, 'runtime', 'node.exe'));
fs.writeFileSync(path.join(stage, 'runtime', 'LICENSE-node.txt'), await get(`https://raw.githubusercontent.com/nodejs/node/${nodeVersion}/LICENSE`));

// 3. Lanzador e instalador.
const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
const nsis = (script, defs) => execFileSync('makensis', ['-V2', ...Object.entries(defs).map(([k, v]) => `-D${k}=${v}`), script], { cwd: here, stdio: 'inherit' });
nsis('launcher.nsi', { VERSION: version, OUT: path.join(stage, 'Proclama.exe') });
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `Proclama-Setup-${version}.exe`);
nsis('installer.nsi', { VERSION: version, OUT: out, STAGE: stage, SIZE_KB: Math.round(size(stage) / 1024) });
fs.rmSync(stage, { recursive: true, force: true });
const buf = fs.readFileSync(out);
console.log(`${out}\n${(buf.length / 1e6).toFixed(1)} MB · Node ${nodeVersion} · SHA-256 ${crypto.createHash('sha256').update(buf).digest('hex')}`);
