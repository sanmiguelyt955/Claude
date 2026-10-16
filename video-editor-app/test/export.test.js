'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildFfmpegArgs } = require('../lib/export');
const { normalizeProject, projectDuration } = require('../lib/model');

const run = promisify(execFile);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 've-test-'));

function ff(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
}

function makeSamples() {
  const files = {
    video: path.join(tmp, 'a.mp4'),     // video + audio, 4 s
    webm: path.join(tmp, 'b.webm'),     // video sin audio, 3 s
    image: path.join(tmp, 'logo.png'),  // imagen
    music: path.join(tmp, 'm.mp3'),     // audio, 3 s
  };
  ff(['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', files.video]);
  ff(['-f', 'lavfi', '-i', 'color=c=red:size=640x360:rate=30:duration=3',
    '-c:v', 'libvpx', '-b:v', '300k', files.webm]);
  ff(['-f', 'lavfi', '-i', 'color=c=0x00ff00:size=200x200', '-frames:v', '1', files.image]);
  ff(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-c:a', 'libmp3lame', files.music]);
  return files;
}

const FILES = makeSamples();
const MEDIA = {
  v1: { id: 'v1', path: FILES.video, type: 'video', hasAudio: true, duration: 4 },
  v2: { id: 'v2', path: FILES.webm, type: 'video', hasAudio: false, duration: 3 },
  img: { id: 'img', path: FILES.image, type: 'image', hasAudio: false, duration: 0 },
  mus: { id: 'mus', path: FILES.music, type: 'audio', hasAudio: true, duration: 3 },
};
const mediaById = (id) => MEDIA[id];

function probe(file) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json',
    '-show_streams', '-show_format', file]).toString());
}

function fullProject(textFile) {
  const project = normalizeProject({
    name: 'Prueba',
    ratio: '9:16',
    fps: 30,
    tracks: [
      { id: 'v1', kind: 'video', clips: [
        { id: 'c1', type: 'video', mediaId: 'v1', at: 0, in: 0.5, out: 2.5, speed: 2 },
        { id: 'c2', type: 'video', mediaId: 'v2', at: 0.8, in: 0, out: 3, speed: 1,
          transitionIn: { type: 'fade', dur: 0.2 }, filter: { preset: 'vivid', brightness: 0.1 } },
      ] },
      { id: 'v2', kind: 'video', clips: [
        { id: 'o1', type: 'image', mediaId: 'img', at: 0.5, dur: 2, x: 25, y: 25, scale: 40,
          transitionIn: { type: 'slide-left', dur: 0.5 }, opacity: 0.9 },
      ] },
      { id: 'a1', kind: 'audio', clips: [
        { id: 'm1', type: 'audio', mediaId: 'mus', at: 0, in: 0, out: 3, speed: 1, volume: 0.5, fadeOut: 0.5 },
      ] },
      { id: 'g1', kind: 'graphic', clips: [
        { id: 's1', type: 'shape', at: 0, dur: 3, x: 50, y: 90, w: 60, h: 6, color: '#ff0080', opacity: 0.7 },
      ] },
      { id: 't1', kind: 'text', clips: [
        { id: 'x1', type: 'text', at: 0.2, dur: 2, text: 'Hola: 100% "CapCut"', x: 50, y: 15, size: 60,
          color: '#ffff00', bg: '#000000', bgOpacity: 0.5 },
      ] },
    ],
  }, mediaById);
  // Como en el servidor: el archivo de texto se añade después de normalizar.
  project.tracks.find((t) => t.kind === 'text').clips[0].textFile = textFile;
  return project;
}

test('exporta un proyecto completo (velocidad, transiciones, capas, audio, forma y texto)', async () => {
  const textFile = path.join(tmp, 't.txt');
  fs.writeFileSync(textFile, 'Hola: 100% "CapCut"');
  const project = fullProject(textFile);
  const expected = projectDuration(project);
  const out = path.join(tmp, 'full.mp4');
  const args = buildFfmpegArgs(project, MEDIA, out);
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);

  const info = probe(out);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  assert.ok(v && a, 'debe tener video y audio');
  assert.equal(v.width, 720);
  assert.equal(v.height, 1280);
  const dur = Number(info.format.duration);
  assert.ok(Math.abs(dur - expected) < 0.2, `duración esperada ~${expected.toFixed(2)} s, obtenida ${dur}`);
});

test('exporta solo video de fondo sin audio ni texto', async () => {
  const project = normalizeProject({
    ratio: '1:1', fps: 25,
    tracks: [{ id: 'v1', kind: 'video', clips: [
      { id: 'c1', type: 'video', mediaId: 'v2', at: 0, in: 0, out: 2, speed: 4 },
    ] }],
  }, mediaById);
  const out = path.join(tmp, 'simple.mp4');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...buildFfmpegArgs(project, MEDIA, out)]);
  const info = probe(out);
  const v = info.streams.find((s) => s.codec_type === 'video');
  assert.equal(v.width, 1080);
  assert.equal(v.height, 1080);
  // 2 s a 4x = 0.5 s; el audio de relleno debe existir igualmente
  assert.ok(Math.abs(Number(info.format.duration) - 0.5) < 0.15);
  assert.ok(info.streams.some((s) => s.codec_type === 'audio'));
});

test('exporta clips de audio con velocidad extrema (atempo encadenado)', async () => {
  const project = normalizeProject({
    tracks: [
      { id: 'v1', kind: 'video', clips: [{ id: 'c1', type: 'video', mediaId: 'v2', at: 0, in: 0, out: 3, speed: 1 }] },
      { id: 'a1', kind: 'audio', clips: [{ id: 'm1', type: 'audio', mediaId: 'mus', at: 0, in: 0, out: 3, speed: 0.25 }] },
    ],
  }, mediaById);
  const out = path.join(tmp, 'slow.mp4');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...buildFfmpegArgs(project, MEDIA, out)]);
  const info = probe(out);
  assert.ok(Number(info.format.duration) > 2.9);
});

test('rechaza proyectos vacíos y medios desconocidos', () => {
  assert.throws(() => buildFfmpegArgs({ tracks: [] }, MEDIA, 'o.mp4'), /no tiene contenido/);
  assert.throws(
    () => normalizeProject({ tracks: [{ id: 'v1', kind: 'video', clips: [
      { id: 'c', type: 'video', mediaId: 'nope', at: 0, in: 0, out: 1 }] }] }, mediaById),
    /Medio no encontrado/
  );
});

test('rechaza colores y rutas peligrosas en textos', () => {
  const project = normalizeProject({ tracks: [{ id: 'v1', kind: 'video', clips: [
    { id: 'c', type: 'video', mediaId: 'v1', at: 0, in: 0, out: 1 }] }] }, mediaById);
  project.tracks.push({ id: 't1', kind: 'text', clips: [
    { id: 'x', type: 'text', at: 0, dur: 1, text: 'a', x: 50, y: 50, size: 40, color: '#ffffff', bg: null, textFile: "/t'x.txt" }] });
  assert.throws(() => buildFfmpegArgs(project, MEDIA, 'o.mp4'), /Ruta no permitida/);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
