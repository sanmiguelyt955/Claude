// SoundCloud falso para probar Eco de punta a punta sin credenciales reales.
// Imita las rutas de la API oficial que usa el servidor (OAuth 2.1 + PKCE, /me, listas y streams).
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.MOCK_PORT) || 9797;
const BASE = `http://127.0.0.1:${PORT}`;
const MEDIA_DIR = process.env.MOCK_MEDIA_DIR;
const codes = new Map();
const tokens = new Map();
const log = [];

const b64url = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const user = { username: 'demo_user', avatar_url: null, permalink_url: 'https://soundcloud.com/demo_user' };
const track = (n, access = 'playable') => ({
  kind: 'track', id: n, urn: `soundcloud:tracks:${n}`, title: `Pista ${n}`, duration: 6000,
  permalink_url: `https://soundcloud.com/demo_user/pista-${n}`, artwork_url: null, access, user,
});
const likes = Array.from({ length: 60 }, (_, i) => track(i + 1, i === 2 ? 'blocked' : 'playable'));

function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }

function issue() {
  const t = { access_token: b64url(crypto.randomBytes(16)), refresh_token: b64url(crypto.randomBytes(16)), expires_in: Number(process.env.MOCK_TTL) || 3600 };
  tokens.set(t.access_token, { refresh: t.refresh_token, exp: Date.now() + t.expires_in * 1000 });
  return t;
}

function authed(req) {
  const m = (req.headers.authorization || '').match(/^OAuth (.+)$/);
  const t = m && tokens.get(m[1]);
  return Boolean(t && t.exp > Date.now());
}

function page(res, url, items) {
  const limit = Number(url.searchParams.get('limit')) || 50;
  const offset = Number(url.searchParams.get('offset')) || 0;
  const next = offset + limit < items.length
    ? `${BASE}${url.pathname}?limit=${limit}&offset=${offset + limit}&linked_partitioning=true` : null;
  json(res, 200, { collection: items.slice(offset, offset + limit), next_href: next });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  log.push(`${req.method} ${url.pathname}`);
  const body = await new Promise((r) => { let d = ''; req.on('data', (c) => { d += c; }); req.on('end', () => r(d)); });

  if (url.pathname === '/_log') return json(res, 200, log);
  if (url.pathname === '/authorize') {
    const q = url.searchParams;
    if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) return json(res, 400, { error: 'pkce requerido' });
    const code = b64url(crypto.randomBytes(12));
    codes.set(code, { challenge: q.get('code_challenge'), redirect: q.get('redirect_uri'), client: q.get('client_id') });
    res.writeHead(302, { location: `${q.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(q.get('state'))}` });
    return res.end();
  }
  if (url.pathname === '/oauth/token' && req.method === 'POST') {
    const p = new URLSearchParams(body);
    if (p.get('client_id') !== 'test-id' || p.get('client_secret') !== 'test-secret') return json(res, 401, { error: 'invalid_client' });
    if (p.get('grant_type') === 'authorization_code') {
      const c = codes.get(p.get('code'));
      codes.delete(p.get('code'));
      const ok = c && c.redirect === p.get('redirect_uri') &&
        b64url(crypto.createHash('sha256').update(p.get('code_verifier') || '').digest()) === c.challenge;
      return ok ? json(res, 200, issue()) : json(res, 400, { error: 'invalid_grant' });
    }
    if (p.get('grant_type') === 'refresh_token') {
      for (const [at, t] of tokens) {
        if (t.refresh === p.get('refresh_token')) { tokens.delete(at); return json(res, 200, issue()); }
      }
      return json(res, 400, { error: 'invalid_grant' });
    }
    return json(res, 400, { error: 'unsupported_grant_type' });
  }
  if (url.pathname.startsWith('/media/')) {
    // CDN firmada: no pide token.
    const file = path.join(MEDIA_DIR, path.basename(url.pathname));
    if (!fs.existsSync(file)) return json(res, 404, {});
    res.writeHead(200, { 'content-type': file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' });
    return fs.createReadStream(file).pipe(res);
  }
  if (!authed(req)) return json(res, 401, { error: 'unauthorized' });
  if (url.pathname === '/me') return json(res, 200, user);
  if (url.pathname === '/sign-out') return json(res, 200, {});
  if (url.pathname === '/me/likes/tracks') return page(res, url, likes);
  if (url.pathname === '/me/tracks') return page(res, url, likes.slice(0, 3));
  if (url.pathname === '/me/likes/playlists') return page(res, url, []);
  if (url.pathname === '/me/playlists') {
    return page(res, url, [{ kind: 'playlist', id: 7, urn: 'soundcloud:playlists:7', title: 'Mi lista', track_count: 2, permalink_url: 'https://soundcloud.com/demo_user/sets/mi-lista', user }]);
  }
  if (url.pathname === '/playlists/soundcloud:playlists:7/tracks') return page(res, url, likes.slice(3, 5));
  const s = url.pathname.match(/^\/tracks\/(soundcloud:tracks:\d+)\/streams$/);
  if (s) return json(res, 200, { hls_mp3_128_url: `${BASE}/stream-auth/${s[1]}` });
  if (url.pathname.startsWith('/stream-auth/')) {
    res.writeHead(302, { location: `${BASE}/media/playlist.m3u8` });
    return res.end();
  }
  json(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`mock en ${BASE}`));
