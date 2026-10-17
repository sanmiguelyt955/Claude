// End-to-end test of the perception job against a real (temporary) SQLite
// database and a local server that stands in for the Anthropic API, so the
// real Claude provider code, the fallback chain and the persistence all run.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const speech = path.join(here, '..', '..', '..', 'packages', 'perception', 'test', 'fixtures-speech.wav')

// memory-engine reads DATA_DIR / SQLITE_PATH when it is first imported.
const root = mkdtempSync(path.join(tmpdir(), 'worker-perception-'))
process.env.DATA_DIR = root
process.env.SQLITE_PATH = path.join(root, 'db', 'app.sqlite')
process.env.WHISPER_MODEL = 'tiny'
delete process.env.GEMINI_API_KEY
delete process.env.ANTHROPIC_API_KEY
mkdirSync(path.join(root, 'db'), { recursive: true })

type MemoryEngine = typeof import('@cva/memory-engine')
let me: MemoryEngine
let runAnalyzePerceptionJob: typeof import('../src/jobs/analyze-perception.ts').runAnalyzePerceptionJob
let server: http.Server
let overloadNext = 0
let rejectSummaryNext = 0
const imagesPerCall: number[] = []

before(async () => {
  me = await import('@cva/memory-engine')
  ;({ runAnalyzePerceptionJob } = await import('../src/jobs/analyze-perception.ts'))
  me.migrate(me.getDb())

  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (overloadNext > 0) {
        overloadNext--
        res.writeHead(529, { 'retry-after': '1' })
        res.end('{"type":"error","error":{"type":"overloaded_error"}}')
        return
      }
      const content = JSON.parse(body).messages[0].content as Array<{ type: string; text?: string }>
      if (rejectSummaryNext > 0 && !content.some((c) => c.type === 'image')) {
        rejectSummaryNext--
        res.writeHead(400)
        res.end('{"type":"error","error":{"type":"invalid_request_error","message":"rechazado"}}')
        return
      }
      imagesPerCall.push(content.filter((c) => c.type === 'image').length)
      const times = content
        .filter((c) => c.type === 'text' && c.text!.startsWith('[t='))
        .map((c) => { const [m, s] = c.text!.slice(3, -1).split(':'); return Number(m) * 60 + Number(s) })
      const text = times.length
        ? JSON.stringify({
            scenes: times.map((t) => ({ start_seconds: t, end_seconds: t + 1, title: 'Color', description: 'Color sólido', audio_description: null })),
            elements: [{ kind: 'logo', label: 'marca', detail: null, start_seconds: 0, end_seconds: null }],
          })
        : '{"short_summary":"Prueba","full_summary":"Cuatro colores y una frase","topics":["prueba"],"language":"en"}'
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ content: [{ type: 'text', text }] }))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
})

after(() => {
  server?.close()
  me?.closeDb()
})

function queueVideo(title: string) {
  const id = crypto.randomUUID()
  const dir = path.join(root, 'videos', id)
  mkdirSync(dir, { recursive: true })
  execFileSync('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=2:r=30',
    '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=2:r=30',
    '-i', speech,
    '-filter_complex', '[0][1]concat=n=2:v=1:a=0[v];[2]apad=whole_dur=4[a]',
    '-map', '[v]', '-map', '[a]', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    path.join(dir, 'video.mp4'),
  ])
  const db = me.getDb()
  me.createVideo({ id, title, sourceKind: 'file', storedPath: `videos/${id}/video.mp4` }, db)
  me.setVideoStatus(id, 'queued', null, db)
  return { id, job: me.enqueueJob({ type: 'analyze', videoId: id }, db) }
}

const countRows = (table: string, id: string) =>
  (me.getDb().prepare(`SELECT count(*) AS n FROM ${table} WHERE video_id = ?`).get(id) as { n: number }).n

test('without any vision key the job fails but leaves the video retryable', { timeout: 300_000 }, async () => {
  const { id, job } = queueVideo('sin clave')
  await assert.rejects(runAnalyzePerceptionJob(job, me.getDb()), /Ningún proveedor de visión/)
  // retryOrFailJob, not the handler, decides when the video is 'failed'.
  assert.equal(me.getVideo(id, me.getDb())!.status, 'analyzing')
})

test('analyzes and stores scenes, transcript, elements and summary', { timeout: 300_000 }, async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const { id, job } = queueVideo('con claude')
  await runAnalyzePerceptionJob(job, me.getDb())
  assert.equal(me.getVideo(id, me.getDb())!.status, 'ready')
  assert.ok(countRows('scenes', id) >= 2)
  assert.ok(countRows('transcript_chunks', id) >= 1)
  // The invented kind "logo" was mapped instead of breaking the CHECK constraint.
  assert.equal(countRows('video_elements', id), 1)
  assert.ok(imagesPerCall.some((n) => n > 0) && imagesPerCall.some((n) => n === 0))
  // The analysis is queued for embedding, so it shows up in library search.
  const embedJobs = me.getDb().prepare("SELECT count(*) AS n FROM jobs WHERE type = 'embed' AND video_id = ?").get(id) as { n: number }
  assert.equal(embedJobs.n, 1)

  // Without embeddings (no Gemini), search still works on keywords alone.
  const inVideo = me.searchVideoKeywords(id, 'quick sentence', 8)
  assert.ok(inVideo.some((r) => r.source === 'transcript' && /quick test sentence/i.test(r.text)))
  assert.equal(me.searchVideoKeywords(id, 'palabrainexistente', 8).length, 0)
  const library = me.searchLibrary(null, 'heard', 15)
  assert.ok(library.some((r) => r.video_id === id && r.match_type === 'keyword'))
})

