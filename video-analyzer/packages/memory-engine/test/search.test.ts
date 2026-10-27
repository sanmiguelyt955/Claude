// Library memory against a real (temporary) SQLite database with sqlite-vec.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// memory-engine reads DATA_DIR / SQLITE_PATH when it is first imported.
const root = mkdtempSync(path.join(tmpdir(), 'memory-search-'))
process.env.DATA_DIR = root
process.env.SQLITE_PATH = path.join(root, 'db', 'app.sqlite')
mkdirSync(path.join(root, 'db'), { recursive: true })
const here = path.dirname(fileURLToPath(import.meta.url))

type MemoryEngine = typeof import('../src/index.ts')
let me: MemoryEngine

before(async () => {
  me = await import('../src/index.ts')
  me.migrate(me.getDb())
})

const RECORD = `# Registro

## 9.5 Línea de tiempo canónica

[00:00–00:01]
VIS: Una mujer sostiene un frasco de crema.
AUD: Música suave.
TXT: SIN CAMBIOS.
CAM: Fija.

[00:01–00:02]
VIS: Primer plano del frasco.
TXT: Aparece el precio.

[00:20–00:21]
VIS: Un vagón de metro llega a la estación.

## 9.6 Transcripción literal

[00:00] Hola.

## 9.7 Texto en pantalla

**TX1** — aparece 00:01.50 / desaparece 00:04.00 (00:02.50)
TIPO: rótulo superpuesto
POSICIÓN: inferior central
CONTENIDO: OFERTA 29 €
APARIENCIA: letras rojas

**TX2** — aparece 01:02.25 / desaparece 01:05.00 (00:02.75)
TIPO: texto dentro de la escena
POSICIÓN: lateral del vagón
CONTENIDO: 9895
`

function analyzedVideo(record: string | null = RECORD, transcript = 'Esta crema cuesta 29 dólares y el precio incluye el envío'): string {
  const video = me.createVideo({ title: 'crema', sourceKind: 'file' })
  me.saveAnalysisResult(video.id, {
    summary: { shortSummary: 'Anuncio', fullSummary: 'Un anuncio de crema', topics: ['crema'], language: 'es', protocolVersion: record ? 'v6.5' : null, protocolRecordMd: record },
    scenes: [],
    transcript: [{ index: 0, startSeconds: 0, endSeconds: 3, speaker: null, text: transcript, language: 'es' }],
    elements: [],
  })
  return video.id
}

test('the V6.5 record is indexed: its seconds in pieces and every on-screen text with its times', () => {
  const pieces = me.recordChunks(RECORD)
  assert.deepEqual(pieces.map((p) => [p.source, p.startSeconds, p.endSeconds]), [['scene', 0, 2], ['scene', 20, 21], ['element', 1.5, 4], ['element', 62.25, 65]])
  assert.match(pieces[0]!.text, /frasco de crema.*Aparece el precio/)
  assert.doesNotMatch(pieces[0]!.text, /SIN CAMBIOS|CAM:/)
  assert.equal(pieces[2]!.text, 'Texto en pantalla: OFERTA 29 € (rótulo superpuesto, inferior central)')

  const id = analyzedVideo()
  const hits = me.searchVideoKeywords(id, '9895', 5)
  assert.equal(hits.length, 1, JSON.stringify(hits.map((h) => [h.source, h.text])))
  assert.equal(hits[0]!.start_seconds, 62.25)
  // The second of 9.5 and the text read on the side of the carriage.
  assert.deepEqual(me.searchLibrary(null, 'vagón', 5).filter((r) => r.video_id === id).map((r) => r.start_seconds).sort((x, y) => x! - y!), [20, 62.25])
})

test('keyword search finds short terms, numbers and natural questions', () => {
  const id = analyzedVideo(null)
  for (const q of ['precio ...', 'cuánto cuesta la crema', '¿qué dice del precio?', '29', 'crema envío']) {
    assert.ok(me.searchVideoKeywords(id, q, 5).length >= 1, q)
  }
  const ia = analyzedVideo(null, 'La IA genera modelos en 3D')
  assert.equal(me.searchVideoKeywords(ia, 'IA', 5).length, 1)
  assert.equal(me.searchVideoKeywords(ia, '3D', 5).length, 1)
  assert.deepEqual(me.searchVideoKeywords(ia, '¿ y ?', 5), [])
})

test('per-video search still finds pieces that are not embedded yet', () => {
  const id = analyzedVideo(null)
  assert.ok(me.getPendingChunks(id).length > 0)
  const results = me.searchVideo(id, [], 'precio', 8)
  assert.equal(results.length, 1)
  assert.equal(results[0]!.match_type, 'keyword')
})

test('quick jobs are claimed before long analyses; the page poll does not read the checkpoint', () => {
  const db = me.getDb()
  db.prepare("UPDATE jobs SET status = 'done' WHERE status = 'queued'").run()
  const a = me.createVideo({ title: 'a', sourceKind: 'file' })
  const analyze = me.enqueueJob({ type: 'analyze', videoId: a.id })
  const embed = me.enqueueJob({ type: 'embed', videoId: a.id })
  db.prepare("UPDATE jobs SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(analyze.id)
  const first = me.claimNextJob()!
  assert.equal(first.id, embed.id, JSON.stringify({ first: [first.type, first.created_at, first.run_after], analyze: analyze.id }))
  assert.equal(me.claimNextJob()!.id, analyze.id)
  me.completeJob(embed.id, {})
  me.saveJobCheckpoint(analyze.id, JSON.stringify({ windows: { big: 'x'.repeat(1000) } }))
  const active = me.getActiveJobForVideo(a.id)!
  assert.equal(active.id, analyze.id)
  assert.equal(active.result_json, null)
  assert.equal(active.progress_current, 0)
})

test('db:check passes on a library that already has embeddings', () => {
  const id = analyzedVideo(null)
  const [chunk] = me.getPendingChunks(id)
  me.insertEmbeddingsBatch(id, [{ chunkRowid: chunk!.rowid, embedding: Array.from({ length: me.EMBEDDING_DIMENSIONS }, (_, i) => (i % 7) / 7) }], me.EMBEDDING_MODEL)
  me.closeDb()
  const out = execFileSync(process.execPath, ['--import', 'tsx', path.join(here, '..', 'src', 'cli', 'check.ts')], { env: process.env, encoding: 'utf8' })
  assert.doesNotMatch(out, /Fallo/)
})

test('a new embedding model drops the old vectors and queues the library to be indexed again', () => {
  const db = me.getDb()
  const embedded = (db.prepare('SELECT COUNT(*) AS n FROM memory_chunks WHERE embedding_rowid IS NOT NULL').get() as { n: number }).n
  assert.ok(embedded >= 1)
  db.prepare("UPDATE meta SET value = 'modelo-viejo' WHERE key = 'embedding_model'").run()
  db.prepare("UPDATE jobs SET status = 'done' WHERE type = 'embed'").run()
  me.migrate(db)
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM memory_chunks WHERE embedding_rowid IS NOT NULL').get() as { n: number }).n, 0)
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM vec_memory_chunks').get() as { n: number }).n, 0)
  const videos = (db.prepare('SELECT COUNT(DISTINCT video_id) AS n FROM memory_chunks').get() as { n: number }).n
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type = 'embed' AND status = 'queued'").get() as { n: number }).n, videos)
  // Same model again: nothing happens.
  me.migrate(db)
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type = 'embed' AND status = 'queued'").get() as { n: number }).n, videos)
})
