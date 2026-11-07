'use strict';

const { decodeMono } = require('./ffmpeg');

// Energía RMS por ventanas de `windowSec` segundos.
function energyEnvelope(samples, sampleRate, windowSec = 0.05) {
  const size = Math.max(1, Math.round(sampleRate * windowSec));
  const count = Math.floor(samples.length / size);
  const env = new Float32Array(count);
  for (let w = 0; w < count; w++) {
    let sum = 0;
    const start = w * size;
    for (let i = start; i < start + size; i++) sum += samples[i] * samples[i];
    env[w] = Math.sqrt(sum / size);
  }
  return { env, windowSec };
}

// Busca el "momento fuerte": el instante donde la energía de los segundos siguientes
// supera más a la de los anteriores (típico de un drop o de la entrada del estribillo).
function findDrop(env, windowSec, { before = 2, after = 2, minTime = 1 } = {}) {
  const b = Math.round(before / windowSec);
  const a = Math.round(after / windowSec);
  const prefix = new Float64Array(env.length + 1);
  for (let i = 0; i < env.length; i++) prefix[i + 1] = prefix[i] + env[i];
  const mean = (from, to) => (prefix[to] - prefix[from]) / Math.max(1, to - from);

  let best = { time: 0, score: -Infinity };
  const startIdx = Math.max(b, Math.round(minTime / windowSec));
  for (let i = startIdx; i + a <= env.length; i++) {
    const score = mean(i, i + a) - mean(i - b, i);
    if (score > best.score) best = { time: i * windowSec, score };
  }
  if (best.score === -Infinity) return { time: 0, score: 0 };
  return best;
}

// Envolvente reducida para dibujar la forma de onda en la interfaz.
function waveformPeaks(env, points = 400) {
  const step = Math.max(1, Math.floor(env.length / points));
  const peaks = [];
  let max = 0;
  for (let i = 0; i < env.length; i += step) {
    let m = 0;
    for (let j = i; j < Math.min(env.length, i + step); j++) m = Math.max(m, env[j]);
    peaks.push(m);
    max = Math.max(max, m);
  }
  return peaks.map((p) => (max ? Number((p / max).toFixed(3)) : 0));
}

async function analyzeSong(file) {
  const { samples, sampleRate } = await decodeMono(file);
  const { env, windowSec } = energyEnvelope(samples, sampleRate);
  const drop = findDrop(env, windowSec);
  return {
    duration: samples.length / sampleRate,
    drop: Number(drop.time.toFixed(2)),
    peaks: waveformPeaks(env),
  };
}

// Calcula cómo colocar la canción para que su momento fuerte (`drop`)
// caiga justo cuando aparece el producto (`productTime`, en segundos del vídeo).
//  - start: segundo de la canción por el que empieza a sonar.
//  - delay: segundos de silencio antes de que entre la música.
function alignMusic(drop, productTime) {
  const diff = drop - productTime;
  return diff >= 0
    ? { start: Number(diff.toFixed(3)), delay: 0 }
    : { start: 0, delay: Number((-diff).toFixed(3)) };
}

module.exports = { energyEnvelope, findDrop, waveformPeaks, analyzeSong, alignMusic };
