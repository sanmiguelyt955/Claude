#!/usr/bin/env node
// Sube una carpeta de notas (por ejemplo una bóveda de Obsidian) a Memoria.
//
//   MEMORIA_URL=https://memoria.<cuenta>.workers.dev MEMORIA_KEY=mem_… node scripts/importar.mjs <carpeta> [--prefijo Carpeta/En/Memoria]
//
// Las notas .md se importan (las iguales se saltan; las distintas reemplazan
// a la actual, que queda en el historial). Los demás archivos se suben como
// adjuntos. Las carpetas ocultas (.obsidian, .git, .trash…) se dejan fuera.
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const [dir, ...rest] = process.argv.slice(2)
const base = (process.env.MEMORIA_URL ?? '').replace(/\/+$/, '')
const key = process.env.MEMORIA_KEY ?? process.env.MEMORIA_API_TOKEN ?? ''
const prefixAt = rest.indexOf('--prefijo')
const prefix = prefixAt >= 0 ? (rest[prefixAt + 1] ?? '').replace(/^\/+|\/+$/g, '') : ''
if (!dir || !base || !key) {
  console.error('Uso: MEMORIA_URL=… MEMORIA_KEY=… node scripts/importar.mjs <carpeta> [--prefijo Carpeta]')
  process.exit(2)
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', mp4: 'video/mp4', mp3: 'audio/mpeg', json: 'application/json', txt: 'text/plain; charset=utf-8', canvas: 'application/json' }

async function* walk(root, rel = '') {
  for (const entry of await readdir(path.join(root, rel), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const r = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) yield* walk(root, r)
    else if (entry.isFile()) yield r
  }
}

async function call(method, p, body, headers = {}) {
  const res = await fetch(`${base}${p}`, { method, headers: { authorization: `Bearer ${key}`, ...headers }, body })
  const json = (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : null
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return json
}

const notes = []
let files = 0
let same = 0
let failed = 0
// Files already there with the same size are not sent again.
const existing = new Map((await call('GET', '/api/tree')).files.map((f) => [f.path, f.size]))
for await (const rel of walk(path.resolve(dir))) {
  const target = prefix ? `${prefix}/${rel}` : rel
  const full = path.join(path.resolve(dir), rel)
  if (/\.md$/i.test(rel)) {
    notes.push({ path: target, content: await readFile(full, 'utf8') })
    continue
  }
  const size = (await stat(full)).size
  if (existing.get(target) === size) {
    same++
    continue
  }
  if (size > 100 * 1024 * 1024) {
    console.warn(`omitido (más de 100 MB): ${rel}`)
    continue
  }
  try {
    const ext = rel.split('.').pop().toLowerCase()
    await call('POST', `/api/file?path=${encodeURIComponent(target)}`, await readFile(full), { 'content-type': MIME[ext] ?? 'application/octet-stream' })
    files++
  } catch (err) {
    failed++
    console.warn(`archivo ${rel}: ${err.message}`)
  }
}
let created = 0
let updated = 0
let unchanged = 0
for (let i = 0; i < notes.length; i += 200) {
  const r = await call('POST', '/api/import', JSON.stringify({ notes: notes.slice(i, i + 200) }), { 'content-type': 'application/json' })
  created += r.created
  updated += r.updated
  unchanged += r.unchanged
  for (const f of r.failed) {
    failed++
    console.warn(`nota ${f.path}: ${f.error}`)
  }
}
console.log(`Listo: ${created} notas nuevas, ${updated} actualizadas, ${unchanged} iguales, ${files} archivos subidos${same ? `, ${same} archivos iguales` : ''}${failed ? `, ${failed} con error` : ''}.`)
process.exit(failed ? 1 : 0)