test('a 529 with Retry-After is waited out, not fatal', { timeout: 300_000 }, async () => {
  overloadNext = 1
  imagesPerCall.length = 0
  const { id, job } = queueVideo('claude saturado')
  await runAnalyzePerceptionJob(job, me.getDb())
  assert.equal(overloadNext, 0)
  assert.equal(me.getVideo(id, me.getDb())!.status, 'ready')

  // Every request is counted under its model: the 529 and each answered call.
  const rows = me.getDb().prepare("SELECT succeeded, request_count FROM analysis_runs WHERE video_id = ? AND model = 'claude'").all(id) as Array<{ succeeded: number; request_count: number }>
  assert.equal(rows.length, imagesPerCall.length + 1, 'the answered windows and summary, plus the failed 529')
  assert.equal(rows.filter((r) => r.succeeded === 0).length, 1)
  assert.ok(rows.every((r) => r.request_count === 1))
  // The job's own row stays at 0 requests, so nothing is counted twice.
  const summary = me.getDb().prepare("SELECT request_count FROM analysis_runs WHERE video_id = ? AND model = 'perception'").get(id) as { request_count: number }
  assert.equal(summary.request_count, 0)
})

test('a failed analysis leaves a checkpoint and the retry reuses it', { timeout: 300_000 }, async () => {
  const db = me.getDb()
  rejectSummaryNext = 1
  const { id, job } = queueVideo('reintento')
  await assert.rejects(runAnalyzePerceptionJob(job, db), /HTTP 400/)
  const saved = JSON.parse(me.getJob(job.id, db)!.result_json!)
  assert.equal(saved.engine, 'perception')
  assert.ok(saved.transcript.segments.length >= 1)
  assert.ok(Object.keys(saved.windows).length >= 1)

  // "Reintentar" creates a new job: it picks up the failed one's checkpoint
  // and only the summary is asked again.
  db.prepare("UPDATE jobs SET status = 'failed' WHERE id = ?").run(job.id)
  const retry = me.enqueueJob({ type: 'analyze', videoId: id }, db)
  imagesPerCall.length = 0
  await runAnalyzePerceptionJob(retry, db)
  assert.deepEqual(imagesPerCall, [0])
  assert.equal(me.getVideo(id, db)!.status, 'ready')
  assert.ok(countRows('scenes', id) >= 2)
})

test('captions saved by the download are used instead of Whisper', { timeout: 300_000 }, async () => {
  const db = me.getDb()
  const { id, job } = queueVideo('con subtítulos')
  writeFileSync(path.join(root, 'videos', id, 'captions.vtt'), 'WEBVTT\nLanguage: es\n\n00:00:00.500 --> 00:00:02.000\nLo que dice el subtítulo\n')
  const saved = process.env.WHISPER_MODEL
  process.env.WHISPER_MODEL = 'no-such-model' // transcribing would throw
  try {
    await runAnalyzePerceptionJob(job, db)
  } finally {
    process.env.WHISPER_MODEL = saved
  }
  const rows = db.prepare('SELECT text, language FROM transcript_chunks WHERE video_id = ?').all(id) as Array<{ text: string; language: string }>
  assert.deepEqual(rows, [{ text: 'Lo que dice el subtítulo', language: 'es' }])
})

test('the chat history is stored per video and goes away with the video', { timeout: 300_000 }, async () => {
  const db = me.getDb()
  const { id } = queueVideo('chat')
  me.addChatMessage({ videoId: id, role: 'user', text: '¿Cuánto cuesta?' }, db)
  me.addChatMessage({ videoId: id, role: 'assistant', text: '29 dólares [0:20].', provider: 'claude' }, db)
  me.addChatMessage({ videoId: id, role: 'user', text: '¿Y el envío?' }, db)

  const chat = me.listChatMessages(id, db)
  assert.deepEqual(chat.map((m) => m.role), ['user', 'assistant', 'user']) // oldest first
  assert.equal(chat[1]!.provider, 'claude')
  assert.throws(() => me.addChatMessage({ videoId: id, role: 'system' as 'user', text: 'x' }, db), /CHECK/)

  const md = me.chatToMarkdown('chat', chat)
  assert.match(md, /^# Chat: chat\n/)
  assert.match(md, /\*\*Tú\*\* · .*\n\n¿Cuánto cuesta\?/)
  assert.match(md, /\*\*Asistente \(claude\)\*\* · .*\n\n29 dólares \[0:20\]\./)

  assert.equal(me.clearChatMessages(id, db), 3)
  assert.equal(me.listChatMessages(id, db).length, 0)

  me.addChatMessage({ videoId: id, role: 'user', text: 'otra' }, db)
  me.deleteVideo(id, db)
  const left = db.prepare('SELECT count(*) AS n FROM video_chat_messages WHERE video_id = ?').get(id) as { n: number }
  assert.equal(left.n, 0)
})

test('folders: a trimmed name per video, empty takes it out', () => {
  const db = me.getDb()
  const id = crypto.randomUUID()
  me.createVideo({ id, title: 'carpeta', sourceKind: 'file', }, db)
  assert.equal(me.getVideo(id, db)!.folder, null)
  assert.equal(me.setVideoFolder(id, '  Recetas   de  cocina ', db), 'Recetas de cocina')
  assert.equal(me.getVideo(id, db)!.folder, 'Recetas de cocina')
  assert.equal(me.setVideoFolder(id, 'x'.repeat(100), db)!.length, me.MAX_FOLDER_CHARS)
  assert.equal(me.setVideoFolder(id, '   ', db), null)
  assert.equal(me.getVideo(id, db)!.folder, null)
})
