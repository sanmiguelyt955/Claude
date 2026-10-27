// Route handlers of /api/skills/**, /api/skill-improvements/** and
// "Mejorar Skill" called directly (no Next server) against a temporary
// SQLite database and DATA_DIR.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, lstatSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// memory-engine reads DATA_DIR / SQLITE_PATH when it is first imported.
const root = mkdtempSync(path.join(tmpdir(), 'web-api-skills-'))
process.env.DATA_DIR = root
process.env.SQLITE_PATH = path.join(root, 'db', 'app.sqlite')

type MemoryEngine = typeof import('@cva/memory-engine')
let me: MemoryEngine

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const post = (url: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

before(async () => {
  me = await import('@cva/memory-engine')
  me.migrate(me.getDb())
})

function readyVideo(): string {
  const video = me.createVideo({ title: 'Prueba', sourceKind: 'file' })
  me.setVideoStatus(video.id, 'ready')
  return video.id
}

function externalSkill(name: string, text = '# Mi skill\nLinea original 1\nLinea original 2\n'): string {
  const file = path.join(root, 'externas', name, 'SKILL.md')
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
  return file
}

function improvement(target: { skillId?: string; sourceSkillPath?: string }, title: string): string {
  const [row] = me.insertSkillImprovements(
    { videoId: readyVideo(), skillId: target.skillId ?? null, sourceSkillPath: target.sourceSkillPath ?? null },
    [{ kind: 'new_step', title, rationale: 'r', startSeconds: null, endSeconds: null, proposedDiff: `Contenido ${title}` }],
  )
  return row.id
}

function generatedSkill(name: string): { id: string; file: string } {
  const [skill] = me.insertSkillCandidates(readyVideo(), [
    { name, description: 'd', startSeconds: null, endSeconds: null, confidence: null },
  ])
  const outputPath = path.join('skills-generadas', name)
  const file = path.join(root, outputPath, 'SKILL.md')
  mkdirSync(path.dirname(file), { recursive: true })
  const skillMd = '# Interna\nTexto original\n'
  writeFileSync(file, skillMd)
  me.claimSkillForGeneration(skill.id)
  me.saveGeneratedSkill(skill.id, { skillMd, outputPath, assets: [] })
  return { id: skill.id, file }
}

const sections = (text: string) => (text.match(/^## Actualizacion: /gm) ?? []).length

// ── [Aplicar] ──────────────────────────────────────────────────────────────

test('three simultaneous "Aplicar" on one improvement: one applies, the others get 409, nothing is lost', async () => {
  const apply = await import('../src/app/api/skill-improvements/[id]/apply/route')
  const file = externalSkill('una')
  const id = improvement({ sourceSkillPath: file }, 'X')
  const results = await Promise.all([1, 2, 3].map(() => apply.POST(post(`/api/skill-improvements/${id}/apply`), ctx(id))))
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409])
  const text = readFileSync(file, 'utf8')
  assert.match(text, /Linea original 1\nLinea original 2/)
  assert.equal(sections(text), 1)
  assert.equal(me.getSkillImprovement(id)?.status, 'applied')
  // No temp file is left next to the SKILL.md.
  assert.deepEqual(readdirSync(path.dirname(file)), ['SKILL.md'])
})

test('two different improvements applied at once on the same external SKILL.md both land', async () => {
  const apply = await import('../src/app/api/skill-improvements/[id]/apply/route')
  const file = externalSkill('dos')
  const x = improvement({ sourceSkillPath: file }, 'X')
  const y = improvement({ sourceSkillPath: file }, 'Y')
  const results = await Promise.all([x, y].map((id) => apply.POST(post(`/api/skill-improvements/${id}/apply`), ctx(id))))
  assert.deepEqual(results.map((r) => r.status), [200, 200])
  const text = readFileSync(file, 'utf8')
  assert.match(text, /Linea original 1\nLinea original 2/)
  assert.match(text, /## Actualizacion: X/)
  assert.match(text, /## Actualizacion: Y/)
})

test('two improvements applied at once on the same generated skill both land, on disk and in the database', async () => {
  const apply = await import('../src/app/api/skill-improvements/[id]/apply/route')
  const skill = generatedSkill('interna-dos')
  const x = improvement({ skillId: skill.id }, 'X')
  const y = improvement({ skillId: skill.id }, 'Y')
  const results = await Promise.all([x, y].map((id) => apply.POST(post(`/api/skill-improvements/${id}/apply`), ctx(id))))
  assert.deepEqual(results.map((r) => r.status), [200, 200])
  const row = me.getSkill(skill.id)!
  assert.equal(sections(row.skill_md!), 2)
  assert.match(row.skill_md!, /Texto original/)
  assert.equal(readFileSync(skill.file, 'utf8'), row.skill_md)
  assert.equal(row.version, 3)
})

test('a failed write leaves the improvement "proposed" so it can be applied again', async () => {
  const apply = await import('../src/app/api/skill-improvements/[id]/apply/route')
  const skill = generatedSkill('sin-carpeta')
  rmSync(path.dirname(skill.file), { recursive: true })
  const id = improvement({ skillId: skill.id }, 'X')
  const res = await apply.POST(post(`/api/skill-improvements/${id}/apply`), ctx(id))
  assert.equal(res.status, 500)
  assert.match(((await res.json()) as { error: string }).error, /No se pudo/)
  assert.equal(me.getSkillImprovement(id)?.status, 'proposed')
  assert.equal(me.getSkill(skill.id)?.version, 1)
})

test('apply refuses a target that is not an existing SKILL.md, and touches nothing', async () => {
  const apply = await import('../src/app/api/skill-improvements/[id]/apply/route')
  const notes = path.join(root, 'victima', 'notes.txt')
  mkdirSync(path.dirname(notes), { recursive: true })
  writeFileSync(notes, 'privado\n')
  const id = improvement({ sourceSkillPath: notes }, 'X')
  const res = await apply.POST(post(`/api/skill-improvements/${id}/apply`), ctx(id))
  assert.equal(res.status, 400)
  assert.match(((await res.json()) as { error: string }).error, /SKILL\.md/)
  assert.equal(readFileSync(notes, 'utf8'), 'privado\n')
  assert.equal(me.getSkillImprovement(id)?.status, 'proposed')

  const gone = externalSkill('borrada')
  const id2 = improvement({ sourceSkillPath: gone }, 'X')
  rmSync(gone)
  assert.equal((await apply.POST(post(`/api/skill-improvements/${id2}/apply`), ctx(id2))).status, 400)
  assert.equal(me.getSkillImprovement(id2)?.status, 'proposed')
})

test('apply through a symlinked SKILL.md updates the real file and keeps the link', async () => {
  const apply = await import('../src/app/api/skill-improvements/[id]/apply/route')
  const real = externalSkill('real')
  const link = path.join(root, 'externas', 'enlace', 'SKILL.md')
  mkdirSync(path.dirname(link), { recursive: true })
  symlinkSync(real, link)
  const id = improvement({ sourceSkillPath: link }, 'X')
  assert.equal((await apply.POST(post(`/api/skill-improvements/${id}/apply`), ctx(id))).status, 200)
  assert.ok(lstatSync(link).isSymbolicLink())
  assert.equal(sections(readFileSync(real, 'utf8')), 1)
})

// ── Mejorar Skill: the path the user typed ─────────────────────────────────

test('improve-skill checks the SKILL.md path before queuing anything', async () => {
  const improve = await import('../src/app/api/videos/[id]/improve-skill/route')
  const file = externalSkill('buena')
  const notSkill = path.join(root, 'externas', 'buena', 'notas.md')
  writeFileSync(notSkill, 'x')
  const emptyDir = path.join(root, 'externas', 'vacia')
  mkdirSync(emptyDir, { recursive: true })

  const call = async (sourceSkillPath: string) => {
    const id = readyVideo()
    const res = await improve.POST(post(`/api/videos/${id}/improve-skill`, { sourceSkillPath }), ctx(id))
    const body = (await res.json()) as { error?: string; jobId?: string }
    const payload = body.jobId ? (JSON.parse(me.getJob(body.jobId)!.payload_json) as { sourceSkillPath: string }) : null
    return { status: res.status, error: body.error, path: payload?.sourceSkillPath }
  }

  // "Copiar como ruta" in the Windows Explorer wraps the path in quotes.
  assert.deepEqual(await call(`  "${file}"  `), { status: 202, error: undefined, path: file })
  assert.deepEqual(await call(`'${file}'`), { status: 202, error: undefined, path: file })
  // The skill's folder is enough.
  assert.deepEqual(await call(path.dirname(file)), { status: 202, error: undefined, path: file })

  for (const bad of ['/etc/passwd', '/no/existe/SKILL.md', 'relativa/SKILL.md', notSkill, emptyDir, '""']) {
    const result = await call(bad)
    assert.equal(result.status, 400, bad)
    assert.match(result.error ?? '', /SKILL\.md|ruta/, bad)
    assert.equal(result.path, undefined)
  }
})

// ── Descartar ──────────────────────────────────────────────────────────────

test('discard: a candidate is discarded; one whose generation has not started is cancelled too; one being generated is refused', async () => {
  const discard = await import('../src/app/api/skills/[id]/discard/route')
  const generate = await import('../src/app/api/skills/[id]/generate/route')
  const candidates = me.insertSkillCandidates(readyVideo(), [
    { name: 'a', description: 'd', startSeconds: null, endSeconds: null, confidence: null },
    { name: 'b', description: 'd', startSeconds: null, endSeconds: null, confidence: null },
    { name: 'c', description: 'd', startSeconds: null, endSeconds: null, confidence: null },
  ])
  const [a, b, c] = candidates.map((s) => s.id)

  const plain = await discard.POST(post(`/api/skills/${a}/discard`), ctx(a))
  assert.equal(plain.status, 200)
  assert.equal(me.getSkill(a)?.status, 'discarded')

  // Crear Skill, then Descartar before the worker picks the job up.
  const queued = (await (await generate.POST(post(`/api/skills/${b}/generate`), ctx(b))).json()) as { jobId: string }
  const early = await discard.POST(post(`/api/skills/${b}/discard`), ctx(b))
  assert.equal(early.status, 200)
  assert.equal(me.getSkill(b)?.status, 'discarded')
  assert.equal(me.getJob(queued.jobId)?.status, 'cancelled')

  // Crear Skill, and the worker already started it: too late to discard.
  const running = (await (await generate.POST(post(`/api/skills/${c}/generate`), ctx(c))).json()) as { jobId: string }
  me.getDb().prepare("UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?").run(new Date().toISOString(), running.jobId)
  const late = await discard.POST(post(`/api/skills/${c}/discard`), ctx(c))
  assert.equal(late.status, 409)
  assert.match(((await late.json()) as { error: string }).error, /generando|creando/)
  assert.equal(me.getSkill(c)?.status, 'generating')

  assert.equal((await discard.POST(post('/api/skills/nope/discard'), ctx('nope'))).status, 404)
})
