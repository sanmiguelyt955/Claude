const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

function probe(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ]);

    let output = '';
    proc.stdout.on('data', (chunk) => { output += chunk; });
    proc.stderr.on('data', (chunk) => { console.error('ffprobe err:', chunk.toString()); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed with code ${code}`));
      try {
        const data = JSON.parse(output);
        const duration = parseFloat(data.format?.duration || 0);
        resolve({ duration });
      } catch (e) {
        reject(e);
      }
    });
  });
}

function extractFrames(filePath, outDir, duration, interval, onProgress) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outDir, { recursive: true });

    const fps = 1 / interval;
    const totalFrames = Math.ceil(duration / interval);

    const proc = spawn(ffmpegPath, [
      '-i', filePath,
      '-vf', `fps=${fps}`,
      '-q:v', '2',
      path.join(outDir, '%04d.jpg')
    ]);

    let frameCount = 0;
    proc.stderr.on('data', (chunk) => {
      const line = chunk.toString();
      if (line.includes('frame=')) {
        frameCount = parseInt(line.match(/frame=\s*(\d+)/)?.[1] || frameCount);
        if (onProgress && totalFrames > 0) {
          onProgress(Math.min(frameCount / totalFrames, 1));
        }
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg extract frames failed: ${code}`));

      const frames = fs.readdirSync(outDir)
        .filter(f => f.endsWith('.jpg'))
        .sort()
        .map((f, i) => ({
          filename: f,
          timestamp: i * interval,
          index: i
        }));

      resolve(frames);
    });

    proc.on('error', reject);
  });
}

function extractAudio(filePath, outPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-i', filePath,
      '-q:a', '9',
      '-map', 'a:0',
      outPath
    ]);

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg extract audio failed: ${code}`));
      resolve(outPath);
    });

    proc.on('error', reject);
  });
}

function segmentAudio(audioPath, outDir, blockDuration) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(outDir, { recursive: true });

    const proc = spawn(ffmpegPath, [
      '-i', audioPath,
      '-f', 'segment',
      '-segment_time', String(blockDuration),
      '-q:a', '2',
      '-map', '0:a',
      '-reset_timestamps', '1',
      path.join(outDir, 'block_%03d.mp3')
    ]);

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg segment audio failed: ${code}\n${stderr}`));

      const files = fs.readdirSync(outDir)
        .filter(f => f.startsWith('block_') && f.endsWith('.mp3'))
        .sort();

      resolve(files);
    });

    proc.on('error', reject);
  });
}

module.exports = { probe, extractFrames, extractAudio, segmentAudio };
