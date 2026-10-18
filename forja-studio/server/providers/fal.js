// fal.ai queue API: POST queue.fal.run/{endpoint} → status_url / response_url.
const { buildInput, extractOutputs, readJson } = require('./common');

function createFalProvider({ apiKey, fetchImpl = fetch }) {
  const headers = { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' };

  return {
    name: 'fal',
    supports: (model) => Boolean(model.providers.fal),

    async submit(model, params, ctx) {
      const { target, input } = buildInput(model, model.providers.fal, params, ctx.resolveMedia);
      const res = await fetchImpl(`https://queue.fal.run/${target}`, { method: 'POST', headers, body: JSON.stringify(input) });
      const body = await readJson(res);
      if (!res.ok) throw new Error(`fal ${res.status}: ${JSON.stringify(body.detail || body).slice(0, 300)}`);
      return { request_id: body.request_id, status_url: body.status_url, response_url: body.response_url, cancel_url: body.cancel_url };
    },

    async poll(ref) {
      const res = await fetchImpl(ref.status_url, { headers });
      const status = await readJson(res);
      if (!res.ok) return { state: 'failed', error: `fal status ${res.status}` };
      if (status.status === 'IN_QUEUE') return { state: 'queued' };
      if (status.status === 'IN_PROGRESS') return { state: 'in_progress' };

      const out = await fetchImpl(ref.response_url, { headers });
      const result = await readJson(out);
      if (!out.ok) return { state: 'failed', error: JSON.stringify(result.detail || result).slice(0, 300) };
      const flags = result.has_nsfw_concepts;
      if (Array.isArray(flags) && flags.length && flags.every(Boolean)) return { state: 'nsfw' };
      const outputs = extractOutputs(result);
      if (!outputs.length) return { state: 'failed', error: 'El proveedor no devolvió archivos' };
      return { state: 'completed', outputs };
    },

    async cancel(ref) {
      if (ref.cancel_url) await fetchImpl(ref.cancel_url, { method: 'PUT', headers }).catch(() => {});
    },
  };
}

module.exports = { createFalProvider };
