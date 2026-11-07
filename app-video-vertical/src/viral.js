'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { run, ffmpeg, probe } = require('./ffmpeg');

const YTDLP = process.env.VV_YTDLP || 'yt-dlp';

const isUrl = (s) => /^https?:\/\//i.test(String(s));

// Descarga un vídeo de un enlace (TikTok, Instagram, YouTube...) con yt-dlp.
async function download(url, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = await run(YTDLP, [
    '--no-playlist', '--no-progress', '-f', 'mp4/bestvideo*+bestaudio/best',
    '--merge-output-format', 'mp4',
    '-o', path.join(dir, '%(id)s.%(ext)s'),
    '--print', 'after_move:filepath',
    url,
  ]);
  const file = out.trim().split('\n').pop();
  if (!file || !fs.existsSync(file)) throw new Error('No se pudo descargar el vídeo.');
  return file;
}

// Detecta cambios de plano. `threshold` 0..1: más bajo = más sensible.
async function detectCuts(file, threshold = 0.3) {
  const log = await new Promise((resolve, reject) => {
    let err = '';
    ffmpeg(['-hide_banner', '-i', file, '-an', '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], {
      onStderr: (s) => (err += s),
    })
      .then(() => resolve(err))
      .catch(reject);
  });
  const cuts = [];
  const re = /pts_time:([0-9.]+)/g;
  let m;
  while ((m = re.exec(log))) cuts.push(Number(Number(m[1]).toFixed(3)));
  return cuts;
}

// Convierte cortes en planos con inicio, fin y duración.
function shotsFromCuts(cuts, duration, minShot = 0.2) {
  const points = [0, ...cuts.filter((c) => c > 0 && c < duration), duration];
  const shots = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end - start < minShot && shots.length) {
      shots[shots.length - 1].end = end;
      continue;
    }
    shots.push({ start, end });
  }
  return shots.map((s, i) => ({
    index: i + 1,
    start: Number(s.start.toFixed(2)),
    end: Number(s.end.toFixed(2)),
    duration: Number((s.end - s.start).toFixed(2)),
  }));
}

async function extractFrame(file, time, output) {
  await ffmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(time), '-i', file, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', output]);
  return output;
}

// OCR con tesseract.js (opcional: si no está disponible, se devuelve sin textos).
let workerPromise = null;
async function getOcr() {
  if (process.env.VV_DISABLE_OCR) return null;
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = require('tesseract.js');
      return createWorker(process.env.VV_OCR_LANGS || 'spa+eng');
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

async function readText(image) {
  const worker = await getOcr();
  if (!worker) return '';
  const { data } = await worker.recognize(image);
  return data.text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && /[\p{L}\p{N}]/u.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function closeOcr() {
  if (workerPromise) {
    const w = await workerPromise.catch(() => null);
    workerPromise = null;
    if (w) await w.terminate();
  }
}

// Análisis completo: planos, fotogramas y textos.
async function analyze(input, { workDir, threshold = 0.3, ocr = true, onEvent = () => {} } = {}) {
  const dir = workDir || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'vv-viral-'));
  fs.mkdirSync(dir, { recursive: true });
  let file = input;
  if (isUrl(input)) {
    onEvent({ type: 'stage', stage: 'descargando' });
    file = await download(input, dir);
  }
  const meta = await probe(file);
  onEvent({ type: 'stage', stage: 'detectando planos' });
  const cuts = await detectCuts(file, threshold);
  const shots = shotsFromCuts(cuts, meta.duration);

  let ocrError = null;
  for (const shot of shots) {
    const t = shot.start + Math.min(shot.duration / 2, 0.8);
    shot.frame = await extractFrame(file, t.toFixed(2), path.join(dir, `plano_${String(shot.index).padStart(3, '0')}.jpg`));
    shot.text = '';
    if (ocr && !ocrError) {
      try {
        shot.text = await readText(shot.frame);
      } catch (err) {
        ocrError = err.message;
      }
    }
    onEvent({ type: 'shot', shot, total: shots.length });
  }

  const durations = shots.map((s) => s.duration);
  const summary = {
    duration: Number(meta.duration.toFixed(2)),
    shots: shots.length,
    averageShot: shots.length ? Number((durations.reduce((a, b) => a + b, 0) / shots.length).toFixed(2)) : 0,
    cutsPerSecond: meta.duration ? Number((cuts.length / meta.duration).toFixed(2)) : 0,
    hookDuration: shots.length ? shots[0].duration : 0,
    width: meta.width,
    height: meta.height,
  };
  const result = { source: input, file, summary, shots, ocrError };
  fs.writeFileSync(path.join(dir, 'analisis.json'), JSON.stringify(result, null, 2));
  return result;
}

module.exports = { isUrl, download, detectCuts, shotsFromCuts, extractFrame, readText, closeOcr, analyze };
