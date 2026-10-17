// End-to-end check of the built runtime, on whatever OS it runs (CI runs it
// on Windows and Mac before publishing an installer). It starts the app the
// same way the desktop window does (runtime.js) and uses it like a person
// would: upload a video with speech, analyze it (frames + our Whisper + a
// stand-in for the vision API), ask the chat, search. No real API key needed.

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { startApp, runtimePaths } = require('../runtime.js')

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RUNTIME = process.env.RUNTIME_DIR || path.join(DESKTOP, 'runtime')
const SPEECH = path.resolve(DESKTOP, '..', 'packages', 'perception', 'test', 'fixtures-speech.wav')

const ok = (msg) => console.log(`  ✓ ${msg}`)
const fail = (msg) => { throw new Error(msg) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Answers like a vision model: one scene per frame it is shown, a summary,
// and chat answers built from the timeline it receives.
function fakeAnthropic() {
  const calls = { vision: 0, text: 0, chat: 0 }
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const content = JSON.parse(body).messages[0].content
      const times = content
        .filter((c) => c.type === 'text' && c.text.startsWith('[t='))
        .map((c) => { const [m, s] = c.text.slice(3, -1).split(':'); return Number(m) * 60 + Number(s) })
      const prompt = content.at(-1).text
      let text
      if (times.length) {
        calls.vision++
        text = JSON.stringify({
          scenes: times.map((t) => ({ start_seconds: t, end_seconds: t + 1, title: 'Plano', description: 'Fondo de color', audio_description: null })),
          elements: [{ kind: 'object', label: 'fondo', detail: null, start_seconds: 0, end_seconds: null }],
        })
      } else if (prompt.includes('PREGUNTA:')) {
        calls.chat++
        const line = prompt.split('\n').find((l) => /^\[[^\]]+\] VOZ/.test(l)) || ''
        text = `Se escucha: ${line}`
      } else {
        calls.text++
        text = '{"short_summary":"Prueba","full_summary":"Video de prueba con voz","topics":["prueba"],"language":"en"}'
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ content: [{ type: 'text', text }] }))
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })))
}

async function json(res) {
  const text = await res.text()
  try { return JSON.parse(text) } catch { fail(`Respuesta no JSON (${res.status}): ${text.slice(0, 200)}`) }
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true } catch { return false }
}

// The desktop app can die without a clean quit (crash, Task Manager). Its web
// server and worker must not outlive it: an orphan worker keeps the database
// and makes the next launch's worker refuse to start.
async function crashCheck() {
  const crashData = path.join(work, 'crash-data')
  const code = `
    const { startApp } = require(${JSON.stringify(path.join(DESKTOP, 'runtime.js'))})
    startApp({ runtimeDir: ${JSON.stringify(RUNTIME)}, dataDir: ${JSON.stringify(crashData)}, settings: { WORKER_POLL_INTERVAL_MS: '500' } })
      .then((a) => console.log(JSON.stringify(a.pids)))
      .catch((e) => { console.error(e.message); process.exit(1) })`
  const host = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'inherit'] })
  const pids = await new Promise((resolve, reject) => {
    host.stdout.once('data', (d) => resolve(JSON.parse(String(d))))
    host.once('exit', (c) => reject(new Error(`la app de prueba no arrancó (código ${c})`)))
  })
  host.kill('SIGKILL') // no clean quit: what a crash or the Task Manager does
  const end = Date.now() + 15_000
  while ((alive(pids.worker) || alive(pids.web)) && Date.now() < end) await sleep(250)
  if (alive(pids.worker) || alive(pids.web)) fail(`quedaron procesos huérfanos tras un cierre forzado: ${JSON.stringify(pids)}`)
  ok('tras un cierre forzado no quedan procesos huérfanos')

  const again = await startApp({ runtimeDir: RUNTIME, dataDir: crashData, settings: { WORKER_POLL_INTERVAL_MS: '500' } })
  await sleep(3000)
  const workerUp = alive(again.pids.worker)
  again.stop()
  if (!workerUp) fail('al reabrir tras el cierre forzado, el worker no arrancó')
  ok('al reabrir tras el cierre forzado, el worker vuelve a arrancar')
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'va-smoke-'))
const dataDir = path.join(work, 'data')
const fake = await fakeAnthropic()
let app

