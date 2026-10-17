'use strict';

// Servidor sin dependencias externas: sirve la app, recibe medios, los analiza con ffprobe,
// guarda proyectos y renderiza con ffmpeg.

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { buildFfmpegArgs } = require('./lib/export');
const { normalizeProject } = require('./lib/model');

const execFileP = promisify(execFile);

// Rutas de FFmpeg: la app de escritorio puede traer sus propios binarios.
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
// Fuente incluida para los textos (la app de escritorio la ubica fuera del .asar).
const FONT_FILE = process.env.VE_FONT_PATH || path.join(ROOT, 'assets', 'fonts', 'Inter-Bold.otf');
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.VE_DATA_DIR || path.join(ROOT, 'data');
const FILES = path.join(DATA, 'files');
const META = path.join(DATA, 'media');
const EXPORTS = path.join(DATA, 'exports');
const PROJECTS = path.join(DATA, 'projects');
const MAX_UPLOAD = 2 * 1024 ** 3; // 2 GB
const MAX_JSON = 4 * 1024 * 1024;

for (const dir of [FILES, META, EXPORTS, PROJECTS]) fs.mkdirSync(dir, { recursive: true });

const KINDS = {
  '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.mkv': 'video', '.m4v': 'video',
  '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.aac': 'audio', '.ogg': 'audio',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.m4v': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

const SAFE_ID = /^[0-9a-f-]{36}$/;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function readJson(req, limit = MAX_JSON) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(httpError(413, 'Cuerpo demasiado grande'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(httpError(400, 'JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

async function probe(file) {
  const { stdout } = await execFileP(FFPROBE, [
    '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file,
  ]);
  const info = JSON.parse(stdout);
  const video = info.streams.find((s) => s.codec_type === 'video');
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  return {
    duration: Number(info.format.duration) || 0,
    width: video ? video.width : 0,
    height: video ? video.height : 0,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
  };
}

function loadMedia(id) {
  if (!SAFE_ID.test(id)) return null;
  const metaPath = path.join(META, `${id}.json`);
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

function allMedia() {
  return fs.readdirSync(META)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(META, f), 'utf8')));
}

// Solo se expone lo necesario al navegador: nunca rutas del disco.
function publicMedia(m) {
  return {
    id: m.id, name: m.name, type: m.type, duration: m.duration,
    width: m.width, height: m.height, hasAudio: m.hasAudio,
    url: `/media/${m.id}`,
  };
}

function mediaLookup() {
  const map = new Map(allMedia().map((m) => [m.id, m]));
  return (id) => {
    const m = map.get(id);
    if (!m) return null;
    return { id: m.id, duration: m.duration, type: m.type };
  };
}

async function handleUpload(req, res, url) {
  const name = path.basename(url.searchParams.get('name') || 'archivo');
  const ext = path.extname(name).toLowerCase();
  const type = KINDS[ext];
  if (!type) return sendError(res, 415, `Formato no soportado: ${ext || 'sin extensión'}`);

  const id = crypto.randomUUID();
  const filePath = path.join(FILES, `${id}${ext}`);
  let size = 0;
  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(filePath);
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_UPLOAD) req.destroy(new Error('Archivo demasiado grande'));
      });
      req.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
      req.on('error', reject);
    });
    const info = await probe(filePath);
    if (type === 'video' && !info.hasVideo) throw httpError(400, 'El archivo no tiene video');
    if (type === 'audio' && !info.hasAudio) throw httpError(400, 'El archivo no tiene audio');
    const media = {
      id, name, ext, type, path: filePath, size,
      duration: type === 'image' ? 0 : info.duration,
      width: info.width, height: info.height,
      hasAudio: info.hasAudio,
    };
    fs.writeFileSync(path.join(META, `${id}.json`), JSON.stringify(media, null, 2));
    sendJson(res, 201, publicMedia(media));
  } catch (err) {
    fs.rmSync(filePath, { force: true });
    sendError(res, err.status || 400, err.message);
  }
}

function handleListMedia(res) {
  const items = allMedia().map(publicMedia).sort((a, b) => a.name.localeCompare(b.name));
  sendJson(res, 200, items);
}

function handleDeleteMedia(res, id) {
  const m = loadMedia(id);
  if (!m) return sendError(res, 404, 'Medio no encontrado');
  fs.rmSync(m.path, { force: true });
  fs.rmSync(path.join(META, `${id}.json`), { force: true });
  sendJson(res, 200, { ok: true });
}

// Sirve el archivo con Range para que el reproductor pueda buscar posiciones.
function handleMedia(req, res, id) {
  const m = loadMedia(id);
  if (!m) return sendError(res, 404, 'Medio no encontrado');
  const stat = fs.statSync(m.path);
  const type = MIME[m.ext] || 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    let start;
    let end;
    if (!match[1]) { // rango de sufijo: últimos N bytes
      start = Math.max(0, stat.size - Number(match[2]));
      end = stat.size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : stat.size - 1;
    }
    if (start > end || end >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
    });
    return fs.createReadStream(m.path, { start, end }).pipe(res);
  }

  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(m.path).pipe(res);
}

// ---------- proyectos ----------

function projectFile(id) {
  if (!SAFE_ID.test(id)) return null;
  return path.join(PROJECTS, `${id}.json`);
}

