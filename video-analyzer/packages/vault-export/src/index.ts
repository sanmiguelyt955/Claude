import path from 'node:path'
import { mkdir, writeFile, readFile, readdir, access } from 'node:fs/promises'
import { getVideo } from '@cva/memory-engine'
import type { Db } from '@cva/memory-engine'
import { buildVideoMarkdown, formatVaultDate, noteMarker } from './markdown.js'

export { buildVideoMarkdown, formatVaultDate } from './markdown.js'

/** Absolute path to the Obsidian vault root, or undefined when not configured. */
export function getVaultPath(): string | undefined {
  const configured = process.env.OBSIDIAN_VAULT_PATH?.trim()
  return configured ? configured : undefined
}

export function getVaultFolder(): string {
  return process.env.OBSIDIAN_VIDEO_FOLDER?.trim() || '03 Guiones y contenido'
}

/**
 * Windows forbids \ / : * ? " < > | in a filename, and Obsidian additionally
 * treats [ ] # ^ as link syntax — strip all of them rather than producing a
 * note the vault can't link to. Also caps the length, since video titles are
 * often the original filename and can be very long.
 */
function safeFileName(title: string): string {
  const cleaned = title
    // Only a video's extension: "Curso de Node.js" kept losing its ".js".
    .replace(/\.(mp4|m4v|mov|webm|mkv|avi|mp3|wav|m4a|aac|ogg|flac)$/i, '')
    .replace(/[\\/:*?"<>|[\]#^]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned.length > 90 ? cleaned.slice(0, 90).trim() : cleaned) || 'Video sin titulo'
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/**
 * Adds the new note to the folder's `_Índice.md` under "Notas en esta carpeta",
 * matching how the vault is organized by hand. Silently does nothing when
 * there is no index file, and never adds the same link twice — re-exporting a
 * video is expected (after a re-analysis) and must stay idempotent.
 */
async function updateFolderIndex(folderPath: string, noteName: string): Promise<boolean> {
  const indexPath = path.join(folderPath, '_Índice.md')
  if (!(await fileExists(indexPath))) return false

  const current = await readFile(indexPath, 'utf8')
  const link = `- [[${noteName}]]`
  if (current.includes(`[[${noteName}]]`)) return false

  const heading = '## Notas en esta carpeta'
  const at = current.indexOf(heading)
  if (at === -1) return false

  const insertAt = at + heading.length
  const updated = current.slice(0, insertAt) + '\n' + link + current.slice(insertAt)
  await writeFile(indexPath, updated, 'utf8')
  return true
}

async function existingNote(folderPath: string, videoId: string): Promise<string | undefined> {
  const marker = noteMarker(videoId)
  for (const file of await readdir(folderPath).catch(() => [] as string[])) {
    if (!file.endsWith('.md') || file === '_Índice.md') continue
    const text = await readFile(path.join(folderPath, file), 'utf8').catch(() => '')
    if (text.includes(marker)) return file.slice(0, -3)
  }
  return undefined
}

export type VaultExportResult = {
  notePath: string
  noteName: string
  indexUpdated: boolean
  bytes: number
}

/**
 * Writes one video's complete analysis into the Obsidian vault as a single
 * self-contained note (PROJECT.md's "memoria" made portable). Overwrites the
 * same note on re-export instead of piling up duplicates, so re-running after
 * a better analysis just refreshes it.
 */
export async function exportVideoToVault(videoId: string, db?: Db): Promise<VaultExportResult> {
  const vaultPath = getVaultPath()
  if (!vaultPath) {
    throw new Error(
      'Falta configurar OBSIDIAN_VAULT_PATH en .env.local (ruta a la carpeta raiz del vault de Obsidian).',
    )
  }
  if (!(await fileExists(vaultPath))) {
    throw new Error(`La ruta del vault no existe: ${vaultPath}`)
  }

  const video = getVideo(videoId, db)
  if (!video) throw new Error(`El video ${videoId} no existe.`)
  if (video.status !== 'ready') {
    throw new Error(`El video todavía no tiene análisis (está en "${video.status}").`)
  }

  const markdown = buildVideoMarkdown(videoId, db)
  const folderPath = path.join(vaultPath, getVaultFolder())

  await mkdir(folderPath, { recursive: true })
  // The note already exported for this video, whatever day it was: the date
  // in the name made each later export a second full copy.
  const noteName = (await existingNote(folderPath, videoId)) ?? `${safeFileName(video.title)} (${formatVaultDate()})`
  const notePath = path.join(folderPath, `${noteName}.md`)
  await writeFile(notePath, markdown, 'utf8')

  const indexUpdated = await updateFolderIndex(folderPath, noteName)

  return { notePath, noteName, indexUpdated, bytes: Buffer.byteLength(markdown, 'utf8') }
}

// ── Memoria (the cloud notes app) ──────────────────────────────────────────

/** Memoria's address and an access key made in its settings, when both are set. */
export function getMemoriaConfig(): { url: string; key: string } | undefined {
  const url = process.env.MEMORIA_URL?.trim().replace(/\/+$/, '')
  const key = process.env.MEMORIA_KEY?.trim()
  return url && key ? { url, key } : undefined
}

export type MemoriaExportResult = { notePath: string; noteName: string; bytes: number; url: string; parts: number }

async function memoria<T>(config: { url: string; key: string }, method: string, route: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${config.url}${route}`, {
      method,
      headers: { authorization: `Bearer ${config.key}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    throw new Error(`No se pudo conectar con Memoria (${config.url}): ${(error as Error).message}`)
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (res.status === 401) throw new Error('Memoria rechazó la clave (MEMORIA_KEY). Crea una nueva en Memoria → Ajustes → Claves de acceso.')
  if (!res.ok) throw new Error(`Memoria respondió ${res.status}: ${data?.error ?? 'sin detalle'}`)
  return data as T
}

/**
 * Sends one video's complete analysis to Memoria as a note, in the same
 * folder the vault export uses. The note already made for this video (found
 * by its marker) is updated, so re-exporting refreshes it; its earlier
 * content stays in Memoria's history.
 */
export async function exportVideoToMemoria(videoId: string, db?: Db): Promise<MemoriaExportResult> {
  const config = getMemoriaConfig()
  if (!config) throw new Error('Falta configurar MEMORIA_URL y MEMORIA_KEY en .env.local.')
  const video = getVideo(videoId, db)
  if (!video) throw new Error(`El video ${videoId} no existe.`)
  if (video.status !== 'ready') throw new Error(`El video todavía no tiene análisis (está en "${video.status}").`)
  const markdown = buildVideoMarkdown(videoId, db)
  const marker = noteMarker(videoId)
  const { results } = await memoria<{ results: Array<{ path: string }> }>(config, 'GET', `/api/search?q=${encodeURIComponent(`"${videoId}"`)}`)
  let notePath: string | undefined
  for (const r of results) {
    const { note } = await memoria<{ note: { content: string } }>(config, 'GET', `/api/note?path=${encodeURIComponent(r.path)}`)
    if (note.content.includes(marker)) {
      notePath = r.path
      break
    }
  }
  notePath ??= `${getVaultFolder()}/${safeFileName(video.title)} (${formatVaultDate()}).md`
  const noteName = notePath.split('/').pop()!.replace(/\.md$/, '')
  const folder = notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : ''
  const partPath = (k: number) => `${folder ? `${folder}/` : ''}${noteName} — parte ${k}.md`
  // A record too big for one note (a 1 h 40 min video) goes in linked parts;
  // the first keeps the marker that finds it again.
  const parts = splitForMemoria(markdown.replace(marker, '').replace(/\s+$/, '\n'))
  const n = parts.length
  const notes = parts.map((text, i) =>
    i === 0
      ? { path: notePath!, content: `${text.replace(/\s+$/, '')}\n${n > 1 ? `\n> [!info] Este análisis sigue en ${parts.slice(1).map((_, k) => `[[${noteName} — parte ${k + 2}]]`).join(', ')}.\n` : ''}\n${marker}\n` }
      : { path: partPath(i + 1), content: `← [[${noteName}]] · parte ${i + 1} de ${n}\n\n${text}` },
  )
  const r = await memoria<{ failed: Array<{ error: string }> }>(config, 'POST', '/api/import', { notes })
  if (r.failed.length) throw new Error(`Memoria no guardó la nota: ${r.failed[0]!.error}`)
  // Parts left from a longer earlier export go to Memoria's trash (restorable there).
  for (let k = n + 1; k < 200; k++) {
    try {
      await memoria(config, 'GET', `/api/note?path=${encodeURIComponent(partPath(k))}`)
    } catch {
      break
    }
    await memoria(config, 'DELETE', `/api/note?path=${encodeURIComponent(partPath(k))}`)
  }
  return { notePath, noteName, bytes: Buffer.byteLength(markdown, 'utf8'), url: `${config.url}/n/${encodeURIComponent(notePath)}`, parts: n }
}

/** Notes in Memoria hold up to 1.8 MB; parts stay well under it. */
const MEMORIA_PART_BYTES = 900_000

/**
 * The markdown in pieces of at most `limit` bytes, cut at a heading when one
 * falls in the second half of a piece, otherwise at a line.
 */
export function splitForMemoria(markdown: string, limit = MEMORIA_PART_BYTES): string[] {
  const size = (s: string) => Buffer.byteLength(s, 'utf8')
  if (size(markdown) <= limit) return [markdown]
  const parts: string[] = []
  let lines: string[] = []
  let bytes = 0
  let lastHeading = -1
  const flushAt = (at: number) => {
    parts.push(`${lines.slice(0, at).join('\n')}\n`)
    lines = lines.slice(at)
    bytes = lines.reduce((sum, l) => sum + size(l) + 1, 0)
    lastHeading = lines.findIndex((l, i) => i > 0 && /^#{1,3}\s/.test(l))
  }
  for (let line of markdown.split('\n')) {
    // A single line longer than a whole part is cut.
    while (size(line) > limit - 1) {
      if (lines.length) flushAt(lines.length)
      // Room for the line break the piece ends with.
      let cut = limit - 1
      while (size(line.slice(0, cut)) > limit - 1) cut = Math.floor(cut * 0.9)
      parts.push(`${line.slice(0, cut)}\n`)
      line = line.slice(cut)
    }
    const add = size(line) + 1
    if (bytes + add > limit && lines.length) {
      const atHeading = lastHeading > 0 && lines.slice(0, lastHeading).reduce((sum, l) => sum + size(l) + 1, 0) >= limit / 2
      flushAt(atHeading ? lastHeading : lines.length)
    }
    if (/^#{1,3}\s/.test(line) && lines.length) lastHeading = lines.length
    lines.push(line)
    bytes += add
  }
  if (lines.length) parts.push(lines.join('\n'))
  return parts
}
