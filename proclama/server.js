#!/usr/bin/env node
// Proclama — servidor local sin dependencias (solo Node 22+).
// Sirve la app, guarda la biblioteca en data/, sincroniza todas las pantallas por SSE
// y expone una API de control remoto (estilo Holyrics) para Stream Deck / Companion / scripts.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { APP_NAME, VERSION, defaultDb, defaultLive, liveReducer, songToPresentation, textToPresentation, mediaToPresentation, norm, uid } from './public/shared/model.js';
import { parseReference, bibleToPresentation } from './public/shared/bible.js';
import { importEasyWorship } from './lib/easyworship.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.resolve(process.env.PROCLAMA_DATA || path.join(ROOT, 'data'));
const MEDIA = path.join(DATA, 'media');
const DB_FILE = path.join(DATA, 'db.json');
const PORT = Number(process.env.PORT || process.argv[2] || 7700);
const TOKEN = process.env.PROCLAMA_TOKEN || '';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.m4v': 'video/mp4', '.ogv': 'video/ogg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const MEDIA_KINDS = { image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg'], video: ['.mp4', '.webm', '.mov', '.m4v', '.ogv'] };
const PAGES = { '/': 'index.html', '/output': 'output.html', '/stage': 'stage.html', '/remote': 'remote.html', '/obs': 'output.html' };

fs.mkdirSync(MEDIA, { recursive: true });

let db = defaultDb();
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  db.settings = { ...defaultDb().settings, ...db.settings };
} catch { /* primera ejecución */ }
let live = defaultLive();

let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const tmp = DB_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(db));
    await fsp.rename(tmp, DB_FILE);
  }, 200);
}

