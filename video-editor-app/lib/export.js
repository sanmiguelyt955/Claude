'use strict';

// Construye los argumentos de FFmpeg para renderizar un proyecto (modelo v2, ver lib/model.js).
// Función pura: no toca disco ni lanza procesos, así que se prueba sola.
//
// media = { [mediaId]: { path, type: 'video'|'audio'|'image', hasAudio } }
// Los clips de texto llevan `textFile` (ruta a un .txt escrito por el servidor).

const { RATIOS, clipDuration, projectDuration, atempoChain } = require('./model');

const FILTER_CHAINS = {
  none: '',
  warm: 'colorbalance=rs=0.12:gs=0.02:bs=-0.12',
  cool: 'colorbalance=rs=-0.12:bs=0.12',
  bw: 'hue=s=0',
  vintage: 'colorbalance=rs=0.1:bs=-0.15,eq=saturation=0.7',
  vivid: 'eq=saturation=1.5:contrast=1.1',
  dramatic: 'eq=contrast=1.35:brightness=-0.05:saturation=1.2',
};

const POS_EXPR = (pct, axis) => `${axis === 'x' ? 'W' : 'H'}*${pct}/100`;

const n = (v) => Number(v).toFixed(4).replace(/\.?0+$/, '') || '0';

const hexToFf = (hex) => `0x${String(hex).replace('#', '')}`;

// La ruta del texto va entre comillas simples dentro del filtro, así que no puede contenerlas.
function ffPath(p) {
  if (p.includes("'")) throw new Error(`Ruta no permitida: ${p}`);
  return `'${p.replace(/\\/g, '/').replace(/:/g, '\\:')}'`;
}

// Posición de un clip de capa (escalado y posicionado). Con transición, la entrada se desliza.
function overlayPosition(clip, at, tdur, dir) {
  const xf = `(${POS_EXPR(clip.x, 'x')}-w/2)`;
  const yf = `(${POS_EXPR(clip.y, 'y')}-h/2)`;
  if (!dir) return { x: `'${xf}'`, y: `'${yf}'` };
  const a = n(at);
  const d = n(tdur);
  const end = n(at + tdur);
  // Progreso p = (t-a)/d en [0,1]; la capa entra desde el borde indicado hasta su posición final.
  const prog = `(t-${a})/${d}`;
  const inWindow = `between(t,${a},${end})`;
  const slide = {
    'slide-left': [`W-(W-${xf})*${prog}`, yf],
    'slide-right': [`(${xf})*${prog}-w*(1-${prog})`, yf],
    'slide-up': [xf, `H-(H-${yf})*${prog}`],
    'slide-down': [xf, `(${yf})*${prog}-h*(1-${prog})`],
  }[dir];
  return {
    x: `'if(${inWindow},${slide[0]},${xf})'`,
    y: `'if(${inWindow},${slide[1]},${yf})'`,
  };
}

