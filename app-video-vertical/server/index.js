'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const Busboy = require('busboy');

const pkg = require('../package.json');
const { generate } = require('../src/project');
const { analyzeSong } = require('../src/music');
const viral = require('../src/viral');
const { separate, hasDemucs } = require('../src/separate');
const { lanAddress, newToken, qr, mountShare } = require('../src/share');
const { checkForUpdate } = require('../src/updates');
const { RESOLUTIONS } = require('../src/render');
const { ROLES, VIDEO_EXT, AUDIO_EXT, defaultWorkspace, safeName, uniquePath, openWorkspace } = require('../src/workspace');

// Guarda los archivos subidos en `dir`. Devuelve las rutas guardadas y los campos de texto.
function receiveUpload(req, dir, accept) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(dir, { recursive: true });
    const saved = [];
    const fields = {};
    const pending = [];
    let bb;
    try {
      bb = Busboy({ headers: req.headers, limits: { fileSize: 8 * 1024 * 1024 * 1024 } });
    } catch (err) {
      return reject(err);
    }
    bb.on('field', (k, v) => (fields[k] = v));
    bb.on('file', (_field, stream, info) => {
      const name = safeName(info.filename);
      if (!accept.test(name)) {
        stream.resume();
        return;
      }
      const target = uniquePath(dir, name);
      const out = fs.createWriteStream(target);
      pending.push(
        new Promise((ok, fail) => {
          out.on('finish', ok);
          out.on('error', fail);
          stream.on('limit', () => fail(new Error('Archivo demasiado grande')));
        })
      );
      stream.pipe(out);
      saved.push(target);
    });
    bb.on('error', reject);
    bb.on('close', () => Promise.all(pending).then(() => resolve({ saved, fields }), reject));
    req.pipe(bb);
  });
}

const isLoopback = (addr) => /^(127\.|::1$|::ffff:127\.)/.test(addr || '');

