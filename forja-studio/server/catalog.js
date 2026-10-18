// Catálogo de modelos y cálculo de créditos (equivalente a /job-sets/costs).
const catalog = require('./catalog.json');

const models = new Map(catalog.models.map((m) => [m.id, m]));

function getModel(id) {
  return models.get(id) || null;
}

function listModels(providerName) {
  return catalog.models.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    description: m.description,
    prompt: m.prompt || 'required',
    aspect_ratios: m.aspect_ratios,
    params: m.params,
    media: m.media,
    pricing: m.cost_per_second ? { per_second: m.cost_per_second } : { per_job: m.cost },
    available: providerName === 'mock' || Boolean(m.providers[providerName]),
  }));
}

// Rellena valores por defecto y valida contra el esquema del modelo.
function normalizeParams(model, raw = {}) {
  const params = { prompt: typeof raw.prompt === 'string' ? raw.prompt.trim() : '' };
  const promptMode = model.prompt || 'required';
  if (promptMode === 'required' && !params.prompt) throw httpError(400, 'El prompt es obligatorio');

  if (model.aspect_ratios.length) {
    params.aspect_ratio = raw.aspect_ratio || model.aspect_ratios[0];
    if (!model.aspect_ratios.includes(params.aspect_ratio)) {
      throw httpError(400, `aspect_ratio no válido: ${params.aspect_ratio}`);
    }
  }

  for (const p of model.params) {
    let v = raw[p.name] ?? p.default;
    if (p.type === 'number') {
      v = Number(v);
      if (!Number.isInteger(v) || v < p.min || v > p.max) throw httpError(400, `${p.name} debe estar entre ${p.min} y ${p.max}`);
    } else if (p.type === 'select') {
      const match = p.options.find((o) => String(o) === String(v));
      if (match === undefined) throw httpError(400, `${p.name} no válido: ${v}`);
      v = match;
    } else if (p.type === 'boolean') {
      v = v === true || v === 'true';
    }
    params[p.name] = v;
  }

  // medias: [{ role, id }]
  const medias = Array.isArray(raw.medias) ? raw.medias : [];
  for (const m of medias) {
    const spec = model.media.find((s) => s.role === m.role);
    if (!spec) throw httpError(400, `El modelo no acepta media con rol ${m.role}`);
  }
  for (const spec of model.media) {
    const count = medias.filter((m) => m.role === spec.role).length;
    if (spec.required && count === 0) throw httpError(400, `Falta ${spec.label}`);
    if (count > spec.max) throw httpError(400, `${spec.label}: máximo ${spec.max}`);
  }
  params.medias = medias.map((m) => ({ role: m.role, id: String(m.id) }));
  return params;
}

function computeCost(model, params) {
  let credits = model.cost_per_second ? model.cost_per_second * Number(params.duration || 5) : model.cost;
  for (const p of model.params) {
    if (p.multiplies_cost) credits *= Number(params[p.name] || 1);
  }
  return credits;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { getModel, listModels, normalizeParams, computeCost, httpError };
