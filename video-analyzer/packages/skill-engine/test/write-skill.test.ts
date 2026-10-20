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
