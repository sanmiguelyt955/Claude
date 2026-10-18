// API HTTP. Imita el contrato observado en el análisis:
// cotizar (/job-sets/costs) → subir (/media/batch + PUT + /media/:id/upload) → lanzar (/jobs/v2/:jobType) → sondear.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { listModels, httpError } = require('./catalog');

const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg',
};

function createApp({ store, jobs, provider, apiToken = '', maxUploadMb = 100 }) {
  const app = express();
  const { db } = store;

  app.get('/health', (req, res) => res.json({ ok: true, provider: provider.name }));
  // Las subidas también se sirven: los proveedores remotos las leen vía PUBLIC_BASE_URL.
  app.use('/files', express.static(store.filesDir, { maxAge: '7d', fallthrough: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const api = express.Router();
  api.use((req, res, next) => {
    if (!apiToken) return next();
    const header = req.get('authorization') || '';
    const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
    const expected = Buffer.from(apiToken);
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return next();
    res.status(401).json({ detail: 'Token no válido' });
  });

  api.get('/user', (req, res) => res.json({ id: db.user.id, credits: db.user.credits, provider: provider.name }));

  api.get('/models', (req, res) => res.json({ items: listModels(provider.name) }));
  api.get('/models/:id', (req, res) => {
    const m = listModels(provider.name).find((x) => x.id === req.params.id);
    if (!m) throw httpError(404, 'Modelo no encontrado');
    res.json(m);
  });

  api.post('/job-sets/costs', express.json(), (req, res) => {
    const { job_type: jobType, params } = req.body || {};
    res.json(jobs.estimate(jobType, unwrap(params)));
  });

  api.post('/jobs/v2/:jobType', express.json({ limit: '1mb' }), (req, res) => {
    res.status(201).json(jobs.create(req.params.jobType, unwrap(req.body)));
  });
  api.get('/jobs', (req, res) => {
    res.json(jobs.list({ limit: Math.min(Number(req.query.limit) || 30, 100), cursor: req.query.cursor, type: req.query.type }));
  });
  api.post('/jobs/status-batch', express.json(), (req, res) => {
    res.json({ items: jobs.statusBatch(Array.isArray(req.body?.ids) ? req.body.ids : []) });
  });
  api.get('/jobs/:id', (req, res) => res.json(jobs.get(req.params.id)));
  api.post('/jobs/:id/cancel', (req, res) => res.json(jobs.cancel(req.params.id)));

  api.post('/media/batch', express.json(), (req, res) => {
    const mimetypes = req.body?.mimetypes;
    if (!Array.isArray(mimetypes) || !mimetypes.length || mimetypes.length > 10) throw httpError(400, 'mimetypes: lista de 1 a 10');
    const items = mimetypes.map((mimetype) => {
      const ext = MIME_EXT[mimetype];
      if (!ext) throw httpError(415, `Tipo no admitido: ${mimetype}`);
      const id = crypto.randomUUID();
      db.media[id] = { id, mimetype, filename: `${id}.${ext}`, status: 'created', created_at: new Date().toISOString() };
      return { id, upload_url: `/api/media/${id}/blob` };
    });
    store.save();
    res.status(201).json(items);
  });

  api.put('/media/:id/blob', (req, res, next) => {
    const media = db.media[req.params.id];
    if (!media || media.status !== 'created') return next(httpError(404, 'Media no encontrada o ya subida'));
    const limit = maxUploadMb * 1024 * 1024;
    const dest = path.join(store.filesDir, media.filename);
    const out = fs.createWriteStream(dest);
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.unpipe(out);
        out.destroy();
        fs.rm(dest, { force: true }, () => {});
        if (!res.headersSent) res.status(413).json({ detail: `Máximo ${maxUploadMb} MB` });
        req.destroy();
      }
    });
    req.pipe(out);
    out.on('finish', () => {
      if (res.headersSent) return;
      media.size = size;
      store.save();
      res.status(204).end();
    });
    out.on('error', next);
  });

  api.post('/media/:id/upload', (req, res) => {
    const media = db.media[req.params.id];
    if (!media) throw httpError(404, 'Media no encontrada');
    if (!media.size || !fs.existsSync(path.join(store.filesDir, media.filename))) throw httpError(409, 'Falta subir el archivo');
    media.status = 'uploaded';
    store.save();
    res.json({ id: media.id, url: `/files/${media.filename}`, mimetype: media.mimetype });
  });

  app.use('/api', api);

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ detail: status >= 500 ? 'Error interno' : err.message });
  });

  return app;
}

// Acepta tanto { params: {...} } (como el cliente original) como el objeto plano.
function unwrap(body) {
  if (body && typeof body.params === 'object' && body.params !== null) return body.params;
  return body || {};
}

module.exports = { createApp };
