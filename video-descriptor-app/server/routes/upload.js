const express = require('express');
const path = require('path');
const fs = require('fs');
const busboy = require('busboy');
const archiver = require('archiver');
const ffmpeg = require('../lib/ffmpeg');
const jobs = require('../lib/jobs');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
const PACKAGES_DIR = path.join(__dirname, '..', '..', 'data', 'packages');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(PACKAGES_DIR, { recursive: true });

// Picks `count` items evenly spaced across the array (always includes first and last).
function pickEvenlySpaced(items, count) {
  if (items.length <= count) return items;
  if (count <= 1) return [items[0]];
  const step = (items.length - 1) / (count - 1);
  const picked = [];
  for (let i = 0; i < count; i++) {
    picked.push(items[Math.round(i * step)]);
  }
  return picked;
}

module.exports = function buildUploadRouter() {
  const router = express.Router();

  // Upload video
  router.post('/upload', (req, res) => {
    const bb = busboy({ headers: req.headers });
    let uploadPath = null;
    let interval = 1;

    bb.on('file', (fieldname, file, info) => {
      if (fieldname === 'video') {
        const filename = `${Date.now()}_${info.filename}`;
        uploadPath = path.join(UPLOADS_DIR, filename);
        file.pipe(fs.createWriteStream(uploadPath));
      }
    });

    bb.on('field', (fieldname, val) => {
      if (fieldname === 'interval') {
        interval = parseFloat(val) || 1;
      }
    });

    bb.on('close', async () => {
      if (!uploadPath) return res.status(400).json({ error: 'No video file' });

      try {
        const { duration } = await ffmpeg.probe(uploadPath);
        const job = jobs.createJob(uploadPath, interval);
        job.duration = duration;
        jobs.updateJob(job.id, { duration });

        // Start processing in background
        (async () => {
          try {
            jobs.updateJob(job.id, { status: 'processing' });

            const framesDir = path.join(PACKAGES_DIR, job.id, 'frames');
            const audioPath = path.join(PACKAGES_DIR, job.id, 'audio.wav');

            fs.mkdirSync(framesDir, { recursive: true });

            // Extract frames (60% of progress)
            const frames = await ffmpeg.extractFrames(
              uploadPath,
              framesDir,
              duration,
              interval,
              (p) => jobs.updateJob(job.id, { progress: p * 0.6 })
            );

            // Extract audio (30% of progress)
            await ffmpeg.extractAudio(
              uploadPath,
              audioPath
            );
            jobs.updateJob(job.id, { progress: 0.9 });

            // Create index.json
            const indexPath = path.join(PACKAGES_DIR, job.id, 'index.json');
            fs.writeFileSync(indexPath, JSON.stringify({
              duration,
              interval,
              frameCount: frames.length,
              frames: frames.map(f => ({
                filename: f.filename,
                timestamp: f.timestamp,
              }))
            }, null, 2));

            jobs.updateJob(job.id, {
              status: 'ready',
              progress: 1,
              result: { jobId: job.id, duration, frameCount: frames.length }
            });
          } catch (err) {
            jobs.updateJob(job.id, { status: 'error', error: err.message });
          }
        })();

        res.json({ jobId: job.id, duration });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    req.pipe(bb);
  });

  // Get job status
  router.get('/job/:id', (req, res) => {
    const job = jobs.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  // Generate blocks: segment audio + group frames into fixed-duration chunks
  router.post('/blocks/:id', async (req, res) => {
    const jobId = req.params.id;
    const packageDir = path.join(PACKAGES_DIR, jobId);
    const indexPath = path.join(packageDir, 'index.json');
    const audioPath = path.join(packageDir, 'audio.wav');

    if (!fs.existsSync(indexPath) || !fs.existsSync(audioPath)) {
      return res.status(400).json({ error: 'Job not ready or not found on disk' });
    }

    const blockDuration = parseFloat(req.body?.blockDuration) || 60;
    const keyFrameCount = parseInt(req.body?.keyFrameCount, 10) || 4;

    try {
      const blocksDir = path.join(packageDir, 'blocks');

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

      const audioFiles = await ffmpeg.segmentAudio(audioPath, blocksDir, blockDuration);

      const blocks = audioFiles.map((filename, i) => {
        const startTime = i * blockDuration;
        const endTime = Math.min(startTime + blockDuration, index.duration);
        const frames = index.frames.filter(
          f => f.timestamp >= startTime && f.timestamp < endTime
        );
        return {
          blockIndex: i,
          startTime,
          endTime,
          audioFile: `blocks/${filename}`,
          frameCount: frames.length,
          keyFrames: pickEvenlySpaced(frames, keyFrameCount)
            .map(f => ({ filename: f.filename, timestamp: f.timestamp })),
          frames: frames.map(f => ({ filename: f.filename, timestamp: f.timestamp })),
        };
      });

      const manifest = {
        jobId,
        duration: index.duration,
        blockDuration,
        keyFrameCount,
        blockCount: blocks.length,
        note: 'Para analisis normal, lee solo "keyFrames" de cada bloque (ya es una muestra representativa). Usa "frames" (el listado completo) unicamente si necesitas inspeccionar un patron visual fino, como Store Reveal, frame a frame.',
        blocks,
      };

      fs.writeFileSync(
        path.join(packageDir, 'blocks.json'),
        JSON.stringify(manifest, null, 2)
      );

      res.json(manifest);
    } catch (err) {
      console.error('BLOCKS ERROR:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get blocks manifest (if already generated)
  router.get('/blocks/:id', (req, res) => {
    const jobId = req.params.id;
    const manifestPath = path.join(PACKAGES_DIR, jobId, 'blocks.json');
    if (!fs.existsSync(manifestPath)) {
      return res.status(404).json({ error: 'Blocks not generated yet' });
    }
    res.json(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
  });

  // Download package as ZIP
  router.get('/download/:id', async (req, res) => {
    const jobId = req.params.id;
    const job = jobs.getJob(jobId);
    if (!job || job.status !== 'ready') {
      return res.status(400).json({ error: 'Package not ready' });
    }

    try {
      const packageDir = path.join(PACKAGES_DIR, jobId);
      const zipPath = path.join(PACKAGES_DIR, `${jobId}.zip`);

      const output = fs.createWriteStream(zipPath);
      const archive = require('archiver')('zip', { zlib: { level: 9 } });

      archive.on('error', (err) => {
        res.status(500).json({ error: err.message });
      });

      output.on('close', () => {
        res.download(zipPath, `video-descriptor-${jobId}.zip`, (err) => {
          if (!err) fs.unlink(zipPath, () => {});
        });
      });

      archive.pipe(output);
      archive.directory(packageDir, false);
      archive.finalize();
    } catch (err) {
      console.error('DOWNLOAD ERROR:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
