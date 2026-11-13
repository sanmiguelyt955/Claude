// Actualizaciones: compara la versión instalada con la publicada (release.json) y descarga solo los archivos que cambiaron.
// La fuente es una carpeta servida por HTTPS (por defecto, la carpeta proclama/ de la rama principal en GitHub).
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const SKIP_DIRS = new Set(['data', 'node_modules', 'docs', 'test', '.git']);
const SKIP_FILES = new Set(['release.json']);

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Compara versiones tipo 1.2.3. Devuelve >0 si a es más nueva que b. */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Lista de archivos de la app con su huella (para publicar una versión). */
export async function listFiles(root) {
  const out = {};
  async function walk(dir, rel) {
    for (const e of (await fsp.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (!(rel === '' && SKIP_DIRS.has(e.name))) await walk(path.join(dir, e.name), r); }
      else if (e.isFile() && !(rel === '' && SKIP_FILES.has(e.name))) {
        const buf = await fsp.readFile(path.join(dir, e.name));
        out[r] = { sha256: sha256(buf), size: buf.length };
      }
    }
  }
  await walk(root, '');
  return out;
}

const safePath = (p) => typeof p === 'string' && p.length < 300 && !p.startsWith('/') && !p.includes('\\') && !p.split('/').some(s => s === '..' || s === '' || s === '.')
  && !SKIP_DIRS.has(p.split('/')[0]);

async function get(url, ms = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store', headers: { 'User-Agent': 'proclama-updater' } });
  if (!res.ok) throw new Error(`No se pudo descargar (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchManifest(url) {
  const m = JSON.parse((await get(url + 'release.json')).toString('utf8'));
  if (!m || typeof m.version !== 'string' || typeof m.files !== 'object') throw new Error('El archivo de versión no es válido');
  return m;
}

/** @returns {{ current, latest, available, notes, date, error? }} */
export async function checkUpdate({ url, current }) {
  if (!url) return { current, latest: current, available: false, notes: [], disabled: true };
  try {
    const m = await fetchManifest(url);
    return { current, latest: m.version, available: compareVersions(m.version, current) > 0, notes: Array.isArray(m.notes) ? m.notes.slice(0, 20).map(String) : [], date: m.date ?? '' };
  } catch (e) {
    return { current, latest: current, available: false, notes: [], error: e.name === 'TimeoutError' ? 'Sin conexión a internet' : e.message };
  }
}

/**
 * Descarga a una carpeta temporal, comprueba cada archivo y solo entonces reemplaza. Guarda copia de lo anterior en data/backup/.
 * @returns {{ version, changed: string[], restart: boolean }}
 */
export async function applyUpdate({ root, url, dataDir, current, onProgress }) {
  const m = await fetchManifest(url);
  if (compareVersions(m.version, current) <= 0) return { version: current, changed: [], restart: false };
  const stage = path.join(dataDir, 'update-tmp');
  await fsp.rm(stage, { recursive: true, force: true });
  const changed = [];
  for (const [rel, info] of Object.entries(m.files)) {
    if (!safePath(rel) || !/^[0-9a-f]{64}$/.test(info?.sha256 ?? '')) throw new Error('La actualización trae una ruta no permitida: ' + rel);
    let local = '';
    try { local = sha256(await fsp.readFile(path.join(root, rel))); } catch { /* archivo nuevo */ }
    if (local !== info.sha256) changed.push(rel);
  }
  let done = 0;
  for (const rel of changed) {
    const buf = await get(url + rel.split('/').map(encodeURIComponent).join('/'), 120000);
    if (sha256(buf) !== m.files[rel].sha256) throw new Error('Un archivo llegó dañado: ' + rel + '. No se cambió nada; inténtalo otra vez.');
    const dest = path.join(stage, rel);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(dest, buf);
    onProgress?.(++done, changed.length);
  }
  const backup = path.join(dataDir, 'backup', current);
  for (const rel of changed) {
    const target = path.join(root, rel);
    if (fs.existsSync(target)) { await fsp.mkdir(path.dirname(path.join(backup, rel)), { recursive: true }); await fsp.copyFile(target, path.join(backup, rel)); }
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(path.join(stage, rel), target);
  }
  await fsp.writeFile(path.join(root, 'release.json'), JSON.stringify(m, null, 1));
  await fsp.rm(stage, { recursive: true, force: true });
  return { version: m.version, changed, restart: changed.some(r => !r.startsWith('public/')) };
}
