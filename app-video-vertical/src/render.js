'use strict';

const { ffmpeg } = require('./ffmpeg');

// Resoluciones verticales de salida.
const RESOLUTIONS = {
  '720p': { width: 720, height: 1280 },
  '1080p': { width: 1080, height: 1920 },
  '1440p': { width: 1440, height: 2560 },
  '4k': { width: 2160, height: 3840 },
};
const WIDTH = RESOLUTIONS['1080p'].width;
const HEIGHT = RESOLUTIONS['1080p'].height;
const FPS = 30;

const normalizeClip = (c) => (typeof c === 'string' ? { path: c, hasAudio: true, duration: null } : c);

// Construye los argumentos de FFmpeg para unir clips en un vídeo vertical.
// Cada clip se escala para cubrir el encuadre y se recorta al centro; luego se concatena.
// options:
//   resolution: '720p' | '1080p' | '1440p' | '4k' (o width/height explícitos)
//   music: { path, start, delay, volume } — pista de música alineada (ver music.alignMusic)
//   clipVolume: volumen del audio original de los clips (0 = mudo)
function buildFfmpegArgs(clipsIn, output, options = {}) {
  const clips = clipsIn.map(normalizeClip);
  const res = RESOLUTIONS[options.resolution] || {};
  const width = options.width || res.width || WIDTH;
  const height = options.height || res.height || HEIGHT;
  const fps = options.fps || FPS;
  const music = options.music;
  const clipVolume = options.clipVolume ?? (music ? 0.35 : 1);

  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:2', '-nostats'];
  for (const clip of clips) args.push('-i', clip.path);
  if (music) args.push('-i', music.path);

  const parts = [];
  const labels = [];
  clips.forEach((clip, i) => {
    parts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p[v${i}]`
    );
    if (clip.hasAudio === false) {
      if (!clip.duration) throw new Error(`Falta la duración del clip sin audio: ${clip.path}`);
      parts.push(`anullsrc=r=48000:cl=stereo,atrim=0:${clip.duration},asetpts=N/SR/TB[a${i}]`);
    } else {
      parts.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`);
    }
    labels.push(`[v${i}][a${i}]`);
  });

  const total = clips.reduce((acc, c) => acc + (c.duration || 0), 0);
  if (music) {
    parts.push(`${labels.join('')}concat=n=${clips.length}:v=1:a=1[outv][ca]`);
    const m = clips.length;
    const delayMs = Math.round((music.delay || 0) * 1000);
    parts.push(
      `[${m}:a]atrim=start=${music.start || 0},asetpts=PTS-STARTPTS,` +
        `aresample=48000,aformat=channel_layouts=stereo,` +
        `adelay=${delayMs}|${delayMs},volume=${music.volume ?? 1}[mus]`
    );
    parts.push(`[ca]volume=${clipVolume}[cav]`);
    const fade = total > 1 ? `,afade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6` : '';
    parts.push(`[cav][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0${fade}[outa]`);
  } else if (clipVolume !== 1) {
    parts.push(`${labels.join('')}concat=n=${clips.length}:v=1:a=1[outv][ca]`);
    parts.push(`[ca]volume=${clipVolume}[outa]`);
  } else {
    parts.push(`${labels.join('')}concat=n=${clips.length}:v=1:a=1[outv][outa]`);
  }

  // Calidad según resolución; sin metadatos del origen ni del codificador.
  const crf = height >= 3840 ? '18' : '20';
  args.push(
    '-filter_complex', parts.join(';'),
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', options.preset || 'medium', '-crf', crf,
    '-c:a', 'aac', '-b:a', '192k',
    '-map_metadata', '-1', '-map_chapters', '-1',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
    '-movflags', '+faststart',
    output
  );
  return args;
}

// Renderiza y avisa del progreso (0..1) si se conoce la duración total.
function renderVideo(clips, output, options = {}) {
  const norm = clips.map(normalizeClip);
  const total = norm.reduce((acc, c) => acc + (c.duration || 0), 0);
  const args = buildFfmpegArgs(norm, output, options);
  return ffmpeg(args, {
    signal: options.signal,
    onStderr: (s) => {
      if (!options.onProgress || !total) return;
      const m = /out_time_us=(\d+)/.exec(s);
      if (m) options.onProgress(Math.min(1, Number(m[1]) / 1e6 / total));
    },
  }).then(() => output);
}

module.exports = { buildFfmpegArgs, renderVideo, RESOLUTIONS, WIDTH, HEIGHT, FPS };
