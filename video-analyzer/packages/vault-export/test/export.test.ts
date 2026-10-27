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

test('with MEMORIA_URL and MEMORIA_KEY the note goes to Memoria, and a second export updates the same note', async () => {
  const http = await import('node:http')
  const notes = new Map<string, string>()
  const auth: string[] = []
  const server = http.createServer(async (req, res) => {
    auth.push(String(req.headers.authorization))
    const url = new URL(req.url!, 'http://x')
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.headers.authorization !== 'Bearer mem_prueba') return send(401, { error: 'Inicia sesión.' })
    if (url.pathname === '/api/search') {
      const id = url.searchParams.get('q')!.replace(/"/g, '')
      return send(200, { results: [...notes].filter(([, c]) => c.includes(id)).map(([path]) => ({ path })) })
    }
    if (url.pathname === '/api/note') return send(200, { note: { content: notes.get(url.searchParams.get('path')!) } })
    if (url.pathname === '/api/import') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      for (const n of JSON.parse(raw).notes) notes.set(n.path, n.content)
      return send(200, { created: 1, updated: 0, unchanged: 0, failed: [] })
    }
    send(404, { error: 'no' })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { exportVideoToMemoria } = await import('../src/index.ts')
  process.env.MEMORIA_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  process.env.MEMORIA_KEY = 'mem_prueba'
  try {
    const id = v6Video('Video para Memoria')
    const first = await exportVideoToMemoria(id)
    assert.match(first.notePath, /^Videos\/Video para Memoria \(.+\)\.md$/)
    assert.equal(first.url, `${process.env.MEMORIA_URL.replace(/\/$/, '')}/n/${encodeURIComponent(first.notePath)}`)
    assert.match(notes.get(first.notePath)!, /etiquetar-frascos/)
    const again = await exportVideoToMemoria(id)
    assert.equal(again.notePath, first.notePath, 'the note made for this video is updated, not copied')
    assert.equal(notes.size, 1)
    process.env.MEMORIA_KEY = 'mem_mala'
    await assert.rejects(exportVideoToMemoria(id), /Memoria rechazó la clave/)
    assert.ok(auth.every((a) => a.startsWith('Bearer mem_')))
  } finally {
    delete process.env.MEMORIA_URL
    delete process.env.MEMORIA_KEY
    server.close()
  }
})

test('a record too big for one Memoria note is cut into parts at headings, nothing lost', async () => {
  const { splitForMemoria } = await import('../src/index.ts')
  const section = (n: number) => `## 9.${n} Sección\n${'línea con texto ñ\n'.repeat(400)}`
  const md = Array.from({ length: 12 }, (_, i) => section(i)).join('\n')
  const parts = splitForMemoria(md, 20_000)
  assert.ok(parts.length > 1)
  assert.ok(parts.every((p) => Buffer.byteLength(p) <= 20_000), parts.map((p) => Buffer.byteLength(p)).join(','))
  assert.ok(parts.slice(1).every((p) => p.startsWith('## 9.')), 'each part starts at a section')
  assert.equal(parts.join('').replace(/\n+/g, '\n'), md.replace(/\n+/g, '\n'))
  // One enormous line is cut too.
  const long = splitForMemoria('x'.repeat(50_000), 20_000)
  assert.equal(long.join('').replace(/\n/g, ''), 'x'.repeat(50_000))
  assert.ok(long.every((p) => Buffer.byteLength(p) <= 20_000))
})
