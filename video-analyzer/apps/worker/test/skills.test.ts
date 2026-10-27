// Skill jobs against a real (temporary) database and a local stand-in for
// Google's generateContent (GEMINI_BASE_URL), so the real client, rotation
// and request logging all run.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = mkdtempSync(path.join(tmpdir(), 'worker-skills-'))
process.env.DATA_DIR = root
process.env.SQLITE_PATH = path.join(root, 'db', 'app.sqlite')
process.env.GEMINI_SKILL_MODELS = 'modelo-a,modelo-b'
process.env.GEMINI_MODEL_DAILY_LIMITS = 'modelo-a=20,modelo-b=500'
mkdirSync(path.join(root, 'db'), { recursive: true })

type MemoryEngine = typeof import('@cva/memory-engine')
let me: MemoryEngine
let runDetectSkillsJob: typeof import('../src/jobs/detect-skills.ts').runDetectSkillsJob
let server: http.Server
const seen: string[] = []
let busyA = 0

before(async () => {
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const model = /models\/([^:]+):/.exec(req.url ?? '')?.[1] ?? '?'
      seen.push(model)
      if (model === 'modelo-a' && busyA > 0) {
        busyA--
        res.writeHead(503, { 'content-type': 'application/json' })
        res.end('{"error":{"code":503,"message":"The model is overloaded.","status":"UNAVAILABLE"}}')
        return
      }
      const candidates = [{ name: 'Etiquetar frascos', description: 'Cómo etiquetar frascos a mano', start_seconds: 2, end_seconds: 30, rationale: 'Muestra el método completo paso a paso', confidence: 0.9 }]
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ candidates }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  process.env.GEMINI_API_KEY = 'prueba'
  me = await import('@cva/memory-engine')
  ;({ runDetectSkillsJob } = await import('../src/jobs/detect-skills.ts'))
  me.migrate(me.getDb())
})

after(() => {
  server?.close()
  me?.closeDb()
})

function readyVideo(): string {
  const video = me.createVideo({ title: 'tutorial', sourceKind: 'file' })
  me.saveAnalysisResult(video.id, { summary: { shortSummary: 's', fullSummary: 'Un tutorial', topics: [], language: 'es' }, scenes: [], transcript: [{ index: 0, startSeconds: 0, endSeconds: 3, speaker: null, text: 'Primero pegamos la etiqueta', language: 'es' }], elements: [] })
  me.setVideoStatus(video.id, 'ready')
  return video.id
}

const claimed = (id: string) => me.getDb().prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1 WHERE id = ? RETURNING *").get(id) as import('@cva/memory-engine').JobRow

test('"Detectar skills": every request is counted under its own model, the reason is kept, and running it again does not duplicate', async () => {
  const id = readyVideo()
  busyA = 1
  seen.length = 0
  await runDetectSkillsJob(claimed(me.enqueueJob({ type: 'detect_skills', videoId: id }).id), me.getDb())
  assert.deepEqual(seen, ['modelo-a', 'modelo-b'], 'the 503 moves on to the next model')
  const rows = me.getDb().prepare("SELECT model, succeeded, request_count, input_tokens FROM analysis_runs WHERE video_id = ? AND phase = 'skill_detection' ORDER BY created_at").all(id) as Array<{ model: string; succeeded: number; request_count: number; input_tokens: number }>
  assert.deepEqual(rows.map((r) => [r.model, r.succeeded, r.request_count]), [['modelo-a', 0, 1], ['modelo-b', 1, 1]])
  assert.equal(rows[1]!.input_tokens, 100)
  const [skill] = me.listSkillsForVideo(id)
  assert.equal(skill!.name, 'etiquetar-frascos')
  assert.equal(skill!.rationale, 'Muestra el método completo paso a paso')

  await runDetectSkillsJob(claimed(me.enqueueJob({ type: 'detect_skills', videoId: id }).id), me.getDb())
  assert.equal(me.listSkillsForVideo(id).length, 1)
})

test('without GEMINI_API_KEY it fails once, says why, and counts nothing', async () => {
  const id = readyVideo()
  const key = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  const job = claimed(me.enqueueJob({ type: 'detect_skills', videoId: id }).id)
  try {
    await assert.rejects(runDetectSkillsJob(job, me.getDb()), /falta GEMINI_API_KEY/)
  } finally {
    process.env.GEMINI_API_KEY = key
  }
  assert.equal(job.max_attempts, job.attempts, 'no retries')
  me.retryOrFailJob(job, new Error('x'), me.getDb())
  assert.equal(me.getJob(job.id)!.status, 'failed')
  assert.equal((me.getDb().prepare('SELECT COUNT(*) AS n FROM analysis_runs WHERE video_id = ?').get(id) as { n: number }).n, 0)
})
