const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../server/store');
const { createMockProvider } = require('../server/providers/mock');
const { createJobService } = require('../server/jobs');
const { createApp } = require('../server/app');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function startServer({ credits = 100, apiToken = '' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-'));
  const store = createStore(dir, { initialCredits: credits });
  const provider = createMockProvider({ filesDir: store.filesDir, delayMs: 40 });
  const jobs = createJobService({ store, provider, pollMs: 10 });
  jobs.start();
  const server = createApp({ store, jobs, provider, apiToken }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, { method = 'GET', json, body, headers = {} } = {}) => {
    const res = await fetch(base + p, {
      method,
      headers: json ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: json ? JSON.stringify(json) : body,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const close = async () => {
    jobs.stop();
    server.close();
    await new Promise((r) => setTimeout(r, 50)); // deja terminar el último tick
    store.flush();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { base, call, close };
}

async function waitFor(call, id) {
  for (let i = 0; i < 100; i++) {
    const { body } = await call(`/api/jobs/${id}`);
    if (!['queued', 'in_progress'].includes(body.status)) return body;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timeout');
}

test('ciclo completo: subir referencia, cotizar, generar y descargar', async (t) => {
  const { base, call, close } = await startServer();
  t.after(close);

  const [media] = (await call('/api/media/batch', { method: 'POST', json: { mimetypes: ['image/png'] } })).body;
  assert.equal((await call(media.upload_url, { method: 'PUT', body: PNG })).status, 204);
  assert.equal((await call(`/api/media/${media.id}/upload`, { method: 'POST' })).status, 200);

  const params = { prompt: 'un gato astronauta', num_images: 2, medias: [{ role: 'image_references', id: media.id }] };
  const cost = await call('/api/job-sets/costs', { method: 'POST', json: { job_type: 'nano_banana', params } });
  assert.equal(cost.body.credits, 8);

  const created = await call('/api/jobs/v2/nano_banana', { method: 'POST', json: { params } });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'queued');
  assert.equal((await call('/api/user')).body.credits, 92);

  const done = await waitFor(call, created.body.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.results.length, 2);
  assert.equal(done.provider_ref, undefined);
  const file = await fetch(base + done.results[0].url);
  assert.equal(file.status, 200);
  assert.match(await file.text(), /<svg/);

  const batch = await call('/api/jobs/status-batch', { method: 'POST', json: { ids: [done.id, 'nope'] } });
  assert.deepEqual(batch.body.items.map((j) => j.id), [done.id]);
});

test('vídeo cobra por segundo y audio devuelve WAV', async (t) => {
  const { base, call, close } = await startServer();
  t.after(close);
  const video = await call('/api/jobs/v2/kling_2_1', { method: 'POST', json: { prompt: 'ola gigante', duration: 10 } });
  assert.equal(video.body.cost, 60);
  const audio = await call('/api/jobs/v2/tts_multilingual', { method: 'POST', json: { prompt: 'hola' } });
  const done = await waitFor(call, audio.body.id);
  assert.equal(done.results[0].mime, 'audio/wav');
  const wav = Buffer.from(await (await fetch(base + done.results[0].url)).arrayBuffer());
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
});

test('los fallos, la moderación y las cancelaciones devuelven los créditos', async (t) => {
  const { call, close } = await startServer({ credits: 20 });
  t.after(close);
  const failed = await call('/api/jobs/v2/seedream_v4', { method: 'POST', json: { prompt: 'x [fail]' } });
  const nsfw = await call('/api/jobs/v2/seedream_v4', { method: 'POST', json: { prompt: 'x [nsfw]' } });
  assert.equal((await waitFor(call, failed.body.id)).status, 'failed');
  assert.equal((await waitFor(call, nsfw.body.id)).status, 'nsfw');

  const job = await call('/api/jobs/v2/seedream_v4', { method: 'POST', json: { prompt: 'cancelar' } });
  assert.equal((await call(`/api/jobs/${job.body.id}/cancel`, { method: 'POST' })).body.status, 'canceled');
  assert.equal((await call(`/api/jobs/${job.body.id}/cancel`, { method: 'POST' })).status, 409);
  assert.equal((await call('/api/user')).body.credits, 20);
});

test('validaciones: créditos, prompt, modelo, media y tipos', async (t) => {
  const { call, close } = await startServer({ credits: 3 });
  t.after(close);
  assert.equal((await call('/api/jobs/v2/nano_banana', { method: 'POST', json: { prompt: 'a' } })).status, 402);
  assert.equal((await call('/api/jobs/v2/flux_schnell', { method: 'POST', json: { prompt: '  ' } })).status, 400);
  assert.equal((await call('/api/jobs/v2/no_existe', { method: 'POST', json: { prompt: 'a' } })).status, 404);
  assert.equal((await call('/api/jobs/v2/flux_schnell', { method: 'POST', json: { prompt: 'a', num_images: 9 } })).status, 400);
  assert.equal((await call('/api/jobs/v2/flux_schnell', { method: 'POST', json: { prompt: 'a', aspect_ratio: '7:1' } })).status, 400);
  assert.equal((await call('/api/jobs/v2/remove_background', { method: 'POST', json: {} })).status, 400);
  assert.equal(
    (await call('/api/jobs/v2/remove_background', { method: 'POST', json: { medias: [{ role: 'image', id: 'falso' }] } })).status,
    400,
  );
  assert.equal((await call('/api/media/batch', { method: 'POST', json: { mimetypes: ['text/html'] } })).status, 415);
  assert.equal((await call('/api/user')).body.credits, 3);
});

test('API_TOKEN protege la API', async (t) => {
  const { call, close } = await startServer({ apiToken: 'secreto' });
  t.after(close);
  assert.equal((await call('/api/user')).status, 401);
  assert.equal((await call('/api/user', { headers: { Authorization: 'Bearer secreto' } })).status, 200);
  assert.equal((await call('/health')).status, 200);
});

test('cancelar durante el envío al proveedor no reactiva el job ni duplica el reembolso', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-'));
  const store = createStore(dir, { initialCredits: 10 });
  let release;
  const canceled = [];
  const provider = {
    name: 'slow',
    supports: () => true,
    submit: () => new Promise((r) => { release = () => r({ ref: 1 }); }),
    poll: async () => ({ state: 'completed', outputs: [] }),
    cancel: async (ref) => canceled.push(ref),
  };
  const jobs = createJobService({ store, provider });
  const job = jobs.create('flux_schnell', { prompt: 'p' });
  const ticking = jobs.tick();
  while (!release) await new Promise((r) => setImmediate(r));
  jobs.cancel(job.id);
  release();
  await ticking;
  assert.equal(jobs.get(job.id).status, 'canceled');
  assert.equal(store.db.user.credits, 10);
  assert.deepEqual(canceled, [{ ref: 1 }]);
  store.flush();
  fs.rmSync(dir, { recursive: true, force: true });
});
