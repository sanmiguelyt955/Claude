const { newId } = require('./store');

// In-memory job tracker. Analysis of a long video runs as a background job instead
// of inside a single HTTP request, so a 75-minute (or 24h) file never causes a
// request timeout - the UI polls status/progress instead of waiting on one call.
const jobs = new Map();

function createJob(videoId, type) {
  const id = newId();
  const job = {
    id,
    videoId,
    type,
    status: 'queued',
    progress: 0,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(id, job);
  return job;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  // Scene-detect and silence-detect run concurrently and both report progress into
  // the same job, so raw updates can arrive out of order - clamp to non-decreasing
  // so the UI progress bar never visibly jumps backward.
  if (typeof patch.progress === 'number') {
    patch.progress = Math.max(job.progress || 0, patch.progress);
  }
  Object.assign(job, patch);
  jobs.set(id, job);
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function getLatestJobForVideo(videoId, type) {
  let latest = null;
  for (const job of jobs.values()) {
    if (job.videoId !== videoId) continue;
    if (type && job.type !== type) continue;
    if (!latest || job.startedAt > latest.startedAt) latest = job;
  }
  return latest;
}

function runJob(job, workFn) {
  updateJob(job.id, { status: 'running' });
  workFn((progress) => updateJob(job.id, { progress }))
    .then((result) => updateJob(job.id, { status: 'done', progress: 1, finishedAt: Date.now(), result }))
    .catch((err) => updateJob(job.id, { status: 'error', error: err.message, finishedAt: Date.now() }));
}

module.exports = { createJob, updateJob, getJob, getLatestJobForVideo, runJob };
