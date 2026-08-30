const express = require('express');
const store = require('../lib/store');
const ffmpeg = require('../lib/ffmpeg');
const jobs = require('../lib/jobs');

module.exports = function buildAnalyzeRouter() {
  const router = express.Router();

  // Kicks off the ffmpeg pipeline as a background job (scene-change candidates +
  // silence intervals + two-pass thumbnails). Returns immediately with a jobId so a
  // 24h video doesn't hold an HTTP request open - the UI polls /analyze/status.
  router.post('/videos/:id/analyze', async (req, res) => {
    const video = store.getVideo(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video no encontrado' });

    const job = jobs.createJob(video.id, 'analyze');
    res.json({ jobId: job.id });

    jobs.runJob(job, async (setProgress) => {
      const probe = video.probe || (await ffmpeg.probe(video.path));
      if (!video.probe) store.upsertVideo({ id: video.id, probe });
      const duration = probe.duration;

      const dir = store.videoDir(video.id);
      const thumbsDir = require('path').join(dir, 'thumbs');

      const [sceneChanges, silenceIntervals] = await Promise.all([
        ffmpeg.detectSceneChanges(video.path, { duration, onProgress: (p) => setProgress(p * 0.35) }),
        ffmpeg.detectSilence(video.path, { duration, onProgress: (p) => setProgress(0.35 + p * 0.15) }),
      ]);
      const thumbnails = await ffmpeg.generateThumbnails(
        video.path,
        thumbsDir,
        duration,
        (p) => setProgress(0.5 + p * 0.5),
        { useHookWindow: (video.category || 'viral') === 'viral' }
      );

      const frameIndex = {
        video_id: video.id,
        duration,
        generated_at: Date.now(),
        scene_changes: sceneChanges,
        silence_intervals: silenceIntervals,
        thumbnails,
      };
      store.writeJSON(require('path').join(dir, 'frame_index.json'), frameIndex);
      return { frameIndexPath: `data/library/${video.id}/frame_index.json` };
    });
  });

  router.get('/videos/:id/analyze/status', (req, res) => {
    const job = jobs.getLatestJobForVideo(req.params.id, 'analyze');
    if (!job) return res.status(404).json({ error: 'No hay análisis en curso ni previo para este video.' });
    res.json(job);
  });

  router.get('/videos/:id/frames', (req, res) => {
    const dir = store.videoDir(req.params.id);
    const frameIndex = store.readJSON(require('path').join(dir, 'frame_index.json'), null);
    if (!frameIndex) return res.status(404).json({ error: 'Todavía no se ha analizado este video.' });
    res.json({
      ...frameIndex,
      thumbnails: frameIndex.thumbnails.map((t) => ({ ...t, url: `/library/${req.params.id}/${t.file}` })),
    });
  });

  return router;
};
