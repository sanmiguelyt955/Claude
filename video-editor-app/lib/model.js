'use strict';

// Modelo del proyecto compartido por servidor y navegador. Sin dependencias.
//
// project = {
//   id, name, ratio, fps,
//   tracks: [{ id, kind, name, muted, clips: [] }]
// }
// kind: 'video' (video/imagen, capas de abajo a arriba), 'audio', 'text', 'graphic' (formas)
//
// Todos los clips tienen `at` (inicio en la línea de tiempo, s) y `dur` (duración en pantalla, s).
// Los clips de video/audio además tienen `in`/`out` (recorte en el archivo, s) y `speed`.

const RATIOS = {
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '1:1': [1080, 1080],
  '4:5': [864, 1080],
};

const KIND_TYPES = {
  video: ['video', 'image'],
  audio: ['audio'],
  text: ['text'],
  graphic: ['shape'],
};

const TRANSITIONS = ['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down'];

const FILTER_PRESETS = ['none', 'warm', 'cool', 'bw', 'vintage', 'vivid', 'dramatic'];

const MIN_SPEED = 0.1;
const MAX_SPEED = 100;

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const isHex6 = (s) => typeof s === 'string' && /^#?[0-9a-fA-F]{6}$/.test(s);
const hex6 = (s, fallback) => (isHex6(s) ? (s.startsWith('#') ? s : `#${s}`) : fallback);

function clipDuration(c) {
  if (c.type === 'video' || c.type === 'audio') return (c.out - c.in) / c.speed;
  return c.dur;
}

function projectDuration(project) {
  let end = 0;
  for (const t of project.tracks) {
    for (const c of t.clips) end = Math.max(end, c.at + clipDuration(c));
  }
  return end;
}

// Velocidad de audio: atempo solo acepta 0.5–2, así que se encadena.
function atempoChain(speed) {
  const steps = [];
  let s = speed;
  while (s > 2) { steps.push(2); s /= 2; }
  while (s < 0.5) { steps.push(0.5); s /= 0.5; }
  steps.push(Number(s.toFixed(6)));
  return steps;
}

// Normaliza un clip según el tipo de su pista. Limita valores y completa los que falten.
function normalizeClip(raw, kind, mediaById) {
  const types = KIND_TYPES[kind];
  const type = types.includes(raw.type) ? raw.type : types[0];
  const base = {
    id: String(raw.id || cryptoId()),
    type,
    at: Math.max(0, clamp(raw.at, 0, 1e6, 0)),
  };

  if (type === 'text') {
    return {
      ...base,
      dur: clamp(raw.dur, 0.1, 1e4, 3),
      text: String(raw.text ?? '').slice(0, 500),
      x: clamp(raw.x, 0, 100, 50),
      y: clamp(raw.y, 0, 100, 85),
      size: clamp(raw.size, 8, 300, 48),
      color: hex6(raw.color, '#ffffff'),
      bg: raw.bg === null || raw.bg === undefined ? null : hex6(raw.bg, '#000000'),
      bgOpacity: clamp(raw.bgOpacity, 0, 1, 0.5),
    };
  }

  if (type === 'shape') {
    return {
      ...base,
      dur: clamp(raw.dur, 0.1, 1e4, 3),
      x: clamp(raw.x, 0, 100, 50),
      y: clamp(raw.y, 0, 100, 50),
      w: clamp(raw.w, 1, 100, 30),
      h: clamp(raw.h, 1, 100, 20),
      color: hex6(raw.color, '#7c5cff'),
      opacity: clamp(raw.opacity, 0, 1, 0.8),
    };
  }

  const media = mediaById(raw.mediaId);
  if (!media) throw new Error(`Medio no encontrado: ${raw.mediaId}`);

  if (type === 'image') {
    return {
      ...base,
      mediaId: media.id,
      dur: clamp(raw.dur, 0.1, 1e4, 3),
      ...visualProps(raw),
    };
  }

  const srcDur = media.duration || 0;
  const inT = clamp(raw.in, 0, srcDur, 0);
  const outT = clamp(raw.out, 0, srcDur, srcDur);
  if (outT - inT < 0.05) throw new Error(`Clip ${base.id}: duración de recorte demasiado corta`);

  const common = {
    ...base,
    mediaId: media.id,
    in: inT,
    out: outT,
    speed: clamp(raw.speed, MIN_SPEED, MAX_SPEED, 1),
    volume: clamp(raw.volume, 0, 2, 1),
    muted: Boolean(raw.muted),
    fadeIn: 0,
    fadeOut: 0,
    filter: normalizeFilter(raw.filter),
    transitionIn: normalizeTransition(raw.transitionIn),
  };
  const dur = clipDuration(common);
  common.fadeIn = clamp(raw.fadeIn, 0, dur / 2, 0);
  common.fadeOut = clamp(raw.fadeOut, 0, dur / 2, 0);

  if (type === 'audio') return common;
  return { ...common, ...visualProps(raw) };
}

