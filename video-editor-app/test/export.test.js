'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildFfmpegArgs } = require('../lib/export');

const run = promisify(execFile);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 've-test-'));

// Genera dos clips de prueba: uno con audio (tono) y otro sin audio.
function makeSamples() {
  const withAudio = path.join(tmp, 'a.mp4');
  const noAudio = path.join(tmp, 'b.mp4');
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', withAudio]);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=red:size=1920x1080:rate=30:duration=3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', noAudio]);
  return { withAudio, noAudio };
}

function probe(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json',
    '-show_streams', '-show_format', file]);
  return JSON.parse(out);
}

test('exporta clips recortados, sin audio y con texto', async () => {
  const { withAudio, noAudio } = makeSamples();
  const textFile = path.join(tmp, 't0.txt');
  fs.writeFileSync(textFile, 'Hola: 100% "CapCut" \\ test');

  const media = {
    a: { path: withAudio, hasAudio: true },
    b: { path: noAudio, hasAudio: false },
  };
  const project = {
    width: 1280, height: 720, fps: 30,
    clips: [
      { mediaId: 'a', start: 1, end: 3 },   // 2 s
      { mediaId: 'b', start: 0, end: 1.5 }, // 1.5 s, sin audio
    ],
    texts: [{ textFile, start: 0, end: 2, position: 'bottom', size: 60, color: '#ffff00' }],
  };
  const out = path.join(tmp, 'out.mp4');
  const args = buildFfmpegArgs(project, media, out);
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);

  const info = probe(out);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  assert.ok(v, 'debe tener video');
  assert.ok(a, 'debe tener audio');
  assert.equal(v.width, 1280);
  assert.equal(v.height, 720);
  const dur = Number(info.format.duration);
  assert.ok(Math.abs(dur - 3.5) < 0.15, `duración esperada ~3.5 s, obtenida ${dur}`);
});

test('rechaza clips inválidos y medios desconocidos', () => {
  const media = { a: { path: '/x.mp4', hasAudio: true } };
  assert.throws(() => buildFfmpegArgs({ clips: [] }, media, 'o.mp4'), /no tiene clips/);
  assert.throws(
    () => buildFfmpegArgs({ clips: [{ mediaId: 'zz', start: 0, end: 1 }] }, media, 'o.mp4'),
    /Medio no encontrado/
  );
  assert.throws(
    () => buildFfmpegArgs({ clips: [{ mediaId: 'a', start: 2, end: 1 }] }, media, 'o.mp4'),
    /final debe ser mayor/
  );
});

test('rechaza colores y rutas peligrosas', () => {
  const media = { a: { path: '/x.mp4', hasAudio: true } };
  const base = { clips: [{ mediaId: 'a', start: 0, end: 1 }] };
  assert.throws(
    () => buildFfmpegArgs({ ...base, texts: [{ textFile: '/t.txt', start: 0, end: 1, color: 'red:x' }] }, media, 'o.mp4'),
    /Color inválido/
  );
  assert.throws(
    () => buildFfmpegArgs({ ...base, texts: [{ textFile: "/t'x.txt", start: 0, end: 1, color: '#fff000' }] }, media, 'o.mp4'),
    /Ruta no permitida/
  );
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
