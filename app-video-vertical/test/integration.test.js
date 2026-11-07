'use strict';

// Pruebas con FFmpeg real. Se omiten si FFmpeg no está instalado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hasFfmpeg, makeFixtures } = require('./helpers');

process.env.VV_DISABLE_OCR = '1';

test('integración con FFmpeg', { skip: !hasFfmpeg && 'FFmpeg no instalado' }, async (t) => {
  const fx = makeFixtures();
  const { probe } = require('../src/ffmpeg');
  const { analyzeSong } = require('../src/music');
  const { generate } = require('../src/project');
  const viral = require('../src/viral');
  const { separateBasic } = require('../src/separate');

  await t.test('detecta el momento fuerte de la canción', async () => {
    const r = await analyzeSong(fx.song);
    assert.ok(Math.abs(r.drop - 4) < 0.15, `drop ${r.drop}`);
  });

  await t.test('genera vídeos verticales con música alineada al producto', async () => {
    const outDir = path.join(fx.dir, 'salida');
    const videos = await generate({
      roles: { apertura: [fx.a1, fx.a2], demo: [fx.d1], cierre: [fx.c1] },
      count: 5,
      resolution: '720p',
      music: { path: fx.song },
      outDir,
    });
    assert.equal(videos.length, 2, 'solo hay 2 combinaciones posibles');
    for (const v of videos) {
      const p = await probe(v.file);
      assert.equal(p.width, 720);
      assert.equal(p.height, 1280);
      assert.ok(Math.abs(p.duration - 6) < 0.2);
      assert.ok(p.hasAudio);
      assert.deepEqual(v.music, { start: 2, delay: 0 }); // drop 4 s - producto en 2 s
    }
    // El momento fuerte suena cuando entra el producto (segundo 2).
    const inVideo = await analyzeSong(videos[0].file);
    assert.ok(Math.abs(inVideo.drop - 2) < 0.2, `drop en el vídeo ${inVideo.drop}`);
  });

  await t.test('analiza los planos de un vídeo', async () => {
    const r = await viral.analyze(fx.viral, { workDir: path.join(fx.dir, 'viral'), ocr: false });
    assert.equal(r.summary.shots, 3);
    assert.deepEqual(r.shots.map((s) => s.start), [0, 1.52, 3.52]);
    for (const s of r.shots) assert.ok(fs.existsSync(s.frame));
  });

  await t.test('separación básica produce voz y música', async () => {
    const r = await separateBasic(fx.song, path.join(fx.dir, 'sep'));
    assert.ok(fs.statSync(r.voice).size > 1000);
    assert.ok(fs.statSync(r.music).size > 1000);
  });

  fs.rmSync(fx.dir, { recursive: true, force: true });
});
