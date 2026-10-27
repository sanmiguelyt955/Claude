// Quota decisions of the worker against a real (temporary) SQLite database.
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// memory-engine reads DATA_DIR / SQLITE_PATH when it is first imported.
const root = mkdtempSync(path.join(tmpdir(), 'worker-quota-'))
process.env.DATA_DIR = root
process.env.SQLITE_PATH = path.join(root, 'db', 'app.sqlite')
process.env.GEMINI_VIDEO_MODELS = 'gemini-3.8-flash,gemini-3.6-flash,gemini-3.5-flash-lite'
process.env.GEMINI_MODEL_DAILY_LIMITS = 'gemini-3.8-flash=20,gemini-3.6-flash=20,gemini-3.5-flash-lite=500'
delete process.env.GEMINI_SKILL_MODELS
delete process.env.GEMINI_SKILL_MODEL
mkdirSync(path.join(root, 'db'), { recursive: true })

type MemoryEngine = typeof import('@cva/memory-engine')
let me: MemoryEngine
let quota: typeof import('../src/quota.ts')
let runAnalyzeBatchJob: typeof import('../src/jobs/analyze-batch.ts').runAnalyzeBatchJob

before(async () => {
  me = await import('@cva/memory-engine')
  quota = await import('../src/quota.ts')
  ;({ runAnalyzeBatchJob } = await import('../src/jobs/analyze-batch.ts'))
  me.migrate(me.getDb())
})

beforeEach(() => {
  me.getDb().prepare('DELETE FROM analysis_runs').run()
  delete process.env.GEMINI_SKILL_MODEL
})

/** `n` requests to `model`, `secondsAgo` seconds ago. */
function spent(model: string, n: number, secondsAgo = 600): void {
  const video = me.createVideo({ title: 'q', sourceKind: 'file' })
  const at = new Date(Date.now() - secondsAgo * 1000).toISOString()
  for (let i = 0; i < n; i++) {
    const row = me.insertAnalysisRun({ videoId: video.id, phase: 'first_pass', model, processingMode: null, inputTokens: 0, outputTokens: 0, cachedTokens: 0, thoughtTokens: 0, estimatedCostUsd: 0, latencyMs: 0, succeeded: true, requestCount: 1 })
    me.getDb().prepare('UPDATE analysis_runs SET created_at = ? WHERE id = ?').run(at, row.id)
  }
}

test('Flash out for the day and Flash-Lite pacing itself: the job waits about a minute, not until midnight', () => {
  spent('gemini-3.8-flash', 20)
  spent('gemini-3.6-flash', 20)
  spent('gemini-3.5-flash-lite', 5, 20) // 5 in the last minute, the oldest 20 s ago
  const choice = quota.pickVideoModel(me.getDb())
  assert.equal(choice.ok, false)
  const wait = (choice as { retryAfter: Date }).retryAfter.getTime() - Date.now()
  assert.ok(wait > 30_000 && wait <= 41_000, `waits ${Math.round(wait / 1000)} s`)
  assert.doesNotMatch((choice as { reason: string }).reason, /Sin cupo diario/)
  const skills = quota.skillPoolBlock(me.getDb())
  assert.ok(skills.retryAfter.getTime() - Date.now() <= 41_000)

  // All out for the day: then it is midnight, and the label says so.
  spent('gemini-3.5-flash-lite', 495)
  const all = quota.pickVideoModel(me.getDb()) as { retryAfter: Date; reason: string }
  assert.ok(all.retryAfter.getTime() - Date.now() > 60_000)
  assert.match(all.reason, /Sin cupo diario en ninguno/)
})

test('GEMINI_SKILL_MODEL picks the model the skill calls use first', () => {
  assert.equal(quota.listSkillModelsWithQuota(me.getDb())[0], 'gemini-3.8-flash')
  process.env.GEMINI_SKILL_MODEL = 'gemini-3.5-flash-lite'
  assert.deepEqual(quota.listSkillModelsWithQuota(me.getDb()), ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash'])
})

test('a batch put off several times queues its long video once, not once per try', async () => {
  const db = me.getDb()
  for (const model of ['gemini-3.8-flash', 'gemini-3.6-flash']) spent(model, 20)
  spent('gemini-3.5-flash-lite', 500)
  const short = me.createVideo({ title: 'corto', sourceKind: 'file' })
  const long = me.createVideo({ title: 'largo', sourceKind: 'file' })
  db.prepare("UPDATE videos SET status = 'queued', duration_seconds = 20 WHERE id = ?").run(short.id)
  db.prepare("UPDATE videos SET status = 'queued', duration_seconds = 300 WHERE id = ?").run(long.id)
  const job = me.enqueueJob({ type: 'analyze', videoId: short.id, payload: { videoIds: [short.id, long.id] } })
  for (let round = 0; round < 3; round++) {
    const claimed = db.prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1 WHERE id = ? RETURNING *").get(job.id) as typeof job
    await assert.rejects(runAnalyzeBatchJob(claimed, db), (e: Error) => e.name === 'JobDeferred')
  }
  // Still blocked: nothing is queued for it yet. Once a model is free, one job.
  assert.equal(me.listJobsForVideo(long.id).filter((j) => j.type === 'analyze').length, 0)
})
