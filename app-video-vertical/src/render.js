'use strict';

const { spawn } = require('node:child_process');

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

// Construye los argumentos de FFmpeg para unir clips en un único vídeo vertical.
// Cada clip se escala para cubrir 1080x1920 y se recorta al centro; luego se concatena.
function buildFfmpegArgs(clips, output, { width = WIDTH, height = HEIGHT, fps = FPS } = {}) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  for (const clip of clips) args.push('-i', clip);

  const parts = [];
  const labels = [];
  clips.forEach((_, i) => {
    parts.push(
      `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
        `crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p[v${i}];` +
        `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`
    );
    labels.push(`[v${i}][a${i}]`);
  });
  parts.push(`${labels.join('')}concat=n=${clips.length}:v=1:a=1[outv][outa]`);

  args.push(
    '-filter_complex', parts.join(';'),
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    output
  );
  return args;
}

function renderVideo(clips, output, options) {
  const args = buildFfmpegArgs(clips, output, options);
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`ffmpeg terminó con código ${code}: ${stderr.trim()}`));
    });
  });
}

module.exports = { buildFfmpegArgs, renderVideo, WIDTH, HEIGHT, FPS };
