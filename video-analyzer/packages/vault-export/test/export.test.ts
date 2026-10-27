// Vault export against a real (temporary) database and vault folder.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = mkdtempSync(path.join(tmpdir(), 'vault-'))
process.env.DATA_DIR = root
process.env.SQLITE_PATH = path.join(root, 'db', 'app.sqlite')
process.env.OBSIDIAN_VAULT_PATH = path.join(root, 'vault')
process.env.OBSIDIAN_VIDEO_FOLDER = 'Videos'
mkdirSync(path.join(root, 'db'), { recursive: true })
mkdirSync(path.join(root, 'vault', 'Videos'), { recursive: true })
writeFileSync(path.join(root, 'vault', 'Videos', '_Índice.md'), '# Índice\n\n## Notas en esta carpeta\n')
const me = await import('@cva/memory-engine')
const { exportVideoToVault } = await import('../src/index.ts')
me.migrate(me.getDb())

function v6Video(title: string): string {
  const video = me.createVideo({ title, sourceKind: 'url', sourceUrl: 'https://www.tiktok.com/@a/video/1' })
  me.saveAnalysisResult(video.id, {
    summary: { shortSummary: 's', fullSummary: 'f', topics: [], language: 'es', protocolVersion: 'v6.5', protocolRecordMd: '---\ntitulo: "x"\n---\n# Registro\n\n## 9.1 Ficha\n' },
    scenes: [],
    transcript: [],
    elements: [],
  })
  me.setVideoStatus(video.id, 'ready')
  me.insertSkillCandidates(video.id, [{ name: 'etiquetar-frascos', description: 'Cómo etiquetar', startSeconds: 1, endSeconds: 9, confidence: 0.8 }])
  me.insertAnalysisRun({ videoId: video.id, phase: 'first_pass', model: 'gemini-3.8-flash', processingMode: null, inputTokens: 0, outputTokens: 0, cachedTokens: 0, thoughtTokens: 0, estimatedCostUsd: 0, latencyMs: 1, succeeded: true, requestCount: 1 })
  return video.id
}

test('a V6.5 note keeps the link to the post, the skills and the request log', async () => {
  const id = v6Video('Curso de Node.js')
  const { notePath, noteName } = await exportVideoToVault(id)
  assert.match(noteName, /^Curso de Node\.js \(/, 'the ".js" of a real title stays')
  const note = readFileSync(notePath, 'utf8')
  assert.ok(note.startsWith('---\ntitulo: "x"\n---'), 'the record frontmatter stays first')
  assert.match(note, /https:\/\/www\.tiktok\.com\/@a\/video\/1/)
  assert.match(note, /etiquetar-frascos/)
  assert.match(note, /Llamadas a la IA: \*\*1\*\*.*gemini-3\.8-flash 1/)
})

test('exporting again, another day, updates the same note and index entry', async () => {
  const id = v6Video('Otro video')
  const first = await exportVideoToVault(id)
  // As if it had been exported on an earlier day.
  const older = path.join(path.dirname(first.notePath), 'Otro video (1 ene 2026).md')
  writeFileSync(older, readFileSync(first.notePath, 'utf8'))
  const { rmSync } = await import('node:fs')
  rmSync(first.notePath)
  const indexPath = path.join(path.dirname(older), '_Índice.md')
  writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace(first.noteName, 'Otro video (1 ene 2026)'))
  const again = await exportVideoToVault(id)
  assert.equal(again.notePath, older)
  assert.equal(readdirSync(path.dirname(older)).filter((f) => f.startsWith('Otro video')).length, 1)
  const index = readFileSync(path.join(path.dirname(older), '_Índice.md'), 'utf8')
  assert.equal((index.match(/Otro video/g) ?? []).length, 1)
})
