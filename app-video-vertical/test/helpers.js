'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

function ff(args) {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
}

// Material de prueba: clips con y sin audio, canción con drop en el segundo 4 y vídeo con 3 planos.
function makeFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-test-'));
  const clip = (name, color, withAudio = true) => {
    const out = path.join(dir, name);
    const args = ['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=25:d=2`];
    if (withAudio) args.push('-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest');
    ff([...args, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(withAudio ? ['-c:a', 'aac'] : []), out]);
    return out;
  };
  const files = {
    dir,
    a1: clip('a1.mp4', 'red'),
    a2: clip('a2.mp4', 'orange', false),
    d1: clip('d1.mp4', 'blue'),
    c1: clip('c1.mp4', 'green'),
    song: path.join(dir, 'cancion.m4a'),
    viral: path.join(dir, 'viral.mp4'),
  };
  ff(['-f', 'lavfi', '-i', "aevalsrc='if(lt(t,4),0.05,0.8)*sin(2*PI*220*t)':d=10:s=44100", files.song]);
  ff([
    '-f', 'lavfi', '-i', 'color=c=red:s=360x640:d=1.5',
    '-f', 'lavfi', '-i', 'color=c=blue:s=360x640:d=2',
    '-f', 'lavfi', '-i', 'color=c=green:s=360x640:d=1.5',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', files.viral,
  ]);
  return files;
}

module.exports = { hasFfmpeg, makeFixtures };
