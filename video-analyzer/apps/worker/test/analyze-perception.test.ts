// End-to-end test of the perception job against a real (temporary) SQLite
// database and a local server that stands in for the Anthropic API, so the
// real Claude provider code, the fallback chain and the persistence all run.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync } from 'node:fs'
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
})

test('a 529 with Retry-After is waited out, not fatal', { timeout: 300_000 }, async () => {
  overloadNext = 1
  const { id, job } = queueVideo('claude saturado')
  await runAnalyzePerceptionJob(job, me.getDb())
  assert.equal(overloadNext, 0)
  assert.equal(me.getVideo(id, me.getDb())!.status, 'ready')
})