try {
  console.log(`Runtime: ${RUNTIME}`)
  const p = runtimePaths(RUNTIME)

  // A 4 s video: two colours and the spoken sentence, made with the shipped ffmpeg.
  const video = path.join(work, 'prueba.mp4')
  execFileSync(p.ffmpeg, [
    '-hide_banner', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=2:r=30',
    '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=2:r=30',
    '-i', SPEECH,
    '-filter_complex', '[0][1]concat=n=2:v=1:a=0[v];[2]apad=whole_dur=4[a]',
    '-map', '[v]', '-map', '[a]', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video,
  ])
  ok('FFmpeg incluido funciona')

  const t0 = Date.now()
  app = await startApp({
    runtimeDir: RUNTIME,
    dataDir,
    settings: {
      ANTHROPIC_API_KEY: 'clave-de-prueba',
      ANTHROPIC_BASE_URL: fake.url,
      WHISPER_MODEL: 'tiny',
      WORKER_POLL_INTERVAL_MS: '500',
    },
    log: (m) => console.log(`    [app] ${m}`),
  })
  ok(`la app arrancó en ${Math.round((Date.now() - t0) / 1000)} s (${app.url})`)

  const home = await fetch(app.url)
  if (home.status !== 200) fail(`la página principal respondió ${home.status}`)
  ok('página principal')

  const form = new FormData()
  form.set('title', 'Prueba de humo')
  form.set('video', new Blob([fs.readFileSync(video)], { type: 'video/mp4' }), 'prueba.mp4')
  const up = await json(await fetch(`${app.url}/api/videos/upload`, { method: 'POST', body: form }))
  const id = up.video?.id || fail(`la subida falló: ${JSON.stringify(up).slice(0, 200)}`)
  ok('video subido')

  const statusOf = async () => (await json(await fetch(`${app.url}/api/videos/${id}`))).video
  const waitFor = async (want, timeoutMs) => {
    const end = Date.now() + timeoutMs
    for (;;) {
      const v = await statusOf()
      if (want.includes(v.status)) return v
      if (v.status === 'failed') fail(`el video falló: ${v.error_message}`)
      if (Date.now() > end) fail(`el video quedó en "${v.status}" (${v.activeJob?.progressLabel ?? ''})`)
      await sleep(1000)
    }
  }
  const probed = await waitFor(['queued'], 120_000)
  ok(`probe: ${probed.duration_seconds} s de video`)

  const analyze = await fetch(`${app.url}/api/videos/${id}/analyze`, { method: 'POST' })
  if (analyze.status !== 202) fail(`analizar respondió ${analyze.status}`)
  await waitFor(['ready'], 15 * 60_000) // first run downloads the Whisper weights
  const detail = await json(await fetch(`${app.url}/api/videos/${id}`))
  const speech = detail.transcript.map((t) => t.text).join(' ').toLowerCase()
  if (!speech.includes('quick test sentence')) fail(`la transcripción no es la esperada: "${speech}"`)
  ok(`análisis listo: ${detail.scenes.length} escenas, transcripción "${speech.trim()}"`)

  const chat = await json(
    await fetch(`${app.url}/api/videos/${id}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: '¿Qué se dice en el video?' }),
    }),
  )
  if (!chat.messages || chat.messages.length !== 2) fail(`el chat falló: ${JSON.stringify(chat).slice(0, 200)}`)
  if (!/quick test sentence/i.test(chat.messages[1].text)) fail(`el chat no recibió la transcripción: ${chat.messages[1].text}`)
  ok('chat respondió con la transcripción')

  const search = await json(await fetch(`${app.url}/api/search?q=sentence`))
  if (!search.results?.some((r) => r.video_id === id)) fail('la búsqueda no encontró el video')
  ok('búsqueda en la biblioteca')

  if (fake.calls.vision < 1 || fake.calls.text < 1) fail(`llamadas a la IA inesperadas: ${JSON.stringify(fake.calls)}`)

  app.stop()
  app = null
  await crashCheck()
  console.log('\nPRUEBA COMPLETA: OK')
} catch (error) {
  console.error(`\nPRUEBA FALLIDA: ${error.message}`)
  for (const name of ['migrate', 'worker', 'web']) {
    const file = path.join(dataDir, 'logs', `${name}.log`)
    if (fs.existsSync(file)) console.error(`\n--- ${name}.log ---\n${fs.readFileSync(file, 'utf8').slice(-4000)}`)
  }
  process.exitCode = 1
} finally {
  app?.stop()
  fake.server.close()
}
