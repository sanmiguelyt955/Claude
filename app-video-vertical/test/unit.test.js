'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findDrop, alignMusic, waveformPeaks } = require('../src/music');
const { shotsFromCuts } = require('../src/viral');
const { compareVersions, checkForUpdate } = require('../src/updates');
const { buildFfmpegArgs } = require('../src/render');
const { safeName } = require('../src/workspace');

test('findDrop localiza la mayor subida de energía', () => {
  const env = new Float32Array(200).fill(0.05); // 10 s con ventanas de 0,05 s
  for (let i = 120; i < 200; i++) env[i] = 0.9; // sube en el segundo 6
  assert.equal(findDrop(env, 0.05).time.toFixed(2), '6.00');
});

test('alignMusic: la canción empieza más adelante si el drop es posterior al producto', () => {
  assert.deepEqual(alignMusic(10, 3), { start: 7, delay: 0 });
});

test('alignMusic: la música entra con retraso si el drop es anterior al producto', () => {
  assert.deepEqual(alignMusic(1.5, 4), { start: 0, delay: 2.5 });
});

test('waveformPeaks normaliza entre 0 y 1', () => {
  const peaks = waveformPeaks(Float32Array.from([0, 0.5, 1, 0.25]), 4);
  assert.deepEqual(peaks, [0, 0.5, 1, 0.25]);
});

test('shotsFromCuts crea planos y fusiona los muy cortos', () => {
  const shots = shotsFromCuts([1.5, 1.6, 4], 6);
  assert.deepEqual(
    shots.map((s) => [s.start, s.end]),
    [[0, 1.6], [1.6, 4], [4, 6]]
  );
});

test('compareVersions', () => {
  assert.equal(compareVersions('0.3.0', '0.2.9'), 1);
  assert.equal(compareVersions('v1.0.0', '1.0'), 0);
  assert.equal(compareVersions('1.2.0', '1.10.0'), -1);
});

test('checkForUpdate avisa de versión nueva y no lanza si falla la red', async () => {
  const ok = await checkForUpdate({
    current: '0.2.0',
    url: 'x',
    fetchImpl: async () => ({ ok: true, json: async () => ({ version: '0.3.0', notas: 'Mejoras', descargas: {} }) }),
  });
  assert.equal(ok.available, true);
  assert.equal(ok.latest, '0.3.0');
  const ko = await checkForUpdate({ current: '0.2.0', url: 'x', fetchImpl: async () => { throw new Error('sin red'); } });
  assert.equal(ko.available, false);
  assert.match(ko.error, /sin red/);
});

test('render: clip sin audio usa silencio de su duración', () => {
  const args = buildFfmpegArgs([{ path: 'a.mp4', hasAudio: false, duration: 2 }, 'b.mp4'], 'o.mp4');
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.match(filter, /anullsrc=r=48000:cl=stereo,atrim=0:2/);
  assert.equal(args.filter((a) => a === '-i').length, 2);
});

test('render: música alineada, mezclada y 4K sin metadatos', () => {
  const clips = [{ path: 'a.mp4', hasAudio: true, duration: 2 }, { path: 'b.mp4', hasAudio: true, duration: 3 }];
  const args = buildFfmpegArgs(clips, 'o.mp4', { resolution: '4k', music: { path: 'm.mp3', start: 7, delay: 0, volume: 0.8 } });
  const filter = args[args.indexOf('-filter_complex') + 1];
  assert.match(filter, /scale=2160:3840/);
  assert.match(filter, /\[2:a\]atrim=start=7/);
  assert.match(filter, /volume=0.8/);
  assert.match(filter, /amix=inputs=2:duration=first/);
  assert.match(filter, /afade=t=out:st=4.40/);
  assert.equal(args[args.indexOf('-map_metadata') + 1], '-1');
  assert.ok(args.includes('+bitexact'));
});

test('safeName limpia rutas y caracteres raros', () => {
  assert.equal(safeName('../../etc/pass wd?.mp4'), 'pass wd_.mp4');
  assert.equal(safeName('Clip ñandú.mov'), 'Clip ñandú.mov');
});
