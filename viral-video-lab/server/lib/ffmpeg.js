const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

// Runs ffmpeg/ffprobe as a child process and processes stderr/stdout line-by-line,
// so nothing about the source video is ever buffered fully in Node memory -
// this is what lets a multi-hour / multi-GB file be processed the same as a 4s clip.
function runStreaming(bin, args, { onStderrLine, onStdoutData } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdoutChunks = [];

    if (onStdoutData) {
      child.stdout.on('data', onStdoutData);
    } else {
      child.stdout.on('data', (d) => stdoutChunks.push(d));
    }

    if (onStderrLine) {
      const rl = readline.createInterface({ input: child.stderr });
      rl.on('line', onStderrLine);
    } else {
      child.stderr.on('data', () => {});
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(stdoutChunks));
      else reject(new Error(`${path.basename(bin)} exited with code ${code}`));
    });
  });
}

function parseTimeToSeconds(hh, mm, ss) {
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss);
}

// ffprobe reads only the container header (moov/metadata), never the full stream,
// so this is fast and memory-safe regardless of file size or duration.
async function probe(filePath) {
  const args = [
    '-v', 'error',
    '-show_format',
    '-show_streams',
    '-of', 'json',
    filePath,
  ];
  const out = await runStreaming(ffprobePath, args);
  const json = JSON.parse(out.toString('utf8'));
  const videoStream = (json.streams || []).find((s) => s.codec_type === 'video') || {};
  const audioStream = (json.streams || []).find((s) => s.codec_type === 'audio') || null;
  const duration = Number(json.format?.duration ?? videoStream.duration ?? 0);
  let fps = 0;
  if (videoStream.avg_frame_rate && videoStream.avg_frame_rate !== '0/0') {
    const [n, d] = videoStream.avg_frame_rate.split('/').map(Number);
    fps = d ? n / d : n;
  }
  return {
    duration,
    width: videoStream.width || null,
    height: videoStream.height || null,
    codec: videoStream.codec_name || null,
    fps: fps ? Math.round(fps * 100) / 100 : null,
    hasAudio: Boolean(audioStream),
    sizeBytes: Number(json.format?.size ?? 0) || null,
  };
}

function makeProgressParser(totalDuration, onProgress) {
  const timeRe = /time=(\d+):(\d+):(\d+\.\d+)/;
  return (line) => {
    const m = timeRe.exec(line);
    if (m && onProgress && totalDuration > 0) {
      const t = parseTimeToSeconds(m[1], m[2], m[3]);
      onProgress(Math.min(1, t / totalDuration));
    }
  };
}

// Detects candidate scene-change timestamps (likely hook-end / climax / state-change
// boundaries) by streaming the video through ffmpeg's scene filter - it decodes frame
// by frame and only ever holds one frame in memory at a time.
async function detectSceneChanges(filePath, { duration, threshold = 0.35, onProgress } = {}) {
  const results = [];
  const showinfoRe = /pts_time:\s*([\d.]+)/;
  const progressParser = makeProgressParser(duration, onProgress);
  await runStreaming(
    ffmpegPath,
    ['-i', filePath, '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'],
    {
      onStderrLine: (line) => {
        const m = showinfoRe.exec(line);
        if (m) results.push(Number(m[1]));
        else progressParser(line);
      },
    }
  );
  return results;
}

// Detects silence intervals - used to auto-check the "ASMR puro o silencio en el
// climax" rule for producto content.
async function detectSilence(filePath, { duration, noiseDb = -30, minDuration = 0.3, onProgress } = {}) {
  const intervals = [];
  let pendingStart = null;
  const startRe = /silence_start:\s*([\d.]+)/;
  const endRe = /silence_end:\s*([\d.]+)/;
  const progressParser = makeProgressParser(duration, onProgress);
  await runStreaming(
    ffmpegPath,
    ['-i', filePath, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDuration}`, '-f', 'null', '-'],
    {
      onStderrLine: (line) => {
        const sm = startRe.exec(line);
        const em = endRe.exec(line);
        if (sm) pendingStart = Number(sm[1]);
        else if (em && pendingStart !== null) {
          intervals.push({ start: pendingStart, end: Number(em[1]) });
          pendingStart = null;
        } else {
          progressParser(line);
        }
      },
    }
  );
  return intervals;
}

// Thumbnail extraction. Two strategies:
//  - useHookWindow=true (Modo Ganadores): two passes - dense sampling (every 0.5s)
//    of the first 15s, because the hook rule is a FIXED duration (<=4s) no matter
//    how long the whole video is, then a coarser pass for the rest.
//  - useHookWindow=false (Modo Aprendizaje): one pass, uniform sampling across the
//    WHOLE duration, because a lesson/chapter can land anywhere in a long tutorial -
//    there's no reason to over-sample the first 15s and under-sample the rest.
// Either way, capped at ~280-300 frames so a 24h video still produces a manageable,
// fixed-size set of thumbnails. Frames are written to disk as ffmpeg produces them -
// never held in memory together.
async function generateThumbnails(filePath, outDir, duration, onProgress, { useHookWindow = true } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const hookWindow = useHookWindow ? Math.min(15, duration) : 0;
  const hookInterval = 0.5;
  const overviewStart = hookWindow;
  const overviewDuration = Math.max(0, duration - overviewStart);
  const overviewTargetCount = useHookWindow ? 280 : 300;
  const overviewInterval = overviewDuration > 0 ? Math.max(useHookWindow ? 1 : 0.5, overviewDuration / overviewTargetCount) : null;

  const frames = [];

  if (hookWindow > 0) {
    await runStreaming(
      ffmpegPath,
      [
        '-ss', '0', '-t', String(hookWindow), '-i', filePath,
        '-vf', `fps=${1 / hookInterval},scale=320:-2`,
        '-q:v', '4',
        path.join(outDir, 'hook_%05d.jpg'),
      ],
      { onStderrLine: makeProgressParser(hookWindow, (p) => onProgress && onProgress(p * 0.3)) }
    );
    const files = fs.readdirSync(outDir).filter((f) => f.startsWith('hook_')).sort();
    files.forEach((f, i) => frames.push({ t: Math.round(i * hookInterval * 100) / 100, file: `thumbs/${f}` }));
  }

  if (overviewInterval) {
    await runStreaming(
      ffmpegPath,
      [
        '-ss', String(overviewStart), '-i', filePath,
        '-vf', `fps=${1 / overviewInterval},scale=320:-2`,
        '-q:v', '4',
        path.join(outDir, 'overview_%05d.jpg'),
      ],
      {
        onStderrLine: makeProgressParser(overviewDuration, (p) => onProgress && onProgress(0.3 + p * 0.7)),
      }
    );
    const files = fs.readdirSync(outDir).filter((f) => f.startsWith('overview_')).sort();
    files.forEach((f, i) =>
      frames.push({ t: Math.round((overviewStart + i * overviewInterval) * 100) / 100, file: `thumbs/${f}` })
    );
  }

  frames.sort((a, b) => a.t - b.t);
  return frames;
}

module.exports = {
  probe,
  detectSceneChanges,
  detectSilence,
  generateThumbnails,
};