function videoChain(clip, { isBase, W, H, fps, transition }) {
  const parts = [];
  if (clip.type === 'image') {
    parts.push(`trim=duration=${n(clipDuration(clip))}`, 'setpts=PTS-STARTPTS');
  } else {
    parts.push(`trim=start=${n(clip.in)}:end=${n(clip.out)}`, `setpts=(PTS-STARTPTS)/${n(clip.speed)}`);
  }
  parts.push(`fps=${fps}`);

  const f = clip.filter || {};
  const chain = FILTER_CHAINS[f.preset] || '';
  if (chain) parts.push(chain);
  const eq = [];
  if (f.brightness && f.brightness !== 0) eq.push(`brightness=${n(f.brightness)}`);
  if (f.contrast !== undefined && f.contrast !== 1) eq.push(`contrast=${n(f.contrast)}`);
  if (f.saturation !== undefined && f.saturation !== 1) eq.push(`saturation=${n(f.saturation)}`);
  if (eq.length) parts.push(`eq=${eq.join(':')}`);

  if (isBase) {
    parts.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`, 'setsar=1');
  } else {
    parts.push(`scale=w=${Math.round((W * clip.scale) / 100 / 2) * 2}:h=-2`, 'setsar=1');
  }

  const needsAlpha = !isBase || transition || clip.chromaKey || clip.opacity < 1;
  if (clip.chromaKey) {
    parts.push('format=yuv420p', `chromakey=${hexToFf(clip.chromaKey.color)}:${n(clip.chromaKey.similarity)}:0.08`);
  } else if (needsAlpha) {
    parts.push('format=yuva420p');
  } else {
    parts.push('format=yuv420p');
  }
  if (clip.opacity < 1) parts.push(`colorchannelmixer=aa=${n(clip.opacity)}`);

  // Tiempo absoluto de la línea de tiempo: necesario para que la transición y el overlay usen t real.
  parts.push(`setpts=PTS+${n(clip.at)}/TB`);
  if (transition && transition.type === 'fade') {
    parts.push(`fade=t=in:st=${n(clip.at)}:d=${n(transition.dur)}:alpha=1`);
  }
  return parts;
}

function audioChain(clip, { track, at }) {
  const parts = [];
  if (clip.type === 'audio' || clip.type === 'video') {
    parts.push(`atrim=start=${n(clip.in)}:end=${n(clip.out)}`, 'asetpts=PTS-STARTPTS');
    for (const step of atempoChain(clip.speed)) {
      if (step !== 1) parts.push(`atempo=${n(step)}`);
    }
  }
  const vol = track.muted || clip.muted ? 0 : clip.volume;
  parts.push(`volume=${n(vol)}`);
  const dur = clipDuration(clip);
  if (clip.fadeIn > 0) parts.push(`afade=t=in:st=0:d=${n(clip.fadeIn)}`);
  if (clip.transitionIn && clip.fadeIn === 0) {
    parts.push(`afade=t=in:st=0:d=${n(clip.transitionIn.dur)}`);
  }
  if (clip.fadeOut > 0) parts.push(`afade=t=out:st=${n(dur - clip.fadeOut)}:d=${n(clip.fadeOut)}`);
  const ms = Math.round(at * 1000);
  parts.push('aformat=sample_rates=44100:channel_layouts=stereo', `adelay=${ms}|${ms}`);
  return parts;
}

// opts.fontFile: ruta a una fuente (.ttf/.otf) para los textos. Sin ella, FFmpeg usa fontconfig.
function buildFfmpegArgs(project, media, outPath, opts = {}) {
  const [W, H] = RATIOS[project.ratio] || RATIOS['16:9'];
  const fps = Math.round(Number(project.fps) || 30);
  const T = projectDuration(project);
  if (!(T > 0)) throw new Error('El proyecto no tiene contenido');

  const args = ['-y'];
  const g = [];
  let inputIdx = 0;
  const audioOut = [];

  g.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${n(T)}[base]`);
  let current = 'base';
  let visualIdx = 0;

  const addInput = (clip, m) => {
    if (m.type === 'image') args.push('-loop', '1', '-t', n(clipDuration(clip)), '-i', m.path);
    else args.push('-i', m.path);
    return inputIdx++;
  };

  // 1) Pistas de video, de abajo a arriba. La primera es el fondo (se ajusta al encuadre).
  const videoTracks = project.tracks.filter((t) => t.kind === 'video');
  for (const track of videoTracks) {
    const isBase = visualIdx++ === 0;
    for (const clip of track.clips) {
      const m = media[clip.mediaId];
      if (!m) throw new Error(`Medio no encontrado: ${clip.mediaId}`);
      const dur = clipDuration(clip);
      const idx = addInput(clip, m);
      const transition = clip.transitionIn;
      const v = `v${idx}`;
      g.push(`[${idx}:v]${videoChain(clip, { isBase, W, H, fps, transition }).join(',')}[${v}]`);

      const o = `o${idx}`;
      const at = n(clip.at);
      if (isBase) {
        g.push(`[${current}][${v}]overlay=x=0:y=0:eof_action=pass:format=auto:enable='between(t,${at},${n(clip.at + dur)})'[${o}]`);
      } else {
        const slide = transition && transition.type.startsWith('slide') ? transition.type : null;
        const pos = overlayPosition(clip, clip.at, transition ? transition.dur : 0, slide);
        g.push(`[${current}][${v}]overlay=x=${pos.x}:y=${pos.y}:eof_action=pass:format=auto:enable='between(t,${at},${n(clip.at + dur)})'[${o}]`);
      }
      current = o;

      if (clip.type !== 'image' && m.hasAudio && !track.muted) {
        g.push(`[${idx}:a]${audioChain(clip, { track, at: clip.at }).join(',')}[a${idx}]`);
        audioOut.push(`[a${idx}]`);
      }
    }
  }

  // 2) Pistas de audio (música, voces, efectos).
  for (const track of project.tracks.filter((t) => t.kind === 'audio')) {
    for (const clip of track.clips) {
      const m = media[clip.mediaId];
      if (!m) throw new Error(`Medio no encontrado: ${clip.mediaId}`);
      const idx = addInput(clip, m);
      g.push(`[${idx}:a]${audioChain(clip, { track, at: clip.at }).join(',')}[a${idx}]`);
      audioOut.push(`[a${idx}]`);
    }
  }

  // 3) Formas (gráficos sencillos sobre el video).
  for (const track of project.tracks.filter((t) => t.kind === 'graphic')) {
    for (const clip of track.clips) {
      const w = Math.round((W * clip.w) / 100);
      const h = Math.round((H * clip.h) / 100);
      const x = Math.round((W * clip.x) / 100 - w / 2);
      const y = Math.round((H * clip.y) / 100 - h / 2);
      const o = `g${current}`;
      g.push(
        `[${current}]drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${hexToFf(clip.color)}@${n(clip.opacity)}:t=fill:` +
          `enable='between(t,${n(clip.at)},${n(clip.at + clipDuration(clip))})'[${o}]`
      );
      current = o;
    }
  }

  // 4) Textos encima de todo.
  for (const track of project.tracks.filter((t) => t.kind === 'text')) {
    for (const clip of track.clips) {
      if (!clip.textFile) throw new Error(`Texto ${clip.id} sin archivo de texto`);
      const size = Math.round(clip.size);
      const box = clip.bg
        ? `:box=1:boxcolor=${hexToFf(clip.bg)}@${n(clip.bgOpacity)}:boxborderw=14`
        : '';
      const o = `t${clip.id.replace(/[^a-zA-Z0-9]/g, '')}`;
      const font = opts.fontFile ? `fontfile=${ffPath(opts.fontFile)}:` : '';
      // expansion=none: el texto se escribe tal cual (un "%" no se interpreta como código).
      g.push(
        `[${current}]drawtext=${font}expansion=none:textfile=${ffPath(clip.textFile)}:fontsize=${size}:fontcolor=${hexToFf(clip.color)}:` +
          `borderw=3:bordercolor=black${box}:x=(${POS_EXPR(clip.x, 'x')}-text_w/2):y=(${POS_EXPR(clip.y, 'y')}-text_h/2):` +
          `enable='between(t,${n(clip.at)},${n(clip.at + clip.dur)})'[${o}]`
      );
      current = o;
    }
  }

  // 5) Mezcla de audio.
  if (audioOut.length === 0) {
    g.push(`anullsrc=channel_layout=stereo:sample_rate=44100,atrim=duration=${n(T)}[aout]`);
  } else if (audioOut.length === 1) {
    g.push(`${audioOut[0]}anull[aout]`);
  } else {
    g.push(`${audioOut.join('')}amix=inputs=${audioOut.length}:duration=longest:dropout_transition=0:normalize=0[aout]`);
  }

  args.push(
    '-filter_complex', g.join(';'),
    '-map', `[${current}]`,
    '-map', '[aout]',
    '-t', n(T),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    outPath
  );
  return args;
}

module.exports = { buildFfmpegArgs, FILTER_CHAINS };
