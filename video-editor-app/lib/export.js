'use strict';

// Construye los argumentos de FFmpeg para renderizar un proyecto.
// Es una función pura: no toca disco ni lanza procesos, así que se puede probar sola.
//
// project = {
//   width, height, fps,
//   clips: [{ mediaId, start, end }],          // en orden, se concatenan
//   texts: [{ textFile, start, end, position, size, color }]  // tiempos en la línea de tiempo final
// }
// media = { [mediaId]: { path, hasAudio } }

const POSITIONS = {
  top: { x: '(w-text_w)/2', y: '40' },
  center: { x: '(w-text_w)/2', y: '(h-text_h)/2' },
  bottom: { x: '(w-text_w)/2', y: 'h-text_h-40' },
};

function num(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Valor numérico inválido en ${name}: ${value}`);
  return n;
}

function clampInt(value, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Math.round(num(value, 'entero'));
  return Math.min(max, Math.max(min, n));
}

function ffmpegColor(color) {
  const hex = String(color || '#ffffff').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Color inválido: ${color}`);
  return `0x${hex}`;
}

// La ruta del texto va entre comillas simples dentro del filtro, así que no puede contenerlas.
function ffmpegPath(p) {
  if (p.includes("'")) throw new Error(`Ruta no permitida: ${p}`);
  return `'${p.replace(/\\/g, '/').replace(/:/g, '\\:')}'`;
}

function buildFfmpegArgs(project, media, outPath) {
  const width = clampInt(project.width, 240, 3840, 1280);
  const height = clampInt(project.height, 240, 2160, 720);
  const fps = clampInt(project.fps, 1, 60, 30);
  const clips = project.clips || [];
  const texts = project.texts || [];

  if (clips.length === 0) throw new Error('El proyecto no tiene clips');

  const args = ['-y'];
  const graph = [];
  const concatInputs = [];

  clips.forEach((clip, i) => {
    const m = media[clip.mediaId];
    if (!m) throw new Error(`Medio no encontrado: ${clip.mediaId}`);
    const start = num(clip.start, 'start');
    const end = num(clip.end, 'end');
    if (end <= start) throw new Error(`Clip ${i + 1}: el final debe ser mayor que el inicio`);
    const dur = end - start;

    args.push('-i', m.path);

    graph.push(
      `[${i}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,` +
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`
    );

    if (m.hasAudio) {
      graph.push(
        `[${i}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,` +
          `aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`
      );
    } else {
      // Clip sin audio: se rellena con silencio para que el concat no falle.
      graph.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${dur}[a${i}]`);
    }

    concatInputs.push(`[v${i}][a${i}]`);
  });

  graph.push(`${concatInputs.join('')}concat=n=${clips.length}:v=1:a=1[vc][outa]`);

  let lastVideo = 'vc';
  texts.forEach((t, k) => {
    const start = num(t.start, 'texto start');
    const end = num(t.end, 'texto end');
    if (end <= start) return;
    const pos = POSITIONS[t.position] || POSITIONS.bottom;
    const size = clampInt(t.size, 8, 300, 48);
    const label = `vt${k}`;
    graph.push(
      `[${lastVideo}]drawtext=textfile=${ffmpegPath(t.textFile)}:fontsize=${size}:` +
        `fontcolor=${ffmpegColor(t.color)}:borderw=3:bordercolor=black:` +
        `x=${pos.x}:y=${pos.y}:enable='between(t,${start},${end})'[${label}]`
    );
    lastVideo = label;
  });

  args.push(
    '-filter_complex', graph.join(';'),
    '-map', `[${lastVideo}]`,
    '-map', '[outa]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    outPath
  );
  return args;
}

module.exports = { buildFfmpegArgs, POSITIONS };
