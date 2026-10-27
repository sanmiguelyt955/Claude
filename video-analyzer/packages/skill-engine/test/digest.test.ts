// The text the skill calls read about a video, built from a real (temporary) database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = mkdtempSync(path.join(tmpdir(), 'skills-digest-'))
process.env.DATA_DIR = root
process.env.SQLITE_PATH = path.join(root, 'db', 'app.sqlite')
mkdirSync(path.join(root, 'db'), { recursive: true })
const me = await import('@cva/memory-engine')
const { buildVideoDigest, buildSegmentDigest } = await import('../src/index.ts')
me.migrate(me.getDb())

const RECORD = `## 9.5 Línea de tiempo canónica

[00:10–00:11]
VIS: Las manos pegan la etiqueta en el frasco, sin hablar.

[01:30–01:31]
VIS: Cierra la caja.

## 9.7 Texto en pantalla

**TX1** — aparece 00:10.50 / desaparece 00:12.00 (00:01.50)
TIPO: rótulo
CONTENIDO: PASO 1: ETIQUETAR

## 9.12 Patrones replicables

- Mostrar el paso antes de explicarlo.
`

test('detection and generation read the V6.5 record: the silent steps, the screen texts and the patterns', () => {
  const video = me.createVideo({ title: 'v', sourceKind: 'file' })
  me.saveAnalysisResult(video.id, {
    summary: { shortSummary: 's', fullSummary: 'Un tutorial', topics: [], language: 'es', protocolVersion: 'v6.5', protocolRecordMd: RECORD },
    scenes: [],
    transcript: [],
    elements: [],
  })
  const all = buildVideoDigest(video.id)
  assert.match(all, /pegan la etiqueta/)
  assert.match(all, /PASO 1: ETIQUETAR/)
  assert.match(all, /Mostrar el paso antes de explicarlo/)
  const segment = buildSegmentDigest(video.id, 8, 20)
  assert.match(segment, /pegan la etiqueta/)
  assert.match(segment, /PASO 1/)
  assert.doesNotMatch(segment, /Cierra la caja/, 'only the stretch of the skill (plus 5 s)')
})
