'use strict';

const pkg = require('../package.json');

// Archivo de versiones publicado por nosotros. Formato:
// { "version": "0.2.0", "notas": "...", "descargas": { "win-x64": "url", "mac-arm64": "url", "mac-x64": "url" } }
const DEFAULT_URL = 'https://raw.githubusercontent.com/sanmiguelyt955/claude/main/app-video-vertical/versiones.json';

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function platformKey() {
  if (process.platform === 'win32') return 'win-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  return 'linux-x64';
}

// Comprueba si hay versión nueva. Nunca lanza: si falla la red, devuelve { error }.
async function checkForUpdate({ url = process.env.VV_UPDATE_URL || DEFAULT_URL, current = pkg.version, fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { current, available: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const available = compareVersions(data.version, current) > 0;
    return {
      current,
      latest: data.version,
      available,
      notes: data.notas || '',
      download: (data.descargas && data.descargas[platformKey()]) || null,
    };
  } catch (err) {
    return { current, available: false, error: err.message };
  }
}

module.exports = { compareVersions, checkForUpdate, platformKey, DEFAULT_URL };