// ---------- SSE ----------
const clients = new Set();
function broadcast(type, data, origin = 'server') {
  const msg = `data: ${JSON.stringify({ type, data, origin })}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();

// ---------- utilidades ----------
const send = (res, code, body, headers = {}) => {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isObj ? MIME['.json'] : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
};

function readBody(req, limit = 1024 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

const bibles = new Map();
async function loadBible(id) {
  const safe = String(id || db.settings.bibleVersion).replace(/[^a-z0-9_-]/gi, '');
  if (!bibles.has(safe)) bibles.set(safe, JSON.parse(await fsp.readFile(path.join(PUBLIC, 'bibles', safe + '.json'), 'utf8')));
  return bibles.get(safe);
}

async function serveFile(req, res, file) {
  let stat;
  try { stat = await fsp.stat(file); } catch { return send(res, 404, 'No encontrado'); }
  if (!stat.isFile()) return send(res, 404, 'No encontrado');
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': file.startsWith(MEDIA) || file.includes(`${path.sep}bibles${path.sep}`) ? 'max-age=3600' : 'no-cache' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) { // necesario para adelantar/retroceder videos
    let start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) return send(res, 416, 'Rango inválido', { 'Content-Range': `bytes */${stat.size}` });
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function setLive(next, origin) {
  live = next;
  broadcast('live', live, origin);
}

// ---------- API de acciones (control remoto / automatización) ----------
async function runAction(name, p) {
  const bool = (v) => (v === undefined || v === '' ? undefined : !['0', 'false', 'off', 'no'].includes(String(v).toLowerCase()));
  switch (name) {
    case 'next': case 'prev': case 'close':
      setLive(liveReducer(live, { type: name }), 'api'); break;
    case 'goto': setLive(liveReducer(live, { type: 'goto', index: Number(p.index) || 0 }), 'api'); break;
    case 'black': case 'clear': setLive(liveReducer(live, { type: name, value: bool(p.value) }), 'api'); break;
    case 'logo':
      setLive(liveReducer(live, { type: 'logo', value: bool(p.value), src: db.settings.logoSrc, text: db.settings.churchName }), 'api'); break;
    case 'alert': setLive(liveReducer(live, { type: 'alert', text: p.text, value: p.text ? true : bool(p.value) ?? false }), 'api'); break;
    case 'countdown':
      setLive(liveReducer(live, { type: 'countdown', seconds: Number(p.seconds) || Number(p.minutes) * 60 || 0, label: p.label }), 'api'); break;
    case 'stage': setLive(liveReducer(live, { type: 'stage', text: p.text ?? '' }), 'api'); break;
    case 'show-song': {
      const q = norm(p.title ?? '');
      const song = db.songs.find(s => s.id === p.id) ?? (q && (db.songs.find(s => norm(s.title) === q) ?? db.songs.find(s => norm(s.title).includes(q))));
      if (!song) throw new Error('Canción no encontrada');
      setLive(liveReducer(live, { type: 'show', pres: songToPresentation(song, db), index: Number(p.index) || 0 }), 'api'); break;
    }
    case 'show-verse': {
      const bible = await loadBible(p.version);
      const ref = parseReference(p.ref, bible);
      if (!ref) throw new Error('Referencia no válida: ' + p.ref);
      setLive(liveReducer(live, { type: 'show', pres: bibleToPresentation(bible, ref, db), index: 0 }), 'api'); break;
    }
    case 'show-text':
      setLive(liveReducer(live, { type: 'show', pres: textToPresentation(p.title, p.text, db), index: 0 }), 'api'); break;
    case 'show-media': {
      const m = db.media.find(x => x.id === p.id || x.name === p.name);
      if (!m) throw new Error('Medio no encontrado');
      setLive(liveReducer(live, { type: 'show', pres: mediaToPresentation(m, db), index: 0 }), 'api'); break;
    }
    case 'status': break;
    default: throw new Error('Acción desconocida: ' + name);
  }
  return {
    ok: true, title: live.pres?.title ?? null, index: live.index, total: live.pres?.slides.length ?? 0,
    text: live.pres?.slides[live.index]?.text ?? '', black: live.black, clear: live.clear, logo: live.logo.on,
  };
}

async function api(req, res, url) {
  const p = url.pathname;
  if (TOKEN && !isLocal(req) && url.searchParams.get('token') !== TOKEN && req.headers['x-proclama-token'] !== TOKEN) {
    return send(res, 401, { error: 'Token requerido' });
  }
  if (p === '/api/ping') return send(res, 200, { ok: true, name: APP_NAME, version: VERSION });
  if (p === '/api/info') return send(res, 200, { name: APP_NAME, version: VERSION, port: PORT, urls: lanUrls(), token: !!TOKEN });
  if (p === '/api/state') return send(res, 200, { db, live });

  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`data: ${JSON.stringify({ type: 'hello', data: { db, live }, origin: 'server' })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (p === '/api/live' && req.method === 'PUT') {
    const body = JSON.parse(await readBody(req, 50e6));
    setLive({ ...defaultLive(), ...body.live }, body.origin);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/db' && req.method === 'PUT') {
    const body = JSON.parse(await readBody(req, 200e6));
    if (!body.db || !Array.isArray(body.db.songs) || !Array.isArray(body.db.themes)) return send(res, 400, { error: 'Datos inválidos' });
    db = body.db;
    saveDb();
    broadcast('db', db, body.origin);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/media' && req.method === 'POST') {
    const original = path.basename(url.searchParams.get('name') || 'archivo');
    const ext = path.extname(original).toLowerCase();
    const kind = Object.keys(MEDIA_KINDS).find(k => MEDIA_KINDS[k].includes(ext));
    if (!kind) return send(res, 415, { error: 'Tipo de archivo no admitido: ' + ext });
    const id = uid();
    const file = id + ext;
    await fsp.writeFile(path.join(MEDIA, file), await readBody(req));
    const item = { id, name: original.replace(/\.[^.]+$/, ''), kind, src: '/media/' + file };
    db.media = [...db.media, item];
    saveDb();
    broadcast('db', db);
    return send(res, 200, item);
  }

  if (p.startsWith('/api/media/') && req.method === 'DELETE') {
    const id = decodeURIComponent(p.slice('/api/media/'.length));
    const item = db.media.find(m => m.id === id);
    if (!item) return send(res, 404, { error: 'No existe' });
    await fsp.rm(path.join(MEDIA, path.basename(item.src)), { force: true });
    db.media = db.media.filter(m => m.id !== id);
    saveDb();
    broadcast('db', db);
    return send(res, 200, { ok: true });
  }

  if (p === '/api/import/easyworship' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req, 600e6));
    const songs = await importEasyWorship(Buffer.from(body.songs, 'base64'), Buffer.from(body.words, 'base64'));
    return send(res, 200, { songs });
  }

  if (p.startsWith('/api/action/')) {
    const params = Object.fromEntries(url.searchParams);
    if (req.method === 'POST') {
      const raw = (await readBody(req, 5e6)).toString('utf8');
      if (raw.trim()) Object.assign(params, JSON.parse(raw));
    }
    try { return send(res, 200, await runAction(p.slice('/api/action/'.length), params)); }
    catch (e) { return send(res, 400, { ok: false, error: e.message }); }
  }

  return send(res, 404, { error: 'No encontrado' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Proclama-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') return send(res, 204, '');
      return await api(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido');
    let rel = decodeURIComponent(url.pathname);
    if (PAGES[rel]) rel = '/' + PAGES[rel];
    const base = rel.startsWith('/media/') ? MEDIA : PUBLIC;
    const file = path.join(base, rel.startsWith('/media/') ? rel.slice('/media/'.length) : rel);
    if (file !== base && !file.startsWith(base + path.sep)) return send(res, 403, 'Prohibido');
    return await serveFile(req, res, file);
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: e.message });
    else res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const local = `http://localhost:${PORT}`;
  console.log(`\n  ${APP_NAME} ${VERSION}\n`);
  console.log(`  Panel del operador:   ${local}/`);
  console.log(`  Proyector:            ${local}/output`);
  console.log(`  Pantalla de escenario:${local}/stage`);
  console.log(`  OBS (tercio inferior):${local}/obs?mode=lower`);
  console.log(`  Control remoto:       ${(lanUrls()[0] ?? local)}/remote${TOKEN ? '?token=…' : ''}`);
  console.log(`\n  Datos en: ${DATA}\n`);
});

export { server };