function createApp({ workspace = defaultWorkspace() } = {}) {
  const ws = openWorkspace(workspace);
  const { dirs } = ws;
  const loadSettings = ws.loadSettings;
  const saveSettings = ws.saveSettings;

  const token = newToken();
  const jobs = new Map();
  let generating = null;

  function newJob(kind) {
    const job = { id: crypto.randomUUID(), kind, status: 'en_curso', progress: 0, stage: '', events: [], result: null, error: null, created: Date.now() };
    jobs.set(job.id, job);
    // Se guardan como mucho 50 trabajos.
    if (jobs.size > 50) jobs.delete(jobs.keys().next().value);
    return job;
  }
  const runJob = (job, fn) =>
    fn(job)
      .then((result) => Object.assign(job, { status: 'hecho', progress: 1, result }))
      .catch((err) => Object.assign(job, { status: 'error', error: err.message }));

  const fileUrl = (abs) => `/archivos/${path.relative(workspace, abs).split(path.sep).map(encodeURIComponent).join('/')}`;

  const listClips = () =>
    Object.fromEntries(
      Object.entries(ws.listClips()).map(([r, files]) => [
        r,
        files.map((f) => ({ name: f, url: fileUrl(path.join(dirs.clips, r, f)) })),
      ])
    );

  const listOutputs = () =>
    ws.listOutputs().map((f) => ({
      name: f,
      url: fileUrl(path.join(dirs.out, f)),
      size: fs.statSync(path.join(dirs.out, f)).size,
    }));

  const app = express();
  app.disable('x-powered-by');

  // Solo el propio ordenador usa la app; desde la red solo se abre la página del móvil.
  const shareBase = mountShare(app, { token, getDir: () => dirs.out });
  app.use((req, res, next) => {
    if (isLoopback(req.socket.remoteAddress)) return next();
    res.status(403).send('Acceso solo desde este ordenador.');
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/archivos', express.static(workspace, { dotfiles: 'deny', index: false }));

  app.get('/api/estado', async (req, res) => {
    const settings = loadSettings();
    res.json({
      version: pkg.version,
      workspace,
      roles: ROLES,
      clips: listClips(),
      music: settings.music ? { ...settings.music, url: fs.existsSync(settings.music.path) ? fileUrl(settings.music.path) : null } : null,
      outputs: listOutputs(),
      resolutions: Object.keys(RESOLUTIONS),
      demucs: await hasDemucs(),
      generating: generating ? generating.id : null,
    });
  });

  app.post('/api/clips/:role', async (req, res) => {
    const role = req.params.role;
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rol no válido' });
    try {
      const { saved } = await receiveUpload(req, path.join(dirs.clips, role), VIDEO_EXT);
      res.json({ saved: saved.map((f) => path.basename(f)), clips: listClips() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/clips/:role/:name', (req, res) => {
    const role = req.params.role;
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rol no válido' });
    fs.rmSync(path.join(dirs.clips, role, path.basename(req.params.name)), { force: true });
    res.json({ clips: listClips() });
  });

  app.post('/api/musica', async (req, res) => {
    try {
      const { saved } = await receiveUpload(req, dirs.music, AUDIO_EXT);
      if (!saved.length) return res.status(400).json({ error: 'Sube un archivo de audio (mp3, m4a, wav...).' });
      const file = saved[saved.length - 1];
      const analysis = await analyzeSong(file);
      const settings = loadSettings();
      settings.music = { path: file, name: path.basename(file), drop: analysis.drop, detectedDrop: analysis.drop, duration: analysis.duration, peaks: analysis.peaks, volume: 1 };
      saveSettings(settings);
      res.json({ ...settings.music, url: fileUrl(file) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/musica', (req, res) => {
    const settings = loadSettings();
    if (!settings.music) return res.status(400).json({ error: 'No hay música.' });
    if (req.body.drop !== undefined) {
      const drop = Number(req.body.drop);
      if (!Number.isFinite(drop) || drop < 0 || drop > settings.music.duration) return res.status(400).json({ error: 'Momento no válido.' });
      settings.music.drop = Number(drop.toFixed(2));
    }
    if (req.body.volume !== undefined) settings.music.volume = Math.max(0, Math.min(2, Number(req.body.volume) || 0));
    saveSettings(settings);
    res.json(settings.music);
  });

  app.delete('/api/musica', (req, res) => {
    const settings = loadSettings();
    delete settings.music;
    saveSettings(settings);
    res.json({ ok: true });
  });

  app.post('/api/generar', (req, res) => {
    if (generating && generating.status === 'en_curso') return res.status(409).json({ error: 'Ya se están generando vídeos.', job: generating.id });
    const body = req.body || {};
    const roles = ws.projectRoles();
    if (!Object.keys(roles).length) return res.status(400).json({ error: 'Añade clips antes de generar.' });
    const music = body.useMusic !== false ? ws.musicForGeneration() : undefined;

    // Cada tanda reemplaza la anterior para que la carpeta del móvil quede limpia.
    if (body.clean !== false) ws.clearOutputs();

    const job = newJob('generar');
    generating = job;
    const controller = new AbortController();
    job.cancel = () => controller.abort();
    runJob(job, () =>
      generate(
        {
          roles,
          count: Math.max(1, Math.min(500, parseInt(body.count, 10) || 10)),
          seed: Number.isFinite(Number(body.seed)) ? Number(body.seed) : Math.floor(Math.random() * 1e9),
          resolution: RESOLUTIONS[body.resolution] ? body.resolution : '1080p',
          clipVolume: body.clipVolume !== undefined ? Number(body.clipVolume) : undefined,
          productRole: 'demo',
          music,
          outDir: dirs.out,
        },
        (e) => {
          if (e.type === 'progress') job.progress = e.progress;
          else if (e.type === 'start') job.stage = `Generando ${e.total} de ${e.possible} combinaciones posibles`;
          else if (e.type === 'video') job.events.push({ ...e, url: fileUrl(e.file) });
        },
        { signal: controller.signal }
      ).then((videos) => videos.map((v) => ({ ...v, url: fileUrl(v.file) })))
    );
    res.json({ job: job.id });
  });

  app.post('/api/trabajos/:id/cancelar', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'No existe' });
    if (job.cancel) job.cancel();
    res.json({ ok: true });
  });

  app.get('/api/trabajos/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'No existe' });
    const { cancel, ...visible } = job;
    res.json(visible);
  });

  app.post('/api/analizar', async (req, res) => {
    const id = new Date().toISOString().replace(/[:.]/g, '-');
    const workDir = path.join(dirs.viral, id);
    let input;
    try {
      if ((req.headers['content-type'] || '').startsWith('multipart/')) {
        const { saved } = await receiveUpload(req, workDir, VIDEO_EXT);
        input = saved[0];
      } else {
        input = req.body && req.body.url;
        if (!viral.isUrl(input)) return res.status(400).json({ error: 'Pega un enlace válido (https://...).' });
      }
      if (!input) return res.status(400).json({ error: 'Sube un vídeo o pega un enlace.' });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const job = newJob('analizar');
    runJob(job, async () => {
      const r = await viral.analyze(input, {
        workDir,
        threshold: Number(req.query.umbral) || 0.3,
        onEvent: (e) => {
          if (e.type === 'stage') job.stage = e.stage;
          if (e.type === 'shot') {
            job.stage = `Leyendo textos (${e.shot.index}/${e.total})`;
            job.progress = e.shot.index / e.total;
          }
        },
      });
      return {
        ...r,
        videoUrl: fileUrl(r.file),
        shots: r.shots.map((s) => ({ ...s, frameUrl: fileUrl(s.frame) })),
      };
    });
    res.json({ job: job.id });
  });

  app.post('/api/separar', async (req, res) => {
    const id = new Date().toISOString().replace(/[:.]/g, '-');
    const workDir = path.join(dirs.separate, id);
    let saved;
    try {
      ({ saved } = await receiveUpload(req, workDir, new RegExp(`${VIDEO_EXT.source}|${AUDIO_EXT.source}`, 'i')));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!saved.length) return res.status(400).json({ error: 'Sube un vídeo o un audio.' });
    const job = newJob('separar');
    job.stage = 'Separando voz y música';
    runJob(job, async () => {
      const r = await separate(saved[0], workDir, {
        onStderr: (s) => {
          const m = /(\d+)%\|/.exec(s);
          if (m) job.progress = Number(m[1]) / 100;
        },
      });
      return { ...r, voiceUrl: fileUrl(r.voice), musicUrl: fileUrl(r.music) };
    });
    res.json({ job: job.id });
  });

  app.get('/api/compartir', async (req, res) => {
    const port = req.socket.localPort;
    const url = `http://${lanAddress()}:${port}${shareBase}`;
    res.json(await qr(url));
  });

  app.get('/api/actualizacion', async (req, res) => res.json(await checkForUpdate()));

  return { app, dirs, token, shareBase };
}

// Arranca el servidor. host 0.0.0.0 para que el móvil pueda descargar por WiFi.
function start({ port = Number(process.env.PORT) || 4321, host = process.env.VV_HOST || '0.0.0.0', workspace } = {}) {
  const ctx = createApp({ workspace });
  return new Promise((resolve, reject) => {
    const server = ctx.app.listen(port, host, () => {
      const actual = server.address().port;
      resolve({ ...ctx, server, port: actual, url: `http://127.0.0.1:${actual}/` });
    });
    server.on('error', reject);
  });
}

if (require.main === module) {
  start()
    .then(({ url, dirs }) => {
      console.log(`Vertiflow ${pkg.version} listo en ${url}`);
      console.log(`Carpeta de trabajo: ${dirs.root}`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { createApp, start, ROLES };
