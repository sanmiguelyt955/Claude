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
