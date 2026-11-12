// Prueba de punta a punta: node test/e2e.js  (necesita ffmpeg y playwright)
'use strict';
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const APP_PORT = 8799, MOCK_PORT = 9797, STATIC_PORT = 8798;
const APP = `http://localhost:${APP_PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-e2e-'));
const media = path.join(tmp, 'media');
fs.mkdirSync(media);

function ff(...args) { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]); }
ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:a', 'libmp3lame', '-f', 'hls', '-hls_time', '2',
  '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(media, 'seg%d.ts'), path.join(media, 'playlist.m3u8'));
ff('-f', 'lavfi', '-i', 'sine=frequency=330:duration=5', '-c:a', 'libmp3lame', path.join(tmp, 'plain.mp3'));
ff('-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', path.join(tmp, 'cover.jpg'));
const tagged = path.join(tmp, 'etiquetada.mp3');
ff('-i', path.join(tmp, 'plain.mp3'), '-i', path.join(tmp, 'cover.jpg'), '-map', '0', '-map', '1', '-c', 'copy',
  '-id3v2_version', '3', '-metadata', 'title=Canción de prueba', '-metadata', 'artist=Mi Artista',
  '-metadata', 'album=Demo', '-metadata:s:v', 'comment=Cover (front)', tagged);
const untagged = path.join(tmp, 'Otro Artista - Sin Etiquetas.mp3');
ff('-f', 'lavfi', '-i', 'sine=frequency=550:duration=4', '-c:a', 'libmp3lame', '-map_metadata', '-1', untagged);
// M4A con etiquetas de iTunes y carátula (Opus en MP4: Chromium de pruebas no trae AAC).
ff('-f', 'lavfi', '-i', 'sine=frequency=500:duration=4', '-c:a', 'libopus', '-f', 'mp4', path.join(tmp, 'audio.mp4'));
const m4a = path.join(tmp, 'tema.m4a');
ff('-i', path.join(tmp, 'audio.mp4'), '-i', path.join(tmp, 'cover.jpg'), '-map', '0', '-map', '1', '-c', 'copy',
  '-disposition:v:0', 'attached_pic', '-metadata', 'title=Tema M4A', '-metadata', 'artist=Artista M4A',
  '-metadata', 'album=Álbum M4A', '-f', 'mp4', m4a);
// MP3 antiguo: sin ID3v2, solo ID3v1 (128 bytes «TAG» al final).
const v1 = path.join(tmp, 'raro.mp3');
ff('-f', 'lavfi', '-i', 'sine=frequency=600:duration=3', '-c:a', 'libmp3lame', '-id3v2_version', '0', '-map_metadata', '-1', v1);
const v1field = (s, n) => Buffer.from(s, 'latin1').subarray(0, n).toString('latin1').padEnd(n, '\0');
fs.appendFileSync(v1, Buffer.from('TAG' + v1field('Viejo V1', 30) + v1field('Artista V1', 30) + v1field('Album V1', 30) +
  '2001' + v1field('', 30) + '\xff', 'latin1'));
fs.writeFileSync(path.join(tmp, 'notas.txt'), 'no soy audio');

const procs = [];
function start(file, env) {
  const p = spawn(process.execPath, [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  procs.push(p);
  return new Promise((resolve) => p.stdout.once('data', resolve));
}
const cleanup = () => { for (const p of procs) p.kill(); fs.rmSync(tmp, { recursive: true, force: true }); };

const step = (name) => console.log(`· ${name}`);

async function waitPlaying(page, minTime = 0.5) {
  await page.waitForFunction((t) => {
    const a = document.getElementById('audio');
    return !a.paused && a.currentTime > t;
  }, minTime, { timeout: 20000 });
}

(async () => {
  await start(path.join(__dirname, 'mock-soundcloud.js'), { MOCK_PORT: String(MOCK_PORT), MOCK_MEDIA_DIR: media, MOCK_TTL: '60' });
  await start(path.join(ROOT, 'server.js'), {
    PORT: String(APP_PORT), PUBLIC_URL: APP, SC_CLIENT_ID: 'test-id', SC_CLIENT_SECRET: 'test-secret',
    SC_AUTH_BASE: `http://127.0.0.1:${MOCK_PORT}`, SC_API_BASE: `http://127.0.0.1:${MOCK_PORT}`,
    SC_MEDIA_HOSTS: '127.0.0.1', SC_ALLOW_HTTP_MEDIA: '1', DATA_DIR: path.join(tmp, 'data'),
  });

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (process.env.DEBUG) { page.on('console', (m) => console.log('[console]', m.text())); page.on('response', (r) => { if (!r.ok()) console.log('[http]', r.status(), r.url()); }); page.on('requestfailed', (r) => console.log('[fail]', r.url(), r.failure()?.errorText)); }
  const browserRequests = [];
  page.on('request', (r) => browserRequests.push(r.url()));

  try {
    step('carga la app y registra el service worker');
    await page.goto(APP);
    await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true));
    await page.evaluate(() => navigator.serviceWorker.ready);

    step('importa archivos locales y lee las etiquetas (ID3v2, ID3v1, M4A y nombre de archivo)');
    await page.click('[data-sub=import]');
    await page.setInputFiles('#pick-files', [tagged, untagged, m4a, v1, path.join(tmp, 'notas.txt')]);
    await page.waitForSelector('#local-list li:nth-child(4)');
    // Las carátulas se cargan al verse la fila: espera a que lleguen las dos que existen.
    await page.waitForFunction(() => document.querySelectorAll('#local-list img[src^="blob:"]').length === 2);
    const rows = await page.$$eval('#local-list li', (lis) => lis.map((li) => ({
      title: li.querySelector('.title').textContent, artist: li.querySelector('.artist').textContent,
      art: li.querySelector('img').src,
    })));
    const t1 = rows.find((r) => r.title === 'Canción de prueba');
    assert.ok(t1, `falta la pista etiquetada: ${JSON.stringify(rows)}`);
    assert.equal(t1.artist, 'Mi Artista · Demo');
    assert.ok(t1.art.startsWith('blob:'), 'la carátula ID3 no se cargó');
    const t2 = rows.find((r) => r.title === 'Sin Etiquetas');
    assert.ok(t2 && t2.artist === 'Otro Artista', `nombre de archivo mal interpretado: ${JSON.stringify(rows)}`);
    const t3 = rows.find((r) => r.title === 'Tema M4A');
    assert.ok(t3 && t3.artist === 'Artista M4A · Álbum M4A', `etiquetas M4A: ${JSON.stringify(rows)}`);
    assert.ok(t3.art.startsWith('blob:'), 'la carátula M4A no se cargó');
    const t4 = rows.find((r) => r.title === 'Viejo V1');
    assert.ok(t4 && t4.artist === 'Artista V1 · Album V1', `etiquetas ID3v1: ${JSON.stringify(rows)}`);
    assert.equal(rows.length, 4, 'el .txt no debería importarse');
    await page.waitForSelector('.toast.show');
    assert.equal(await page.textContent('.toast'), '4 añadidas · 1 no son audio');

    step('no duplica al importar de nuevo');
    await page.click('[data-sub=import]');
    await page.setInputFiles('#pick-files', [tagged]);
    await page.waitForSelector('.toast.show');
    assert.match(await page.textContent('.toast'), /1 ya estaban/);

    step('reproduce una pista local');
    await page.click('[data-sub=songs]');
    await page.click('#local-list li:has-text("Canción de prueba") .meta');
    await waitPlaying(page);
    assert.equal(await page.textContent('#np-title'), 'Canción de prueba');

    step('crea una lista y añade una canción');
    await page.click('[data-sub=lists]');
    await page.fill('#list-name', 'Favoritas');
    await page.click('#new-list button');
    await page.click('[data-sub=songs]');
    await page.click('#local-list li:has-text("Sin Etiquetas") .icon');
    await page.click('#add-options button:has-text("Favoritas")');
    await page.click('[data-sub=lists]');
    await page.click('#lists button:has-text("Favoritas")');
    await page.waitForSelector('#list-tracks li:has-text("Sin Etiquetas")');

    step('inicia sesión con OAuth 2.1 + PKCE');
    await page.click('#tab-soundcloud');
    await page.click('#sc-login a');
    await page.waitForSelector('#sc-library:not([hidden])');
    await page.waitForSelector('#sc-list li:nth-child(50)');
    assert.equal(await page.textContent('#me-name'), 'demo_user');

    step('pagina con next_href');
    await page.click('#sc-more');
    await page.waitForSelector('#sc-list li:nth-child(60)');
    assert.ok(await page.isHidden('#sc-more'));
    assert.ok(await page.isDisabled('#sc-list li[data-id="soundcloud:tracks:3"] .meta'), 'la pista bloqueada debería estar desactivada');
    assert.equal(await page.getAttribute('#sc-list li[data-id="soundcloud:tracks:1"] a', 'href'), 'https://soundcloud.com/demo_user/pista-1');

    step('reproduce en streaming HLS a través del servidor');
    await page.click('#sc-list li[data-id="soundcloud:tracks:1"] .meta');
    await waitPlaying(page);
    assert.equal(await page.textContent('#np-title'), 'Pista 1');
    assert.ok(await page.isVisible('#np-link'), 'falta el enlace a SoundCloud');
    const direct = browserRequests.filter((u) => u.includes(`127.0.0.1:${MOCK_PORT}`) && !u.includes('/authorize'));
    assert.deepEqual(direct, [], 'el navegador no debe hablar con la API directamente');

    step('listas de SoundCloud y sus pistas');
    await page.click('[data-sc=playlists]');
    await page.click('#sc-list li:has-text("Mi lista") .meta');
    await page.waitForSelector('#sc-list li[data-id="soundcloud:tracks:4"]');
    assert.equal(await page.$$eval('#sc-list li', (l) => l.length), 2);

    step('renueva el token caducado (refresh token de un solo uso)');
    const log = await (await fetch(`http://127.0.0.1:${MOCK_PORT}/_log`)).json();
    const tokenCalls = log.filter((l) => l === 'POST /oauth/token').length;
    assert.ok(tokenCalls >= 3, `esperaba varias renovaciones, hubo ${tokenCalls}`);
    const sessions = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'sessions.json'), 'utf8'));
    assert.equal(Object.keys(sessions).length, 1);
    assert.equal((fs.statSync(path.join(tmp, 'data', 'sessions.json')).mode & 0o777), 0o600);

    step('el servidor rechaza hosts y rutas no permitidas');
    const cookies = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    const bad = await fetch(`${APP}/hls?u=${encodeURIComponent('https://example.com/x.m3u8')}`, { headers: { cookie: cookies } });
    assert.equal(bad.status, 400);
    const badNext = await fetch(`${APP}/api/list/likes?next=${encodeURIComponent(`http://127.0.0.1:${MOCK_PORT}/me`)}`, { headers: { cookie: cookies } });
    assert.equal(badNext.status, 400);
    assert.equal((await fetch(`${APP}/api/me`)).status, 401);
    assert.equal((await fetch(`${APP}/..%2fserver.js`)).status, 404);

    step('sin conexión: la app abre y la música local suena');
    await page.evaluate(() => document.getElementById('audio').pause());
    await ctx.setOffline(true);
    await page.goto(`${APP}/`);
    await page.waitForSelector('#local-list li:nth-child(2)');
    assert.equal(await page.textContent('#net'), 'Sin conexión');
    await page.click('#local-list li:has-text("Sin Etiquetas") .meta');
    await waitPlaying(page);
    await page.click('#tab-soundcloud');
    assert.ok(await page.isVisible('#sc-offline'));
    const cached = await page.evaluate(async () => {
      const c = await caches.open('eco-shell-v2');
      return (await c.keys()).map((r) => new URL(r.url).pathname);
    });
    assert.ok(cached.every((p) => !/^\/(api|play|hls|auth)/.test(p)), `caché con contenido de SoundCloud: ${cached}`);
    await ctx.setOffline(false);

    step('desconecta la cuenta y borra la sesión');
    await page.goto(`${APP}/#soundcloud`);
    await page.waitForSelector('#sc-library:not([hidden])');
    await page.click('#logout');
    await page.waitForSelector('#sc-login:not([hidden])');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'sessions.json'), 'utf8')), {});

    step('duración desconocida al importar (iOS): se guarda al reproducir');
    await page.evaluate(() => new Promise((resolve, reject) => {
      const r = indexedDB.open('eco');
      r.onsuccess = () => {
        const t = r.result.transaction('tracks', 'readwrite');
        const s = t.objectStore('tracks');
        s.getAll().onsuccess = (e) => {
          const tr = e.target.result.find((x) => x.title === 'Viejo V1');
          s.put({ ...tr, duration: 0 });
        };
        t.oncomplete = resolve;
        t.onerror = reject;
      };
    }));
    await page.reload();
    await page.click('#tab-local');
    await page.waitForSelector('#local-list li:has-text("Viejo V1")');
    assert.equal(await page.textContent('#local-list li:has-text("Viejo V1") .dur'), '0:00');
    await page.click('#local-list li:has-text("Viejo V1") .meta');
    await waitPlaying(page, 0.2);
    await page.waitForFunction(() => {
      const li = [...document.querySelectorAll('#local-list li')].find((x) => x.textContent.includes('Viejo V1'));
      return li && li.querySelector('.dur').textContent === '0:03';
    });
    await page.evaluate(() => document.getElementById('audio').pause());

    step('borrar la canción que suena la detiene');
    await page.click('#tab-local');
    await page.click('#local-list li:has-text("Sin Etiquetas") .meta');
    await waitPlaying(page);
    page.once('dialog', (d) => d.accept());
    await page.click('#local-list li:has-text("Sin Etiquetas") .icon');
    await page.click('#add-options button:has-text("Borrar")');
    await page.waitForFunction(() => document.querySelectorAll('#local-list li').length === 3);
    assert.ok(await page.isHidden('#player'), 'el reproductor debería cerrarse');
    assert.ok(await page.evaluate(() => document.getElementById('audio').paused), 'el audio debería pararse');

    step('publicada como web estática: sin pestaña SoundCloud');
    const stat = http.createServer((req, res) => {
      const file = path.join(ROOT, 'public', new URL(req.url, 'http://x').pathname.replace(/\/$/, '/index.html'));
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<h1>404</h1>'); }
        const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };
        res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    }).listen(STATIC_PORT);
    const sp = await ctx.newPage();
    sp.on('pageerror', (e) => errors.push(e.message));
    await sp.goto(`http://localhost:${STATIC_PORT}/#soundcloud`);
    await sp.waitForFunction(() => document.querySelector('.tabs').hidden);
    assert.ok(await sp.isVisible('#view-local'), 'debe abrir la biblioteca local');
    assert.ok(await sp.isHidden('#view-soundcloud'), 'sin servidor no hay vista de SoundCloud');
    stat.close();

    assert.deepEqual(errors, [], `errores en la página: ${errors.join('\n')}`);
    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR || tmp, 'eco.png'), fullPage: true });
    console.log('OK: todas las pruebas pasaron');
  } finally {
    await browser.close();
    cleanup();
  }
})().catch((e) => { console.error(e); cleanup(); process.exit(1); });
