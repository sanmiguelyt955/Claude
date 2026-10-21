import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, chmod, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const EXAMPLE_PATH =
  process.platform === 'win32' ? 'C:\\Users\\tu-nombre\\skills\\mi-skill\\SKILL.md' : '/home/tu-nombre/skills/mi-skill/SKILL.md'

/**
 * Checks the SKILL.md path the user typed for "Mejorar Skill", so a wrong one
 * is answered right away instead of failing three times later in the worker
 * (or sending some other file to Gemini, and [Aplicar] appending to it).
 * Accepts what the Windows Explorer's "Copiar como ruta" gives (the path in
 * quotes) and the skill's folder instead of the file. Returns the absolute
 * path of an existing, readable file named SKILL.md.
 */
export async function resolveSkillMdPath(raw: string): Promise<{ path: string } | { error: string }> {
  const typed = raw.trim().replace(/^(["'])(.*)\1$/s, '$2').trim()
  if (!typed) return { error: 'Escribe la ruta del archivo SKILL.md.' }
  if (!path.isAbsolute(typed)) {
    return { error: `Escribe la ruta completa del archivo SKILL.md, por ejemplo ${EXAMPLE_PATH}` }
  }

  let file = path.resolve(typed)
  let info = await stat(file).catch(() => null)
  if (!info) return { error: 'No se encontró nada en esa ruta. Revisa que esté bien escrita.' }
  if (info.isDirectory()) {
    file = path.join(file, 'SKILL.md')
    info = await stat(file).catch(() => null)
    if (!info) return { error: 'Esa carpeta no tiene un archivo SKILL.md.' }
  }
  if (path.basename(file).toLowerCase() !== 'skill.md') {
    return { error: `La ruta debe llevar a un archivo llamado SKILL.md (esta lleva a "${path.basename(file)}").` }
  }
  if (!info.isFile()) return { error: 'Esa ruta es una carpeta, no un archivo SKILL.md.' }
  try {
    await access(file, constants.R_OK)
  } catch {
    return { error: 'No se puede leer ese SKILL.md: revisa sus permisos.' }
  }
  return { path: file }
}

const queues = new Map<string, Promise<unknown>>()

/**
 * Runs `fn` once every earlier call with the same key has finished. [Aplicar]
 * reads the SKILL.md, appends and writes it back; two of those interleaved
 * on one file used to lose a section (or the original text).
 */
export async function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(fn)
  const tail = run.catch(() => {})
  queues.set(key, tail)
  try {
    return await run
  } finally {
    if (queues.get(key) === tail) queues.delete(key)
  }
}

/** The file a path really names (a symlinked SKILL.md is written where it points); the path itself if it does not exist. */
export function realFile(file: string): Promise<string> {
  return realpath(file).catch(() => file)
}

/**
 * Replaces a file's contents through a temp file and a rename, so nobody
 * (another request, the user's editor, a crash halfway) ever sees it
 * truncated. Keeps the file's permissions and, like a plain write, refuses a
 * read-only one.
 */
export async function writeFileAtomic(file: string, contents: string): Promise<void> {
  const target = await realFile(file)
  const before = await stat(target).catch(() => null)
  if (before) await access(target, constants.W_OK)
  const tmp = `${target}.${randomUUID().slice(0, 8)}.tmp`
  try {
    await writeFile(tmp, contents, 'utf8')
    if (before) await chmod(tmp, before.mode & 0o7777)
    await rename(tmp, target)
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}
