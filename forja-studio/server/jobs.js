// Ciclo de vida de un job: queued → in_progress → completed | failed | nsfw | canceled.
// Los créditos se cobran al crear y se devuelven si el job no termina con éxito.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getModel, normalizeParams, computeCost, httpError } = require('./catalog');

const TERMINAL = new Set(['completed', 'failed', 'nsfw', 'canceled']);

function createJobService({ store, provider, concurrency = 2, pollMs = 1500, publicBaseUrl = '', fetchImpl = fetch }) {
  const { db } = store;
  let ticking = false;
  let timer = null;

  function prepare(jobType, rawParams) {
    const model = getModel(jobType);
    if (!model) throw httpError(404, `Modelo desconocido: ${jobType}`);
    if (!provider.supports(model)) throw httpError(422, `${model.name} no está disponible en el proveedor ${provider.name}`);
    const params = normalizeParams(model, rawParams);
    for (const m of params.medias) {
      const media = db.media[m.id];
      if (!media || media.status !== 'uploaded') throw httpError(400, `Media ${m.id} no subida`);
    }
    return { model, params, credits: computeCost(model, params) };
  }

  function estimate(jobType, rawParams) {
    const { credits } = prepare(jobType, rawParams);
    return { credits, balance: db.user.credits };
  }

  function create(jobType, rawParams) {
    const { model, params, credits } = prepare(jobType, rawParams);
    if (db.user.credits < credits) throw httpError(402, `Créditos insuficientes: necesitas ${credits}, tienes ${db.user.credits}`);
    db.user.credits -= credits;
    const job = {
      id: crypto.randomUUID(),
      job_type: jobType,
      type: model.type,
      model_name: model.name,
      status: 'queued',
      params,
      cost: credits,
      provider: provider.name,
      provider_ref: null,
      results: [],
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.jobs[job.id] = job;
    store.save();
    setImmediate(tick);
    return publicJob(job);
  }

  function finish(job, status, patch = {}) {
    Object.assign(job, patch, { status, updated_at: new Date().toISOString() });
    if (status !== 'completed') db.user.credits += job.cost;
    store.save();
  }

  function cancel(id) {
    const job = db.jobs[id];
    if (!job) throw httpError(404, 'Job no encontrado');
    if (TERMINAL.has(job.status)) throw httpError(409, `El job ya está ${job.status}`);
    if (job.provider_ref && provider.cancel) provider.cancel(job.provider_ref).catch(() => {});
    finish(job, 'canceled');
    return publicJob(job);
  }

  function resolveMedia(id) {
    const media = db.media[id];
    if (publicBaseUrl) return `${publicBaseUrl.replace(/\/$/, '')}/files/${media.filename}`;
    const data = fs.readFileSync(path.join(store.filesDir, media.filename));
    return `data:${media.mimetype};base64,${data.toString('base64')}`;
  }

  // Los enlaces de los proveedores caducan: guardamos una copia local de cada resultado.
  async function persistOutputs(outputs) {
    const results = [];
    for (const o of outputs) {
      if (o.path) {
        results.push({ url: `/files/${o.path}`, mime: o.mime });
        continue;
      }
      try {
        const res = await fetchImpl(o.url);
        if (!res.ok) throw new Error(String(res.status));
        const ext = (o.mime.split('/')[1] || 'bin').replace('svg+xml', 'svg').replace('mpeg', 'mp3').replace('quicktime', 'mov');
        const name = `${crypto.randomUUID()}.${ext}`;
        fs.writeFileSync(path.join(store.filesDir, name), Buffer.from(await res.arrayBuffer()));
        results.push({ url: `/files/${name}`, mime: o.mime, source_url: o.url });
      } catch {
        results.push({ url: o.url, mime: o.mime });
      }
    }
    return results;
  }

  async function step(job) {
    if (!job.provider_ref) {
      const model = getModel(job.job_type);
      const ref = await provider.submit(model, job.params, { resolveMedia });
      job.provider_ref = ref;
      if (TERMINAL.has(job.status)) {
        // cancelado mientras se enviaba: avisamos al proveedor y no tocamos el estado
        if (provider.cancel) provider.cancel(ref).catch(() => {});
        return;
      }
      job.status = 'in_progress';
      job.updated_at = new Date().toISOString();
      store.save();
      return;
    }
    const r = await provider.poll(job.provider_ref);
    if (TERMINAL.has(job.status)) return; // cancelado mientras se consultaba
    if (r.state === 'completed') {
      const results = await persistOutputs(r.outputs);
      if (!TERMINAL.has(job.status)) finish(job, 'completed', { results });
    } else if (r.state === 'failed') finish(job, 'failed', { error: r.error || 'Error del proveedor' });
    else if (r.state === 'nsfw') finish(job, 'nsfw', { error: 'Contenido bloqueado por moderación' });
  }

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const active = Object.values(db.jobs).filter((j) => !TERMINAL.has(j.status));
      const running = active.filter((j) => j.provider_ref);
      const slots = Math.max(0, concurrency - running.length);
      const toStart = active.filter((j) => !j.provider_ref).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, slots);
      await Promise.all(
        [...running, ...toStart].map((job) =>
          step(job).catch((err) => {
            if (!TERMINAL.has(job.status)) finish(job, 'failed', { error: err.message });
          }),
        ),
      );
    } finally {
      ticking = false;
    }
  }

  function list({ limit = 30, cursor, type } = {}) {
    let jobs = Object.values(db.jobs).sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (type) jobs = jobs.filter((j) => j.type === type);
    if (cursor) jobs = jobs.filter((j) => j.created_at < cursor);
    const page = jobs.slice(0, limit);
    return { items: page.map(publicJob), cursor: jobs.length > limit ? page[page.length - 1].created_at : null };
  }

  function get(id) {
    const job = db.jobs[id];
    if (!job) throw httpError(404, 'Job no encontrado');
    return publicJob(job);
  }

  function statusBatch(ids = []) {
    return ids.filter((id) => db.jobs[id]).map((id) => publicJob(db.jobs[id]));
  }

  return {
    estimate,
    create,
    cancel,
    get,
    list,
    statusBatch,
    tick,
    start() {
      timer = setInterval(tick, pollMs);
    },
    stop() {
      clearInterval(timer);
    },
  };
}

function publicJob(job) {
  const { provider_ref, ...rest } = job;
  return rest;
}

module.exports = { createJobService, TERMINAL };
