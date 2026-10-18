// KIE.ai Market API: createTask → recordInfo?taskId=.
const { buildInput, extractOutputs, readJson } = require('./common');

const BASE = 'https://api.kie.ai/api/v1/jobs';

function createKieProvider({ apiKey, fetchImpl = fetch }) {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

  return {
    name: 'kie',
    supports: (model) => Boolean(model.providers.kie),

    async submit(model, params, ctx) {
      const { target, input } = buildInput(model, model.providers.kie, params, ctx.resolveMedia);
      const res = await fetchImpl(`${BASE}/createTask`, { method: 'POST', headers, body: JSON.stringify({ model: target, input }) });
      const body = await readJson(res);
      if (!res.ok || body.code !== 200) throw new Error(`kie ${body.code || res.status}: ${body.msg || 'error'}`);
      return { task_id: body.data.taskId };
    },

    async poll(ref) {
      const res = await fetchImpl(`${BASE}/recordInfo?taskId=${encodeURIComponent(ref.task_id)}`, { headers });
      const body = await readJson(res);
      if (!res.ok || body.code !== 200) return { state: 'failed', error: body.msg || `kie ${res.status}` };
      const data = body.data || {};
      if (data.state === 'fail') return { state: 'failed', error: data.failMsg || 'Fallo en el proveedor' };
      if (data.state !== 'success') return { state: data.state === 'waiting' || data.state === 'queuing' ? 'queued' : 'in_progress' };
      let result = {};
      try {
        result = JSON.parse(data.resultJson || '{}');
      } catch {
        return { state: 'failed', error: 'resultJson no válido' };
      }
      const outputs = extractOutputs(result);
      if (!outputs.length) return { state: 'failed', error: 'El proveedor no devolvió archivos' };
      return { state: 'completed', outputs };
    },
  };
}

module.exports = { createKieProvider };
