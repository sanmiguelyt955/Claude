import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = mkdtempSync(path.join(tmpdir(), 'skills-'))
process.env.DATA_DIR = path.join(root, 'data')
const { safeAssetName, writeSkillFolder } = await import('../src/index.ts')

test('file names the model proposes cannot leave the skill folder', async () => {
  const out = await writeSkillFolder({
    name: 'mi-skill',
    description: 'x',
    bodyMarkdown: 'y',
    references: [{ filename: '../../../../escapado.md', contents: 'fuera' }],
    scripts: [{ filename: '..\\..\\launcher.ps1', contents: 'fuera' }],
  })
  assert.equal(existsSync(path.join(root, 'escapado.md')), false)
  assert.deepEqual(out.assets.map((a) => a.path), [path.join('references', 'escapado.md'), path.join('scripts', 'launcher.ps1')])
  assert.equal(safeAssetName('..', 'x.md'), 'x.md')
  assert.equal(safeAssetName('notas de uso.md', 'x.md'), 'notas_de_uso.md')
})

test('the SKILL.md frontmatter stays valid YAML whatever the description says', async () => {
  const description = 'Uso: grabar un unboxing. # Paso 1: "abrir" la caja\nsin cortes'
  const { skillMd } = await writeSkillFolder({ name: 'unboxing', description, bodyMarkdown: 'x', references: [], scripts: [] })
  const line = skillMd.split('\n').find((l) => l.startsWith('description: '))!
  assert.equal(JSON.parse(line.slice('description: '.length)), 'Uso: grabar un unboxing. # Paso 1: "abrir" la caja sin cortes')
})

test('a skill never writes over another skill\'s folder; a retry of the same one starts clean', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const base = { description: 'd', bodyMarkdown: 'cuerpo', scripts: [] }
  const first = await writeSkillFolder({ ...base, name: 'editar-video', references: [{ filename: 'vieja.md', contents: 'v' }], owner: 'skill-a' })
  const other = await writeSkillFolder({ ...base, name: 'editar-video', references: [], owner: 'skill-b' })
  assert.notEqual(other.outputPath, first.outputPath)
  assert.match(other.outputPath, /editar-video-2$/)
  assert.match(other.skillMd, /^name: editar-video-2$/m, 'the frontmatter name matches its folder')
  assert.match(readFileSync(path.join(process.env.DATA_DIR!, first.outputPath, 'SKILL.md'), 'utf8'), /^name: editar-video$/m)
  // Skill a again (a retry): same folder, without the stale reference.
  const again = await writeSkillFolder({ ...base, name: 'editar-video', references: [], owner: 'skill-a' })
  assert.equal(again.outputPath, first.outputPath)
  assert.ok(!readdirSync(path.join(process.env.DATA_DIR!, first.outputPath)).includes('references'))
})

test('names drop the words the Agent Skills rules reserve; descriptions keep up to 1024 characters', async () => {
  const { normalizeSkillName, clampDescription } = await import('../src/index.ts')
  assert.equal(normalizeSkillName('Claude prompts para Anthropic'), 'prompts-para')
  assert.equal(normalizeSkillName('claudette-tips'), 'claudette-tips')
  const long = 'x'.repeat(900)
  assert.equal(clampDescription(long), long)
  assert.equal(clampDescription('y'.repeat(1100)).length, 1024)
})
