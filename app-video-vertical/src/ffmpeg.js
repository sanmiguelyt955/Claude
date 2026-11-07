'use strict';

const { spawn } = require('node:child_process');

// Ruta a los binarios: variable de entorno, paquete ffmpeg-static (si está instalado) o PATH.
function resolveBinary(name) {
  const envName = name === 'ffmpeg' ? 'VV_FFMPEG' : 'VV_FFPROBE';
  if (process.env[envName]) return process.env[envName];
  try {
    if (name === 'ffmpeg') {
      const p = require('ffmpeg-static');
      if (p) return p;
    } else {
      const p = require('ffprobe-static');
      if (p && p.path) return p.path;
    }
  } catch {
    // paquete opcional no instalado
  }
  return name;
}

const FFMPEG = resolveBinary('ffmpeg');
const FFPROBE = resolveBinary('ffprobe');

// Ejecuta un binario y devuelve stdout. `onStderr` permite leer el progreso.
function run(bin, args, { onStderr, signal, encoding = 'utf8' } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { signal });
    const out = [];
    let err = '';
    proc.stdout.on('data', (d) => out.push(d));
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      err += s;
      if (err.length > 20000) err = err.slice(-20000);
      if (onStderr) onStderr(s);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      const buf = Buffer.concat(out);
      if (code === 0) resolve(encoding ? buf.toString(encoding) : buf);
      else reject(new Error(`${bin} terminó con código ${code}: ${err.trim().split('\n').slice(-5).join('\n')}`));
    });
  });
}

const ffmpeg = (args, opts) => run(FFMPEG, args, opts);

// Información básica de un archivo multimedia.
async function probe(file) {
  const json = await run(FFPROBE, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
  ]);
  const data = JSON.parse(json);
  const video = data.streams.find((s) => s.codec_type === 'video');
  const audio = data.streams.find((s) => s.codec_type === 'audio');
  return {
    path: file,
    duration: Number(data.format.duration) || 0,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    width: video ? video.width : 0,
    height: video ? video.height : 0,
  };
}

// Decodifica el audio a PCM mono float32 para analizarlo en JavaScript.
async function decodeMono(file, sampleRate = 11025) {
  const buf = await run(
    FFMPEG,
    ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1'],
    { encoding: null }
  );
  const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  return { samples: Float32Array.from(samples), sampleRate };
}

module.exports = { FFMPEG, FFPROBE, run, ffmpeg, probe, decodeMono };