function listProjects() {
  return fs.readdirSync(PROJECTS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(PROJECTS, f), 'utf8')))
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, ratio: p.ratio }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

async function handleSaveProject(req, res, id) {
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendError(res, err.status || 400, err.message);
  }
  const existing = id ? projectFile(id) : null;
  const projectId = id || crypto.randomUUID();
  if (id && !existing) return sendError(res, 400, 'Identificador inválido');
  try {
    const project = normalizeProject({ ...body, id: projectId }, mediaLookup());
    project.updatedAt = new Date().toISOString();
    fs.writeFileSync(projectFile(projectId), JSON.stringify(project, null, 2));
    sendJson(res, id ? 200 : 201, project);
  } catch (err) {
    sendError(res, 422, err.message);
  }
}

function handleGetProject(res, id) {
  const file = projectFile(id);
  if (!file || !fs.existsSync(file)) return sendError(res, 404, 'Proyecto no encontrado');
  sendJson(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
}

function handleDeleteProject(res, id) {
  const file = projectFile(id);
  if (!file || !fs.existsSync(file)) return sendError(res, 404, 'Proyecto no encontrado');
  fs.rmSync(file);
  sendJson(res, 200, { ok: true });
}

// ---------- exportación ----------

async function handleExport(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return sendError(res, err.status || 400, err.message);
  }

  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), 've-job-'));
  try {
    const project = normalizeProject(body, mediaLookup());
    const media = {};
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (!clip.mediaId || media[clip.mediaId]) continue;
        const m = loadMedia(clip.mediaId);
        media[clip.mediaId] = { path: m.path, type: m.type, hasAudio: m.hasAudio };
      }
      if (track.kind === 'text') {
        for (const clip of track.clips) {
          // Cada texto va en su propio archivo para evitar problemas de escape en FFmpeg.
          const textFile = path.join(jobDir, `text-${crypto.randomUUID()}.txt`);
          fs.writeFileSync(textFile, clip.text);
          clip.textFile = textFile;
        }
      }
    }

    const outName = `${crypto.randomUUID()}.mp4`;
    const outPath = path.join(EXPORTS, outName);
    const args = buildFfmpegArgs(project, media, outPath, { fontFile: FONT_FILE });

    await new Promise((resolve, reject) => {
      const ff = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args]);
      let stderr = '';
      ff.stderr.on('data', (c) => { stderr += c; });
      ff.on('error', reject);
      ff.on('close', (code) => {
        if (code === 0) return resolve();
        const tail = stderr.trim().split('\n').slice(-3).join(' ');
        reject(new Error(tail || `ffmpeg salió con código ${code}`));
      });
    });

    sendJson(res, 200, { url: `/exports/${outName}` });
  } catch (err) {
    sendError(res, err.status || 422, err.message);
  } finally {
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
}

// ---------- estáticos y enrutado ----------

function serveStatic(res, urlPath, baseDir) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  const file = path.normalize(path.join(baseDir, rel));
  if (!file.startsWith(baseDir + path.sep)) return sendError(res, 403, 'Prohibido');
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return sendError(res, 404, 'No encontrado');
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  try {
    if (req.method === 'POST' && p === '/api/upload') return await handleUpload(req, res, url);
    if (req.method === 'GET' && p === '/api/media') return handleListMedia(res);
    if (req.method === 'DELETE' && p.startsWith('/api/media/')) {
      return handleDeleteMedia(res, p.slice('/api/media/'.length));
    }
    if (req.method === 'POST' && p === '/api/export') return await handleExport(req, res);
    if (req.method === 'GET' && p === '/api/projects') return sendJson(res, 200, listProjects());
    if (req.method === 'POST' && p === '/api/projects') return await handleSaveProject(req, res, null);
    if (p.startsWith('/api/projects/')) {
      const id = p.slice('/api/projects/'.length);
      if (req.method === 'GET') return handleGetProject(res, id);
      if (req.method === 'PUT') return await handleSaveProject(req, res, id);
      if (req.method === 'DELETE') return handleDeleteProject(res, id);
    }
    if (req.method === 'GET' && p.startsWith('/media/')) {
      return handleMedia(req, res, p.slice('/media/'.length));
    }
    if (req.method === 'GET' && p.startsWith('/exports/')) {
      const name = path.basename(p.slice('/exports/'.length));
      const file = path.join(EXPORTS, name);
      if (!fs.existsSync(file)) return sendError(res, 404, 'No encontrado');
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${name}"`,
      });
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'GET' && p === '/lib/model.js') {
      return serveStatic(res, '/model.js', path.join(ROOT, 'lib'));
    }
    if (req.method === 'GET') return serveStatic(res, p, PUBLIC);
    sendError(res, 405, 'Método no permitido');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendError(res, err.status || 500, err.status ? err.message : 'Error interno');
  }
});

// Arranca el servidor y devuelve la URL. Con port 0 el sistema elige un puerto libre.
function start({ port = PORT, host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const { port: actual } = server.address();
      resolve(`http://${host}:${actual}`);
    });
  });
}

if (require.main === module) {
  start({ host: '0.0.0.0' }).then((url) => console.log(`Editor de video en ${url}`));
}

module.exports = { server, start };
