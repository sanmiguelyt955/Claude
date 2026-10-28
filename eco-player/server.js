// Eco: servidor mínimo para la parte online (API oficial de SoundCloud) y la PWA.
// Sin dependencias: solo Node >= 18 (fetch, crypto y http nativos).
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const PORT = Number(process.env.PORT) || 8787;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const CLIENT_ID = process.env.SC_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SC_CLIENT_SECRET || '';
const AUTH_BASE = (process.env.SC_AUTH_BASE || 'https://secure.soundcloud.com').replace(/\/+$/, '');
const API_BASE = (process.env.SC_API_BASE || 'https://api.soundcloud.com').replace(/\/+$/, '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const REDIRECT_URI = `${PUBLIC_URL}/auth/callback`;
const SECURE_COOKIE = PUBLIC_URL.startsWith('https://');
// Hosts a los que /hls puede reenviar peticiones de audio (listas HLS y segmentos).
const MEDIA_HOSTS = (process.env.SC_MEDIA_HOSTS || 'sndcdn.com,soundcloud.cloud,soundcloud.com')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

const configured = Boolean(CLIENT_ID && CLIENT_SECRET);

// ---------- Sesiones ----------
// Una sesión por navegador conectado; los tokens nunca salen del servidor.
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const sessions = new Map();
const pendingLogins = new Map(); // state -> { verifier, created }
const LOGIN_TTL_MS = 10 * 60 * 1000;

function loadSessions() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    for (const [sid, s] of Object.entries(raw)) sessions.set(sid, s);
  } catch { /* primer arranque o archivo corrupto: empezamos sin sesiones */ }
}