function visualProps(raw) {
  return {
    x: clamp(raw.x, 0, 100, 50),
    y: clamp(raw.y, 0, 100, 50),
    scale: clamp(raw.scale, 5, 300, 100),
    opacity: clamp(raw.opacity, 0, 1, 1),
    chromaKey: raw.chromaKey && isHex6(raw.chromaKey.color)
      ? { color: hex6(raw.chromaKey.color, '#00ff00'), similarity: clamp(raw.chromaKey.similarity, 0.01, 0.5, 0.2) }
      : null,
  };
}

function normalizeFilter(f = {}) {
  return {
    preset: FILTER_PRESETS.includes(f.preset) ? f.preset : 'none',
    brightness: clamp(f.brightness, -1, 1, 0),
    contrast: clamp(f.contrast, 0, 2, 1),
    saturation: clamp(f.saturation, 0, 3, 1),
  };
}

function normalizeTransition(t) {
  if (!t || !TRANSITIONS.includes(t.type)) return null;
  return { type: t.type, dur: clamp(t.dur, 0.1, 2, 0.5) };
}

function normalizeProject(raw, mediaById) {
  const ratio = RATIOS[raw.ratio] ? raw.ratio : '16:9';
  const tracks = (raw.tracks || []).map((t, i) => {
    const kind = KIND_TYPES[t.kind] ? t.kind : 'video';
    return {
      id: String(t.id || `${kind[0]}${i + 1}`),
      kind,
      name: String(t.name || `Pista ${i + 1}`).slice(0, 60),
      muted: Boolean(t.muted),
      clips: (t.clips || []).map((c) => normalizeClip(c, kind, mediaById)),
    };
  });
  const project = {
    id: raw.id ? String(raw.id) : undefined,
    name: String(raw.name || 'Proyecto sin título').slice(0, 120),
    ratio,
    fps: Math.round(clamp(raw.fps, 1, 60, 30)),
    tracks,
  };
  const baseId = (tracks.find((t) => t.kind === 'video') || {}).id;
  for (const t of tracks) {
    t.clips.sort((a, b) => a.at - b.at);
    const errors = trackErrors(t, t.id === baseId);
    if (errors.length) throw new Error(errors[0]);
  }
  return project;
}

// En la pista de fondo (la primera de video) un clip no puede solaparse con el anterior,
// salvo que tenga transición de entrada y el solape no supere su duración.
// Las demás pistas permiten solapes (capas, varios textos o audios a la vez).
function trackErrors(track, isBase) {
  const errors = [];
  if (!isBase) return errors;
  for (let i = 1; i < track.clips.length; i++) {
    const prev = track.clips[i - 1];
    const cur = track.clips[i];
    const overlap = prev.at + clipDuration(prev) - cur.at;
    if (overlap <= 1e-6) continue;
    const tr = cur.transitionIn;
    if (!tr || overlap > tr.dur + 1e-6) {
      errors.push(`Pista "${track.name}": el clip ${cur.id} se solapa con ${prev.id}`);
    }
  }
  return errors;
}

function cryptoId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const VEModel = {
  RATIOS,
  KIND_TYPES,
  TRANSITIONS,
  FILTER_PRESETS,
  MIN_SPEED,
  MAX_SPEED,
  clipDuration,
  projectDuration,
  atempoChain,
  normalizeProject,
  normalizeClip,
  trackErrors,
};

// Sirve tanto a Node (require) como al navegador (<script>).
if (typeof module !== 'undefined' && module.exports) module.exports = VEModel;
else globalThis.VEModel = VEModel;
