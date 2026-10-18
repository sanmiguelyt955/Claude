const test = require('node:test');
const assert = require('node:assert/strict');
const { createFalProvider } = require('../server/providers/fal');
const { createKieProvider } = require('../server/providers/kie');
const { getModel, normalizeParams } = require('../server/catalog');

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null });
    const handler = routes.find(([match]) => url.includes(match));
    if (!handler) throw new Error(`sin ruta: ${url}`);
    const [status, json] = typeof handler[1] === 'function' ? handler[1]() : handler[1];
    return { ok: status < 400, status, text: async () => JSON.stringify(json) };
  };
  return { impl, calls };
}

const ctx = { resolveMedia: (id) => `https://cdn.test/${id}.png` };

test('fal: elige el endpoint con media, mapea referencias y lee la cola', async () => {
  const f = fakeFetch([
    ['queue.fal.run/fal-ai/nano-banana/edit', [200, { request_id: 'r1', status_url: 'https://s/status', response_url: 'https://s/result' }]],
    ['https://s/status', [200, { status: 'COMPLETED' }]],
    ['https://s/result', [200, { images: [{ url: 'https://out/1.png', content_type: 'image/png' }] }]],
  ]);
  const fal = createFalProvider({ apiKey: 'k', fetchImpl: f.impl });
  const model = getModel('nano_banana');
  const params = normalizeParams(model, { prompt: 'hola', medias: [{ role: 'image_references', id: 'a' }, { role: 'image_references', id: 'b' }] });
  const ref = await fal.submit(model, params, ctx);
  assert.equal(f.calls[0].opts.headers.Authorization, 'Key k');
  assert.deepEqual(f.calls[0].body, { prompt: 'hola', aspect_ratio: '1:1', num_images: 1, image_urls: ['https://cdn.test/a.png', 'https://cdn.test/b.png'] });
  assert.deepEqual(await fal.poll(ref), { state: 'completed', outputs: [{ url: 'https://out/1.png', mime: 'image/png' }] });
});

test('fal: transforma aspect_ratio y duración; detecta NSFW', async () => {
  const f = fakeFetch([
    ['queue.fal.run', [200, { request_id: 'r', status_url: 'https://s/status', response_url: 'https://s/result' }]],
    ['https://s/status', [200, { status: 'COMPLETED' }]],
    ['https://s/result', [200, { images: [{ url: 'u' }], has_nsfw_concepts: [true] }]],
  ]);
  const fal = createFalProvider({ apiKey: 'k', fetchImpl: f.impl });
  const flux = getModel('flux_schnell');
  const ref = await fal.submit(flux, normalizeParams(flux, { prompt: 'p', aspect_ratio: '9:16' }), ctx);
  assert.equal(f.calls[0].body.image_size, 'portrait_16_9');
  assert.equal(f.calls[0].body.aspect_ratio, undefined);
  assert.deepEqual(await fal.poll(ref), { state: 'nsfw' });

  const veo = getModel('veo3_fast');
  await fal.submit(veo, normalizeParams(veo, { prompt: 'p' }), ctx);
  assert.match(f.calls.at(-1).url, /fal-ai\/veo3\/fast$/);
  assert.equal(f.calls.at(-1).body.duration, '8s');
});

test('fal: estados intermedios y errores', async () => {
  let status = 'IN_QUEUE';
  const f = fakeFetch([
    ['https://s/status', () => [200, { status }]],
    ['https://s/result', [422, { detail: 'prompt inválido' }]],
    ['queue.fal.run', [401, { detail: 'bad key' }]],
  ]);
  const fal = createFalProvider({ apiKey: 'k', fetchImpl: f.impl });
  const ref = { status_url: 'https://s/status', response_url: 'https://s/result' };
  assert.equal((await fal.poll(ref)).state, 'queued');
  status = 'IN_PROGRESS';
  assert.equal((await fal.poll(ref)).state, 'in_progress');
  status = 'COMPLETED';
  assert.deepEqual(await fal.poll(ref), { state: 'failed', error: '"prompt inválido"' });
  const flux = getModel('flux_schnell');
  await assert.rejects(fal.submit(flux, normalizeParams(flux, { prompt: 'p' }), ctx), /fal 401/);
});

test('kie: createTask + recordInfo', async () => {
  let state = 'generating';
  const f = fakeFetch([
    ['createTask', [200, { code: 200, data: { taskId: 't1' } }]],
    ['recordInfo', () => [200, { code: 200, data: { state, resultJson: JSON.stringify({ resultUrls: ['https://out/v.mp4'] }) } }]],
  ]);
  const kie = createKieProvider({ apiKey: 'k', fetchImpl: f.impl });
  const model = getModel('seedance_lite');
  const ref = await kie.submit(model, normalizeParams(model, { prompt: 'p', medias: [{ role: 'start_image', id: 'x' }] }), ctx);
  assert.equal(f.calls[0].opts.headers.Authorization, 'Bearer k');
  assert.equal(f.calls[0].body.model, 'bytedance/v1-lite-image-to-video');
  assert.equal(f.calls[0].body.input.image_url, 'https://cdn.test/x.png');
  assert.equal(f.calls[0].body.input.duration, '5');
  assert.equal((await kie.poll(ref)).state, 'in_progress');
  state = 'success';
  assert.deepEqual(await kie.poll(ref), { state: 'completed', outputs: [{ url: 'https://out/v.mp4', mime: 'video/mp4' }] });
  assert.equal(kie.supports(getModel('veo3_fast')), false);
});
