'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { probe } = require('./ffmpeg');
const { uniqueCombinations, totalCombinations } = require('./combinations');
const { renderVideo, RESOLUTIONS } = require('./render');
const { analyzeSong, alignMusic } = require('./music');

// Genera vídeos a partir de un proyecto.
// project = {
//   roles: { apertura: [ruta], demo: [ruta], cierre: [ruta] },  // en orden de aparición
//   count: 10, seed: 1, resolution: '1080p', outDir: 'salida',
//   productRole: 'demo',              // rol donde aparece el producto
//   music: { path, drop?, volume? },   // drop: segundo fuerte (si falta, se detecta)
//   clipVolume: 0.35,
// }
// onEvent recibe { type: 'start'|'progress'|'video'|'done', ... }
async function generate(project, onEvent = () => {}, { signal } = {}) {
  const roles = project.roles || {};
  const roleNames = Object.keys(roles);
  if (roleNames.length === 0) throw new Error('El proyecto no tiene clips.');
  const resolution = project.resolution || '1080p';
  if (!RESOLUTIONS[resolution]) throw new Error(`Resolución no válida: ${resolution}`);

  // Información de cada clip, una sola vez.
  const info = new Map();
  for (const clips of Object.values(roles)) {
    for (const file of clips) {
      if (info.has(file)) continue;
      if (!fs.existsSync(file)) throw new Error(`No existe el clip: ${file}`);
      const meta = await probe(file);
      if (!meta.hasVideo) throw new Error(`El archivo no tiene vídeo: ${file}`);
      info.set(file, meta);
    }
  }

  let musicInfo = null;
  if (project.music && project.music.path) {
    if (!fs.existsSync(project.music.path)) throw new Error(`No existe la música: ${project.music.path}`);
    const drop = Number.isFinite(project.music.drop)
      ? project.music.drop
      : (await analyzeSong(project.music.path)).drop;
    musicInfo = { path: project.music.path, drop, volume: project.music.volume ?? 1 };
  }

  const productRole = roleNames.includes(project.productRole) ? project.productRole : roleNames[Math.min(1, roleNames.length - 1)];
  const productIndex = roleNames.indexOf(productRole);

  const combos = uniqueCombinations(roles, project.count || 5, project.seed ?? 1);
  const outDir = project.outDir || 'salida';
  fs.mkdirSync(outDir, { recursive: true });
  onEvent({ type: 'start', total: combos.length, possible: totalCombinations(roles) });

  const results = [];
  for (let i = 0; i < combos.length; i++) {
    if (signal && signal.aborted) throw new Error('Cancelado');
    const clips = combos[i].clips.map((f) => info.get(f));
    const productTime = clips.slice(0, productIndex).reduce((acc, c) => acc + c.duration, 0);
    const music = musicInfo
      ? { path: musicInfo.path, volume: musicInfo.volume, ...alignMusic(musicInfo.drop, productTime) }
      : undefined;
    const output = path.join(outDir, `video_${String(i + 1).padStart(3, '0')}.mp4`);
    await renderVideo(clips, output, {
      resolution,
      music,
      clipVolume: project.clipVolume,
      signal,
      onProgress: (p) => onEvent({ type: 'progress', index: i, progress: (i + p) / combos.length }),
    });
    const item = {
      file: output,
      clips: combos[i].clips.map((f) => path.basename(f)),
      duration: Number(clips.reduce((a, c) => a + c.duration, 0).toFixed(2)),
      productTime: Number(productTime.toFixed(2)),
      music: music ? { start: music.start, delay: music.delay } : null,
    };
    results.push(item);
    onEvent({ type: 'video', index: i, ...item });
  }
  onEvent({ type: 'done', videos: results });
  return results;
}

module.exports = { generate };
