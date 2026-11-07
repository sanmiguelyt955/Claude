'use strict';

// Pruebas de extremo a extremo: API del servidor y servidor MCP.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hasFfmpeg, makeFixtures } = require('./helpers');

process.env.VV_DISABLE_OCR = '1';
process.env.VV_UPDATE_URL = 'http://127.0.0.1:9/no-existe.json';

async function waitJob(base, id) {
  for (let i = 0; i < 200; i++) {
    const j = await (await fetch(`${base}/api/trabajos/${id}`)).json();
    if (j.status !== 'en_curso') return j;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('El trabajo no terminó');
}

const upload = (url, files) => {
  const fd = new FormData();
  for (const f of files) fd.append('archivo', new Blob([fs.readFileSync(f)]), path.basename(f));
  return fetch(url, { method: 'POST', body: fd });
};

test('servidor y MCP', { skip: !hasFfmpeg && 'FFmpeg no instalado' }, async (t) => {
  const fx = makeFixtures();

  await t.test('API: subir clips y música, generar y descargar desde el móvil', async () => {
    const { start } = require('../server');
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-ws-'));
    const ctx = await start({ port: 0, host: '127.0.0.1', workspace });
    const base = `http://127.0.0.1:${ctx.port}`;
    try {
      assert.equal((await upload(`${base}/api/clips/apertura`, [fx.a1, fx.a2])).status, 200);
      await upload(`${base}/api/clips/demo`, [fx.d1]);
      await upload(`${base}/api/clips/cierre`, [fx.c1]);
      // Un archivo que no es vídeo se ignora.
      const bad = await (await upload(`${base}/api/clips/demo`, [fx.song])).json();
      assert.deepEqual(bad.saved, []);
      assert.equal((await upload(`${base}/api/clips/otra`, [fx.a1])).status, 400);

      const music = await (await upload(`${base}/api/musica`, [fx.song])).json();
      assert.ok(Math.abs(music.drop - 4) < 0.15);
      const moved = await (await fetch(`${base}/api/musica`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drop: 3 }) })).json();
      assert.equal(moved.drop, 3);

      const estado = await (await fetch(`${base}/api/estado`)).json();
      assert.equal(estado.clips.apertura.length, 2);
      assert.equal(estado.music.drop, 3);

      const { job } = await (await fetch(`${base}/api/generar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 3, resolution: '720p' }) })).json();
      const fin = await waitJob(base, job);
      assert.equal(fin.status, 'hecho', fin.error);
      assert.equal(fin.result.length, 2);
      assert.deepEqual(fin.result[0].music, { start: 1, delay: 0 }); // drop 3 s - producto en 2 s
      const video = await fetch(`${base}${fin.result[0].url}`);
      assert.equal(video.status, 200);

      // Página del móvil: con la clave funciona; sin ella no.
      const share = await (await fetch(`${base}/api/compartir`)).json();
      assert.match(share.svg, /<svg/);
      const sharePath = new URL(share.url).pathname;
      const page = await (await fetch(`${base}${sharePath}`)).text();
      assert.match(page, /video_001\.mp4/);
      const dl = await fetch(`${base}${sharePath}/v/video_001.mp4?descargar=1`);
      assert.equal(dl.status, 200);
      assert.match(dl.headers.get('content-disposition') || '', /attachment/);
      assert.notEqual((await fetch(`${base}/m/clave-falsa`)).status, 200);
      assert.equal((await fetch(`${base}${sharePath}/v/..%2Fproyecto.json`)).status, 404);

      // Analizar subiendo un vídeo.
      const fd = new FormData();
      fd.append('archivo', new Blob([fs.readFileSync(fx.viral)]), 'viral.mp4');
      const a = await (await fetch(`${base}/api/analizar`, { method: 'POST', body: fd })).json();
      const af = await waitJob(base, a.job);
      assert.equal(af.status, 'hecho', af.error);
      assert.equal(af.result.summary.shots, 3);

      // La comprobación de versión falla sin romper la app.
      const act = await (await fetch(`${base}/api/actualizacion`)).json();
      assert.equal(act.available, false);
    } finally {
      ctx.server.close();
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  await t.test('MCP: herramientas y generación desde Claude', async () => {
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'vv-mcp-'));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(__dirname, '..', 'mcp', 'server.js')],
      env: { ...process.env, VV_WORKSPACE: workspace },
    });
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((x) => x.name).sort(), [
        'anadir_clips', 'analizar_viral', 'enlace_movil', 'estado_proyecto', 'generar_videos', 'poner_musica', 'quitar_clip', 'separar_voz',
      ]);
      const call = async (name, args = {}) => {
        const r = await client.callTool({ name, arguments: args });
        assert.ok(!r.isError, r.content[0].text);
        return r.content[0].text;
      };
      await call('anadir_clips', { fase: 'apertura', rutas: [fx.a1, fx.a2] });
      await call('anadir_clips', { fase: 'demo', rutas: [fx.d1] });
      const estado = JSON.parse(await call('anadir_clips', { fase: 'cierre', rutas: [fx.c1] }));
      assert.equal(estado.combinacionesPosibles, 2);
      const musica = JSON.parse(await call('poner_musica', { ruta: fx.song }));
      assert.ok(Math.abs(musica.momentoFuerte - 4) < 0.15);
      const gen = JSON.parse(await call('generar_videos', { cantidad: 2, resolucion: '720p' }));
      assert.equal(gen.generados, 2);
      for (const v of gen.videos) assert.ok(fs.existsSync(v.file));
      const an = JSON.parse(await call('analizar_viral', { fuente: fx.viral, leer_textos: false }));
      assert.equal(an.resumen.shots, 3);
      assert.match(await call('enlace_movil'), /http:\/\/.+\/m\//);
      const err = await client.callTool({ name: 'quitar_clip', arguments: { fase: 'demo', nombre: 'no-existe.mp4' } });
      assert.ok(err.isError);
    } finally {
      await client.close();
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  fs.rmSync(fx.dir, { recursive: true, force: true });
});