function saveSessions() {
  const out = {};
  for (const [sid, s] of sessions) {
    out[sid] = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at };
  }
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${SESSIONS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 });
  fs.renameSync(tmp, SESSIONS_FILE);
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(value, maxAge) {
  return [`eco_sid=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
    .concat(SECURE_COOKIE ? ['Secure'] : []).join('; ');
}

function getSession(req) {
  const sid = parseCookies(req).eco_sid;
  return sid && sessions.has(sid) ? { sid, s: sessions.get(sid) } : null;
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------- OAuth 2.1 + PKCE ----------
async function tokenRequest(params) {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      accept: 'application/json; charset=utf-8',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`token ${res.status}: ${body.error_description || body.error || 'respuesta inválida'}`);
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + (Number(body.expires_in) || 3600) * 1000,
  };
}

// Los refresh tokens son de un solo uso: serializamos la renovación por sesión.
function refreshSession(sid, s) {
  if (!s.refreshing) {
    s.refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refresh_token })
      .then((t) => { Object.assign(s, t); saveSessions(); })
      .finally(() => { s.refreshing = null; });
  }
  return s.refreshing;
}

async function scFetch(sid, s, url, init = {}) {
  if (Date.now() > s.expires_at - 60_000) await refreshSession(sid, s);
  const send = () => fetch(url, {
    ...init,
    headers: { accept: 'application/json; charset=utf-8', ...init.headers, authorization: `OAuth ${s.access_token}` },
  });
  let res = await send();
  if (res.status === 401 && s.refresh_token) {
    await refreshSession(sid, s);
    res = await send();
  }
  return res;
}

// ---------- Utilidades HTTP ----------
function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { location, 'cache-control': 'no-store', ...headers });
  res.end();
}

// ---------- API (lectura de la biblioteca del usuario) ----------
const URN_RE = /^soundcloud:(tracks|playlists|users):[0-9]+$/;

function slimTrack(t) {
  if (!t || t.kind !== 'track') return null;
  return {
    urn: t.urn || `soundcloud:tracks:${t.id}`,
    title: t.title,
    artist: t.user ? t.user.username : '',
    artist_url: t.user ? t.user.permalink_url : null,
    artwork: t.artwork_url || (t.user && t.user.avatar_url) || null,
    duration: t.duration,
    permalink_url: t.permalink_url,
    access: t.access || (t.streamable === false ? 'blocked' : 'playable'),
  };
}

function slimPlaylist(p) {
  if (!p || p.kind !== 'playlist') return null;
  return {
    urn: p.urn || `soundcloud:playlists:${p.id}`,
    title: p.title,
    artist: p.user ? p.user.username : '',
    artwork: p.artwork_url || null,
    track_count: p.track_count,
    permalink_url: p.permalink_url,
  };
}

// Rutas de la API oficial que la app puede leer. `next` solo se acepta si apunta a la misma ruta.
const LISTS = {
  likes: { path: '/me/likes/tracks', slim: slimTrack },
  playlists: { path: '/me/playlists', slim: slimPlaylist, extra: { show_tracks: 'false' } },
  'liked-playlists': { path: '/me/likes/playlists', slim: slimPlaylist },
  tracks: { path: '/me/tracks', slim: slimTrack },
};

function listUrl(apiPath, next, extra = {}) {
  if (next) {
    let n;
    try { n = new URL(next); } catch { n = null; }
    const base = new URL(API_BASE);
    if (!n || n.origin !== base.origin || n.pathname !== new URL(API_BASE + apiPath).pathname) {
      throw Object.assign(new Error('next no válido'), { status: 400 });
    }
    return n.toString();
  }
  const u = new URL(API_BASE + apiPath);
  u.search = new URLSearchParams({ limit: '50', linked_partitioning: 'true', ...extra }).toString();
  return u.toString();
}

async function handleList(req, res, url, sess, apiPath, slim, extra) {
  const target = listUrl(apiPath, url.searchParams.get('next'), extra);
  const r = await scFetch(sess.sid, sess.s, target);
  if (!r.ok) return send(res, r.status === 401 ? 401 : 502, { error: `SoundCloud respondió ${r.status}` });
  const body = await r.json();
  const raw = Array.isArray(body) ? body : body.collection || [];
  send(res, 200, { items: raw.map(slim).filter(Boolean), next: body.next_href || null });
}

// ---------- Reproducción en streaming (sin almacenamiento) ----------
function isMediaHost(u) {
  const host = u.hostname.toLowerCase();
  const protoOk = u.protocol === 'https:' || (u.protocol === 'http:' && process.env.SC_ALLOW_HTTP_MEDIA === '1');
  return protoOk && MEDIA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function rewritePlaylist(text, baseUrl) {
  const proxied = (ref) => `/hls?u=${encodeURIComponent(new URL(ref, baseUrl).toString())}`;
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, ref) => `URI="${proxied(ref)}"`);
    return proxied(t);
  }).join('\n');
}

function isPlaylistResponse(r, u) {
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  return ct.includes('mpegurl') || u.pathname.endsWith('.m3u8');
}

async function sendPlaylist(res, r, finalUrl) {
  const text = await r.text();
  send(res, 200, rewritePlaylist(text, finalUrl), { 'content-type': 'application/vnd.apple.mpegurl' });
}

async function handlePlay(res, sess, urn) {
  const r = await scFetch(sess.sid, sess.s, `${API_BASE}/tracks/${urn}/streams`);
  if (!r.ok) return send(res, r.status === 404 ? 404 : 502, `streams ${r.status}`);
  const streams = await r.json();
  const src = streams.hls_aac_160_url || streams.hls_mp3_128_url;
  if (!src) return send(res, 404, 'La pista no tiene stream disponible');
  // La URL de stream de la API pide autenticación; tras ella llega la lista HLS firmada.
  let pl = await scFetch(sess.sid, sess.s, src, { headers: { accept: '*/*' } });
  if (!pl.ok) return send(res, 502, `hls ${pl.status}`);
  // Según la versión de la API, la respuesta es la lista HLS (tras redirección) o un JSON { url }.
  if ((pl.headers.get('content-type') || '').includes('json')) {
    const { url } = await pl.json();
    const u = url && new URL(url);
    if (!u || !isMediaHost(u)) return send(res, 502, 'stream fuera de los hosts permitidos');
    pl = await fetch(u);
    if (!pl.ok) return send(res, 502, `hls ${pl.status}`);
  }
  return sendPlaylist(res, pl, pl.url || src);
}

async function handleHls(req, res, url) {
  let target;
  try { target = new URL(url.searchParams.get('u') || ''); } catch { return send(res, 400, 'u no válida'); }
  if (!isMediaHost(target)) return send(res, 400, 'host no permitido');
  const headers = {};
  if (req.headers.range) headers.range = req.headers.range;
  const r = await fetch(target, { headers });
  if (!r.ok && r.status !== 206) return send(res, 502, `media ${r.status}`);
  const finalUrl = new URL(r.url || target);
  if (!isMediaHost(finalUrl)) return send(res, 502, 'redirección fuera de los hosts permitidos');
  if (isPlaylistResponse(r, finalUrl)) return sendPlaylist(res, r, finalUrl);
  const out = { 'cache-control': 'no-store' };
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = r.headers.get(h);
    if (v) out[h] = v;
  }
  res.writeHead(r.status, out);
  if (!r.body) return res.end();
  Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
}

// ---------- Archivos estáticos ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, 'No encontrado');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'No encontrado');
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      // El service worker gestiona la caché offline; el navegador siempre revalida.
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
}

// ---------- Router ----------
async function route(req, res) {
  const url = new URL(req.url, PUBLIC_URL);
  const p = url.pathname;

  if (p === '/health') return send(res, 200, 'ok');

  if (p === '/auth/status') {
    return send(res, 200, { configured, loggedIn: Boolean(getSession(req)) });
  }

  if (p === '/auth/login') {
    if (!configured) return send(res, 503, 'Falta configurar SC_CLIENT_ID y SC_CLIENT_SECRET');
    const verifier = base64url(crypto.randomBytes(48));
    const state = base64url(crypto.randomBytes(24));
    pendingLogins.set(state, { verifier, created: Date.now() });
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const q = new URLSearchParams({
      client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
      code_challenge: challenge, code_challenge_method: 'S256', state,
    });
    return redirect(res, `${AUTH_BASE}/authorize?${q}`);
  }

  if (p === '/auth/callback') {
    const state = url.searchParams.get('state');
    const pending = state && pendingLogins.get(state);
    pendingLogins.delete(state);
    if (!pending || Date.now() - pending.created > LOGIN_TTL_MS) return redirect(res, '/?login=caducado#soundcloud');
    const code = url.searchParams.get('code');
    if (!code) return redirect(res, '/?login=cancelado#soundcloud');
    let tokens;
    try {
      tokens = await tokenRequest({
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: pending.verifier,
      });
    } catch (e) {
      console.error('Fallo al canjear el código OAuth:', e.message);
      return redirect(res, '/?login=error#soundcloud');
    }
    const sid = base64url(crypto.randomBytes(32));
    sessions.set(sid, tokens);
    saveSessions();
    return redirect(res, '/#soundcloud', { 'set-cookie': sessionCookie(sid, 60 * 60 * 24 * 90) });
  }

  if (p === '/auth/logout' && req.method === 'POST') {
    const sess = getSession(req);
    if (sess) {
      await scFetch(sess.sid, sess.s, `${API_BASE}/sign-out`, { method: 'POST' }).catch(() => {});
      sessions.delete(sess.sid);
      saveSessions();
    }
    return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie('', 0) });
  }

  if (p.startsWith('/api/') || p.startsWith('/play/') || p === '/hls') {
    const sess = getSession(req);
    if (!sess) return send(res, 401, { error: 'No has iniciado sesión' });

    if (p === '/hls') return handleHls(req, res, url);

    const play = p.match(/^\/play\/([^/]+)\/index\.m3u8$/);
    if (play) {
      const urn = decodeURIComponent(play[1]);
      if (!URN_RE.test(urn) || !urn.startsWith('soundcloud:tracks:')) return send(res, 400, 'urn no válido');
      return handlePlay(res, sess, urn);
    }

    if (p === '/api/me') {
      const r = await scFetch(sess.sid, sess.s, `${API_BASE}/me`);
      if (!r.ok) return send(res, r.status === 401 ? 401 : 502, { error: `SoundCloud respondió ${r.status}` });
      const me = await r.json();
      return send(res, 200, { username: me.username, avatar: me.avatar_url, permalink_url: me.permalink_url });
    }

    const list = p.match(/^\/api\/list\/([a-z-]+)$/);
    if (list && LISTS[list[1]]) {
      const l = LISTS[list[1]];
      return handleList(req, res, url, sess, l.path, l.slim, l.extra);
    }

    const plTracks = p.match(/^\/api\/playlist\/([^/]+)\/tracks$/);
    if (plTracks) {
      const urn = decodeURIComponent(plTracks[1]);
      if (!URN_RE.test(urn) || !urn.startsWith('soundcloud:playlists:')) return send(res, 400, { error: 'urn no válido' });
      return handleList(req, res, url, sess, `/playlists/${urn}/tracks`, slimTrack);
    }

    return send(res, 404, { error: 'No encontrado' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido');
  return serveStatic(req, res, p);
}

function cleanupPending() {
  const now = Date.now();
  for (const [state, v] of pendingLogins) if (now - v.created > LOGIN_TTL_MS) pendingLogins.delete(state);
}

if (require.main === module) {
  loadSessions();
  setInterval(cleanupPending, 60_000).unref();
  http.createServer((req, res) => {
    route(req, res).catch((err) => {
      if (!err.status) console.error(err);
      if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Error interno' });
      else res.destroy();
    });
  }).listen(PORT, () => {
    console.log(`Eco en ${PUBLIC_URL} (puerto ${PORT})`);
    if (!configured) console.log('Aviso: sin SC_CLIENT_ID/SC_CLIENT_SECRET solo funciona la biblioteca local.');
    console.log(`Redirect URI que debes registrar en SoundCloud: ${REDIRECT_URI}`);
  });
}

module.exports = { rewritePlaylist };
