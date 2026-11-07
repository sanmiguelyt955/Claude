'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { run, ffmpeg } = require('./ffmpeg');

const PYTHON = process.env.VV_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const MODEL = process.env.VV_DEMUCS_MODEL || 'htdemucs';

let demucsAvailable = null;
async function hasDemucs() {
  if (demucsAvailable !== null) return demucsAvailable;
  try {
    await run(PYTHON, ['-c', 'import demucs']);
    demucsAvailable = true;
  } catch {
    demucsAvailable = false;
  }
  return demucsAvailable;
}

// Separación con IA (Demucs). Devuelve rutas a voz y música.
async function separateWithDemucs(file, outDir, { onStderr } = {}) {
  const work = path.join(outDir, '.demucs');
  // Se extrae el audio a WAV para que Demucs acepte también vídeos.
  const wav = path.join(outDir, 'entrada.wav');
  await ffmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '2', '-ar', '44100', wav]);
  await run(PYTHON, ['-m', 'demucs', '--two-stems=vocals', '-n', MODEL, '-o', work, wav], { onStderr });
  const stemDir = path.join(work, MODEL, 'entrada');
  const voice = path.join(outDir, 'voz.wav');
  const music = path.join(outDir, 'musica.wav');
  fs.renameSync(path.join(stemDir, 'vocals.wav'), voice);
  fs.renameSync(path.join(stemDir, 'no_vocals.wav'), music);
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(wav, { force: true });
  return { voice, music, method: 'demucs' };
}

// Respaldo sin IA: la voz suele estar en el centro de la mezcla estéreo.
// Voz ≈ canal central filtrado a la banda vocal; música ≈ diferencia entre canales.
// Es menos preciso que Demucs, sobre todo con música mono.
async function separateBasic(file, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const voice = path.join(outDir, 'voz.wav');
  const music = path.join(outDir, 'musica.wav');
  await ffmpeg([
    '-y', '-hide_banner', '-loglevel', 'error', '-i', file, '-vn',
    '-filter_complex',
    '[0:a]aformat=channel_layouts=stereo,asplit=2[a][b];' +
      '[a]pan=mono|c0=0.5*c0+0.5*c1,highpass=f=120,lowpass=f=6000,afftdn=nf=-25[v];' +
      '[b]pan=stereo|c0=c0-c1|c1=c1-c0[m]',
    '-map', '[v]', voice, '-map', '[m]', music,
  ]);
  return { voice, music, method: 'basico' };
}

async function separate(file, outDir, { method = 'auto', onStderr } = {}) {
  if (!fs.existsSync(file)) throw new Error(`No existe: ${file}`);
  fs.mkdirSync(outDir, { recursive: true });
  const useAi = method === 'demucs' || (method === 'auto' && (await hasDemucs()));
  if (method === 'demucs' && !(await hasDemucs())) {
    throw new Error('Demucs no está instalado. Instálalo con: pip install demucs');
  }
  return useAi ? separateWithDemucs(file, outDir, { onStderr }) : separateBasic(file, outDir);
}

module.exports = { hasDemucs, separate, separateBasic, separateWithDemucs };
