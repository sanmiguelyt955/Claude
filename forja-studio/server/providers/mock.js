// Proveedor local sin claves: genera SVG (imagen/vídeo animado) y WAV (audio)
// para poder usar y probar toda la app. "[fail]" o "[nsfw]" en el prompt fuerzan esos estados.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createMockProvider({ filesDir, delayMs = 2500 }) {
  return {
    name: 'mock',
    supports: () => true,

    async submit(model, params) {
      return { started_at: Date.now(), model_id: model.id, type: model.type, params };
    },

    async poll(ref) {
      const elapsed = Date.now() - ref.started_at;
      if (elapsed < delayMs / 2) return { state: 'queued' };
      if (elapsed < delayMs) return { state: 'in_progress' };
      const prompt = ref.params.prompt || '';
      if (prompt.includes('[fail]')) return { state: 'failed', error: 'Fallo simulado' };
      if (prompt.includes('[nsfw]')) return { state: 'nsfw' };

      const count = Number(ref.params.num_images || 1);
      const outputs = [];
      for (let i = 0; i < count; i++) {
        const seed = crypto.createHash('sha256').update(`${prompt}:${ref.started_at}:${i}`).digest();
        if (ref.type === 'audio') outputs.push(write(filesDir, 'wav', 'audio/wav', wav(seed)));
        else outputs.push(write(filesDir, 'svg', 'image/svg+xml', svg(ref, seed, ref.type === 'video')));
      }
      return { state: 'completed', outputs };
    },
  };
}

function write(dir, ext, mime, data) {
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(dir, name), data);
  return { path: name, mime };
}

const DIMS = { '1:1': [1024, 1024], '16:9': [1280, 720], '9:16': [720, 1280], '4:3': [1024, 768], '3:4': [768, 1024] };

function svg(ref, seed, animated) {
  const [w, h] = DIMS[ref.params.aspect_ratio] || DIMS['1:1'];
  const hue = seed[0] * 1.4;
  const c1 = `hsl(${hue} 80% 55%)`;
  const c2 = `hsl(${(hue + 140) % 360} 70% 30%)`;
  const text = escapeXml((ref.params.prompt || ref.model_id).slice(0, 80));
  const anim = animated
    ? `<animateTransform attributeName="transform" type="rotate" from="0 ${w / 2} ${h / 2}" to="360 ${w / 2} ${h / 2}" dur="${ref.params.duration || 5}s" repeatCount="indefinite"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<g opacity="0.35">${anim}<circle cx="${w / 2}" cy="${h / 3}" r="${Math.min(w, h) / 4}" fill="#fff"/></g>
<text x="50%" y="88%" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${Math.round(w / 32)}" fill="#fff">${text}</text>
<text x="24" y="40" font-family="monospace" font-size="20" fill="#fff" opacity="0.7">mock · ${escapeXml(ref.model_id)}</text>
</svg>`;
}

function wav(seed, seconds = 2, rate = 22050) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  const freq = 220 + seed[1] * 2;
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 2000, (n - i) / 2000);
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 9000 * env), 44 + i * 2);
  }
  return buf;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

module.exports = { createMockProvider };
