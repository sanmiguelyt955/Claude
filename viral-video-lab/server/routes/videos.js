const express = require('express');
const fs = require('fs');
const path = require('path');
const Busboy = require('busboy');
const store = require('../lib/store');
const ffmpeg = require('../lib/ffmpeg');

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v']);

function isVideoFile(name) {
  return VIDEO_EXT.has(path.extname(name).toLowerCase());
}

function scanFolder(rootFolder, maxDepth = 3) {
  const found = [];
  function walk(dir, depth) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < maxDepth) walk(full, depth + 1);
      else if (entry.isFile() && isVideoFile(entry.name)) found.push(full);
    }
  }
  walk(rootFolder, 0);
  return found;
}

const CATEGORIES = new Set(['viral', 'aprendizaje']);
function normalizeCategory(c) {
  return CATEGORIES.has(c) ? c : 'viral';
}

function registerPath(absPath, category) {
  const stat = fs.statSync(absPath);
  const id = store.idForPath(absPath);
  const existing = store.getVideo(id);
  const video = {
    id,
    path: absPath,
    filename: path.basename(absPath),
    sizeBytes: stat.size,
    addedAt: existing?.addedAt || Date.now(),
    source: existing?.source || 'scan',
    category: normalizeCategory(category || existing?.category),
  };
  return store.upsertVideo(video);
}

module.exports = function buildVideosRouter({ defaultFolders }) {
  const router = express.Router();

  router.get('/config', (req, res) => {
    res.json({ defaultFolders });
  });

  router.get('/videos', (req, res) => {
    const videos = store.readVideos().map((v) => ({ ...v, status: store.getVideoStatus(v.id) }));
    res.json(videos);
  });

  router.post('/videos/scan', (req, res) => {
    const category = normalizeCategory(req.body?.category);
    const folder = req.body?.folder || (defaultFolders[category] || [])[0];
    if (!folder || !fs.existsSync(folder)) {
      return res.status(400).json({
        error: folder
          ? `La carpeta no existe: ${folder}`
          : `No hay carpeta por defecto configurada para "${category}". Pega una ruta de carpeta, o agrega/arrastra videos uno por uno.`,
      });
    }
    const files = scanFolder(folder);
    const registered = files.map((f) => registerPath(f, category));
    res.json({ folder, found: registered.length, videos: registered });
  });

  router.post('/videos/register', (req, res) => {
    const p = req.body?.path;
    const category = normalizeCategory(req.body?.category);
    if (!p || !fs.existsSync(p)) {
      return res.status(400).json({ error: `La ruta no existe: ${p}` });
    }
    if (!isVideoFile(p)) {
      return res.status(400).json({ error: 'La extensión del archivo no parece ser un video soportado.' });
    }
    res.json(registerPath(p, category));
  });

  // Streamed upload: busboy pipes each chunk straight to a file write stream as it
  // arrives off the wire. Nothing about the video is ever buffered in memory, and
  // no body-size limit is configured, so multi-GB / multi-hour files upload the same
  // way a 1MB clip does - this is what removes the size ceiling for real.
  router.post('/videos/upload', (req, res) => {
    const category = normalizeCategory(req.query.category);
    const bb = Busboy({ headers: req.headers });
    let handled = false;

    bb.on('file', (fieldname, fileStream, info) => {
      const safeName = `${Date.now()}-${info.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const destPath = path.join(store.UPLOADS_DIR, safeName);
      const writeStream = fs.createWriteStream(destPath);
      fileStream.pipe(writeStream);

      writeStream.on('close', () => {
        if (handled) return;
        handled = true;
        const video = registerPath(destPath, category);
        store.upsertVideo({ ...video, source: 'upload' });
        res.json(video);
      });

      writeStream.on('error', (err) => {
        if (handled) return;
        handled = true;
        res.status(500).json({ error: err.message });
      });
    });

    bb.on('error', (err) => {
      if (handled) return;
      handled = true;
      res.status(500).json({ error: err.message });
    });

    req.pipe(bb);
  });

  // Modo B: register a "virtual" video with no file - just a name and a total
  // duration the user provides verbally, so the structure editor / rule engine /
  // pattern matcher work identically whether or not ffmpeg ever touched a real file.
  router.post('/videos/manual', (req, res) => {
    const { nombre, duracion_segundos, category } = req.body || {};
    if (!nombre || !duracion_segundos) {
      return res.status(400).json({ error: 'Se requiere nombre y duracion_segundos.' });
    }
    const id = store.newId();
    const video = {
      id,
      path: null,
      filename: nombre,
      sizeBytes: null,
      addedAt: Date.now(),
      source: 'manual',
      category: normalizeCategory(category),
      probe: { duration: Number(duracion_segundos), width: null, height: null, codec: null, fps: null, hasAudio: null },
    };
    res.json(store.upsertVideo(video));
  });

  router.get('/videos/:id', async (req, res) => {
    const video = store.getVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });
    if (!video.probe) {
      try {
        const probe = await ffmpeg.probe(video.path);
        store.upsertVideo({ id: video.id, probe });
      } catch (err) {
        return res.status(500).json({ error: `No se pudo leer metadata con ffprobe: ${err.message}` });
      }
    }
    res.json(store.getVideo(req.params.id));
  });

  // Range-streamed playback: fs.createReadStream(path, {start,end}) reads only the
  // requested byte window, so scrubbing a multi-hour file never loads it fully.
  router.get('/videos/:id/stream', (req, res) => {
    const video = store.getVideo(req.params.id);
    if (!video) return res.status(404).end();
    let stat;
    try {
      stat = fs.statSync(video.path);
    } catch {
      return res.status(404).json({ error: 'El archivo ya no existe en disco.' });
    }
    const range = req.headers.range;
    const ext = path.extname(video.path).toLowerCase();
    const mime = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.m4v': 'video/x-m4v' }[ext] || 'application/octet-stream';

    if (!range) {
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
      return fs.createReadStream(video.path).pipe(res);
    }

    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : Math.min(start + 5 * 1024 * 1024, stat.size - 1);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': mime,
    });
    fs.createReadStream(video.path, { start, end }).pipe(res);
  });

  router.delete('/videos/:id', (req, res) => {
    const video = store.getVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });
    if (req.query.deleteFile === 'true' && video.path.startsWith(store.UPLOADS_DIR)) {
      try {
        fs.unlinkSync(video.path);
      } catch {
        /* ya no existía */
      }
    }
    store.removeVideo(video.id);
    res.json({ ok: true });
  });

  return router;
};
