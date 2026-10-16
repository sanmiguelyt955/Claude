'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 've-srv-'));
process.env.VE_DATA_DIR = dataDir;
process.env.PORT = '0';
const { server } = require('../server');

let base;
const sample = path.join(dataDir, 'sample.mp4');
const pic = path.join(dataDir, 'pic.png');

test.before(async () => {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'testsrc=size=640x360:rate=25:duration=3', '-f', 'lavfi', '-i', 'sine=duration=3',
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', sample]);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'color=c=blue:size=64x64', '-frames:v', '1', pic]);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function upload(file, name) {
  const res = await fetch(`${base}/api/upload?name=${encodeURIComponent(name)}`, {
    method: 'POST', body: fs.readFileSync(file),
  });
  return { status: res.status, body: await res.json() };
}

test('sube video e imagen y los lista', async () => {
  const v = await upload(sample, 'clip.mp4');
  assert.equal(v.status, 201);
  assert.equal(v.body.type, 'video');
  assert.ok(Math.abs(v.body.duration - 3) < 0.1);
  const img = await upload(pic, 'logo.png');
  assert.equal(img.body.type, 'image');
  const list = await (await fetch(`${base}/api/media`)).json();
  assert.equal(list.length, 2);
  assert.ok(list.every((m) => !m.path), 'no debe exponer rutas del disco');
});

test('rechaza formatos no soportados', async () => {
  const res = await fetch(`${base}/api/upload?name=virus.exe`, { method: 'POST', body: 'x' });
  assert.equal(res.status, 415);
});

test('responde a rangos HTTP para reproducir y buscar', async () => {
  const list = await (await fetch(`${base}/api/media`)).json();
  const v = list.find((m) => m.type === 'video');
  const res = await fetch(`${base}${v.url}`, { headers: { Range: 'bytes=0-99' } });
  assert.equal(res.status, 206);
  assert.equal((await res.arrayBuffer()).byteLength, 100);
});

test('guarda, carga, actualiza y borra proyectos', async () => {
  const list = await (await fetch(`${base}/api/media`)).json();
  const v = list.find((m) => m.type === 'video');
  const body = {
    name: 'Mi proyecto', ratio: '9:16', fps: 30,
    tracks: [{ id: 'v1', kind: 'video', clips: [
      { id: 'c1', type: 'video', mediaId: v.id, at: 0, in: 0, out: 2, speed: 1 },
    ] }],
  };
  const created = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal(created.status, 201);
  const project = await created.json();
  assert.ok(project.updatedAt);

  const got = await (await fetch(`${base}/api/projects/${project.id}`)).json();
  assert.equal(got.name, 'Mi proyecto');

  const updated = await fetch(`${base}/api/projects/${project.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, name: 'Renombrado' }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).name, 'Renombrado');

  const del = await fetch(`${base}/api/projects/${project.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal((await fetch(`${base}/api/projects/${project.id}`)).status, 404);
});

test('rechaza proyectos con clips solapados sin transición', async () => {
  const list = await (await fetch(`${base}/api/media`)).json();
  const v = list.find((m) => m.type === 'video');
  const res = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracks: [{ id: 'v1', kind: 'video', clips: [
      { id: 'a', type: 'video', mediaId: v.id, at: 0, in: 0, out: 2 },
      { id: 'b', type: 'video', mediaId: v.id, at: 1, in: 0, out: 2 },
    ] }] }),
  });
  assert.equal(res.status, 422);
});

test('exporta un proyecto con imagen, texto y forma', async () => {
  const list = await (await fetch(`${base}/api/media`)).json();
  const v = list.find((m) => m.type === 'video');
  const img = list.find((m) => m.type === 'image');
  const project = {
    ratio: '16:9', fps: 30,
    tracks: [
      { id: 'v1', kind: 'video', clips: [{ id: 'c1', type: 'video', mediaId: v.id, at: 0, in: 0, out: 3 }] },
      { id: 'v2', kind: 'video', clips: [{ id: 'i1', type: 'image', mediaId: img.id, at: 0.5, dur: 1.5, x: 80, y: 20, scale: 20 }] },
      { id: 'g1', kind: 'graphic', clips: [{ id: 's1', type: 'shape', at: 0, dur: 3, x: 50, y: 90, w: 50, h: 5 }] },
      { id: 't1', kind: 'text', clips: [{ id: 'x1', type: 'text', at: 0, dur: 2, text: 'Hola "mundo": 100%' }] },
    ],
  };
  const res = await fetch(`${base}/api/export`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project),
  });
  assert.equal(res.status, 200, await res.clone().text());
  const { url } = await res.json();
  const file = path.join(dataDir, 'out.mp4');
  fs.writeFileSync(file, Buffer.from(await (await fetch(`${base}${url}`)).arrayBuffer()));
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json',
    '-show_streams', '-show_format', file]).toString());
  const vs = info.streams.find((s) => s.codec_type === 'video');
  assert.equal(vs.width, 1280);
  assert.equal(vs.height, 720);
  assert.ok(Math.abs(Number(info.format.duration) - 3) < 0.2);
});

test('exportar con medio inexistente devuelve error claro', async () => {
  const res = await fetch(`${base}/api/export`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracks: [{ id: 'v1', kind: 'video', clips: [
      { id: 'c', type: 'video', mediaId: '00000000-0000-4000-8000-000000000000', at: 0, in: 0, out: 1 },
    ] }] }),
  });
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Medio no encontrado/);
});
