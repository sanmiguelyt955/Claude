const { v4: uuid } = require('uuid');

const jobs = new Map();

function createJob(videoPath, interval) {
  const id = uuid();
  const job = {
    id,
    videoPath,
    interval,
    status: 'pending',
    progress: 0,
    error: null,
    result: null,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

function getJob(id) {
  return jobs.get(id);
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  if (typeof patch.progress === 'number') {
    patch.progress = Math.max(job.progress || 0, patch.progress);
  }
  Object.assign(job, patch);
  jobs.set(id, job);
  return job;
}

module.exports = { createJob, getJob, updateJob };
