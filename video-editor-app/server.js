'use strict';

// Servidor sin dependencias externas: sirve la app, recibe videos, los analiza con ffprobe
// y renderiza proyectos con ffmpeg.

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { buildFfmpegArgs } = require('./lib/export');

const execFileP = promisify(execFile);

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.VE_DATA_DIR || path.join(ROOT, 'data');
const FILES = path.join(DATA, 'files');
const META = path.join(DATA, 'media');
const EXPORTS = path.join(DATA, 'exports');
const MAX_UPLOAD = 2 * 1024 ** 3; // 2 GB
const MAX_JSON = 1024 * 1024;

for (const dir of [FILES, META, EXPORTS]) fs.mkdirSync(dir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readJson(req, limit = MAX_JSON) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function probe(file) {
  const { stdout } = await execFileP('ffprobe', [
    '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file,
  ]);
  const info = JSON.parse(stdout);
  const video = info.streams.find((s) => s.codec_type === 'video');
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  if (!video) throw Object.assign(new Error('El archivo no tiene video'), { status: 400 });
  return {
    duration: Number(info.format.duration) || 0,
    width: video.width,
    height: video.height,
    hasAudio: Boolean(audio),
  };
}

function loadMedia(id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const metaPath = path.join(META, `${id}.json`);
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

async function handleUpload(req, res, url) {
  const name = path.basename(url.searchParams.get('name') || 'video');
  const ext = path.extname(name).toLowerCase();
  if (!MIME[ext]) return sendError(res, 415, `Formato no soportado: ${ext || 'sin extensión'}`);

  const id = crypto.randomUUID();
  const filePath = path.join(FILES, `${id}${ext}`);
  let size = 0;
  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(filePath);
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_UPLOAD) {
          req.destroy(new Error('Archivo demasiado grande'));
        }
      });
      req.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
      req.on('error', reject);
    });
    const info = await probe(filePath);
    const media = { id, name, ext, path: filePath, size, ...info };
    fs.writeFileSync(path.join(META, `${id}.json`), JSON.stringify(media, null, 2));
    sendJson(res, 201, publicMedia(media));
  } catch (err) {
    fs.rmSync(filePath, { force: true });
    sendError(res, err.status || 400, err.message);
  }
}

// Solo se expone lo necesario al navegador: nada de rutas del disco.
function publicMedia(m) {
  return {
    id: m.id, name: m.name, duration: m.duration,
    width: m.width, height: m.height, hasAudio: m.hasAudio,
    url: `/media/${m.id}`,
  };
}

function handleListMedia(res) {
  const items = fs.readdirSync(META)
    .filter((f) => f.endsWith('.json'))
    .map((f) => publicMedia(JSON.parse(fs.readFileSync(path.join(META, f), 'utf8'))))
    .sort((a, b) => a.name.localeCompare(b.name));
  sendJson(res, 200, items);
}

// Sirve el video con soporte de Range para que el reproductor pueda buscar posiciones.
function handleMedia(req, res, id) {
  const m = loadMedia(id);
  if (!m) return sendError(res, 404, 'Medio no encontrado');
  const stat = fs.statSync(m.path);
  const type = MIME[m.ext] || 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    let start = match && match[1] ? Number(match[1]) : 0;
    let end = match && match[2] ? Number(match[2]) : stat.size - 1;
    if (!match || !match[1] && !match[2] || start > end || end >= stat.size) {
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

async function handleExport(req, res) {
  let project;
  try {
    project = await readJson(req);
  } catch (err) {
    return sendError(res, err.status || 400, err.message);
  }

  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), 've-job-'));
  try {
    // Cada texto se guarda en un archivo para evitar problemas de escape en FFmpeg.
    const texts = (project.texts || []).map((t, i) => {
      const textFile = path.join(jobDir, `text${i}.txt`);
      fs.writeFileSync(textFile, String(t.text || '').slice(0, 500));
      return { ...t, textFile };
    });

    const media = {};
    for (const clip of project.clips || []) {
      if (media[clip.mediaId]) continue;
      const m = loadMedia(clip.mediaId);
      if (!m) return sendError(res, 400, `Medio no encontrado: ${clip.mediaId}`);
      media[clip.mediaId] = { path: m.path, hasAudio: m.hasAudio };
    }

    const exportId = crypto.randomUUID();
    const outName = `${exportId}.mp4`;
    const outPath = path.join(EXPORTS, outName);
    const args = buildFfmpegArgs({ ...project, texts }, media, outPath);

    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
      let stderr = '';
      ff.stderr.on('data', (c) => { stderr += c; });
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim().split('\n').slice(-3).join(' ') || `ffmpeg salió con código ${code}`))));
    });

    sendJson(res, 200, { url: `/exports/${outName}` });
  } catch (err) {
    sendError(res, 422, err.message);
  } finally {
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
}

function serveStatic(res, urlPath, baseDir) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const file = path.normalize(path.join(baseDir, rel));
  if (!file.startsWith(baseDir + path.sep)) return sendError(res, 403, 'Prohibido');
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return sendError(res, 404, 'No encontrado');
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/upload') return await handleUpload(req, res, url);
    if (req.method === 'GET' && url.pathname === '/api/media') return handleListMedia(res);
    if (req.method === 'POST' && url.pathname === '/api/export') return await handleExport(req, res);
    if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
      return handleMedia(req, res, url.pathname.slice('/media/'.length));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/exports/')) {
      const name = path.basename(url.pathname.slice('/exports/'.length));
      const file = path.join(EXPORTS, name);
      if (!fs.existsSync(file)) return sendError(res, 404, 'No encontrado');
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${name}"`,
      });
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'GET') return serveStatic(res, url.pathname, PUBLIC);
    sendError(res, 405, 'Método no permitido');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendError(res, 500, 'Error interno');
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Editor de video en http://localhost:${PORT}`));
}

module.exports = { server };
