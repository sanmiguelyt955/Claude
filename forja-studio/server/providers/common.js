// Traduce nuestros params genéricos al input de un proveedor según el catálogo.
function buildInput(model, cfg, params, resolveMedia) {
  const hasMedia = params.medias.length > 0;
  const target = (hasMedia && cfg.with_media) || cfg.endpoint || cfg.model;
  const input = {};
  const rename = cfg.params || {};

  for (const [key, value] of Object.entries(params)) {
    if (key === 'medias' || value === '' || value === undefined) continue;
    const rule = rename[key];
    if (rule && rule.drop) continue;
    let v = value;
    if (rule && rule.map) v = rule.map[value] ?? value;
    if (rule && rule.template) v = rule.template.replace('{v}', String(value));
    input[(rule && rule.to) || key] = v;
  }

  const inputs = cfg.inputs || {};
  for (const m of params.medias) {
    const field = inputs[m.role];
    if (!field) throw new Error(`El proveedor no admite el rol ${m.role} para ${model.id}`);
    const ref = resolveMedia(m.id);
    if (field.endsWith('_urls')) (input[field] ||= []).push(ref);
    else input[field] = ref;
  }
  return { target, input };
}

// Busca URLs de salida en las formas habituales de respuesta (fal, kie...).
function extractOutputs(result) {
  const out = [];
  const push = (url, mime) => url && out.push({ url, mime: mime || guessMime(url) });
  if (!result || typeof result !== 'object') return out;
  for (const img of result.images || []) push(img.url, img.content_type);
  for (const key of ['image', 'video', 'audio', 'audio_file', 'audio_url', 'output']) {
    const v = result[key];
    if (typeof v === 'string') push(v);
    else if (v && v.url) push(v.url, v.content_type);
  }
  for (const url of result.resultUrls || []) push(url);
  return out;
}

function guessMime(url) {
  const ext = String(url).split('?')[0].split('.').pop().toLowerCase();
  return {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  }[ext] || 'application/octet-stream';
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

module.exports = { buildInput, extractOutputs, guessMime, readJson };
