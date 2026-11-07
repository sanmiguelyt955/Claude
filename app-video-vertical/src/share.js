'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const QRCode = require('qrcode');

// IP de este ordenador en la red local (WiFi/Ethernet).
function lanAddress() {
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      // Se prefieren rangos privados típicos de una WiFi doméstica.
      const score = /^192\.168\./.test(a.address) ? 3 : /^10\./.test(a.address) ? 2 : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 1 : 0;
      candidates.push({ name, address: a.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].address : '127.0.0.1';
}

const newToken = () => crypto.randomBytes(9).toString('base64url');

async function qr(url) {
  return {
    url,
    svg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 240 }),
    terminal: await QRCode.toString(url, { type: 'terminal', small: true }),
  };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function listVideos(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(mp4|mov|m4v)$/i.test(f))
    .sort()
    .map((f) => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
}

// Página para el teléfono: lista los vídeos con botón de descarga.
function mobilePage(videos, base) {
  const items = videos
    .map(
      (v) => `<li><video src="${base}/v/${encodeURIComponent(v.name)}" preload="metadata" playsinline controls></video>
      <a class="btn" href="${base}/v/${encodeURIComponent(v.name)}?descargar=1" download>Guardar ${escapeHtml(v.name)} (${(v.size / 1048576).toFixed(1)} MB)</a></li>`
    )
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vídeos para el móvil</title><style>
body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:16px;background:#0e1116;color:#e8ecf1}
h1{font-size:20px}ul{list-style:none;padding:0;display:grid;gap:18px}
video{width:100%;max-height:70vh;border-radius:12px;background:#000}
.btn{display:block;margin-top:8px;padding:12px;border-radius:10px;background:#0d9488;color:#fff;text-align:center;text-decoration:none;font-weight:600}
p{color:#9aa4b2}</style></head><body><h1>Tus vídeos</h1>
<p>Pulsa «Guardar» en cada vídeo. En iPhone, abre el vídeo y usa Compartir → Guardar vídeo.</p>
<ul>${items || '<li>Aún no hay vídeos.</li>'}</ul></body></html>`;
}

// Monta las rutas de descarga para el móvil en una app de Express.
// Devuelve una función que da la carpeta actual (se puede cambiar en caliente).
function mountShare(app, { token, getDir }) {
  const base = `/m/${token}`;
  app.get(base, (req, res) => res.type('html').send(mobilePage(listVideos(getDir()), base)));
  app.get(`${base}/v/:name`, (req, res) => {
    const name = path.basename(req.params.name);
    const file = path.join(getDir(), name);
    if (!/\.(mp4|mov|m4v)$/i.test(name) || !fs.existsSync(file)) return res.status(404).send('No encontrado');
    if (req.query.descargar) res.attachment(name);
    res.sendFile(path.resolve(file));
  });
  return base;
}

module.exports = { lanAddress, newToken, qr, listVideos, mobilePage, mountShare };
