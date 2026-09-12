import path from 'node:path'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { getVideo } from '@cva/memory-engine'
import type { Db } from '@cva/memory-engine'
import { buildVideoMarkdown, formatVaultDate } from './markdown.js'

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
    .replace(/\.[a-z0-9]{2,4}$/i, '') // drop a trailing file extension
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
    throw new Error(`El video todavia no tiene analisis (esta en "${video.status}").`)
  }

  const markdown = buildVideoMarkdown(videoId, db)
  const noteName = `${safeFileName(video.title)} (${formatVaultDate()})`
  const folderPath = path.join(vaultPath, getVaultFolder())

  await mkdir(folderPath, { recursive: true })
  const notePath = path.join(folderPath, `${noteName}.md`)
  await writeFile(notePath, markdown, 'utf8')

  const indexUpdated = await updateFolderIndex(folderPath, noteName)

  return { notePath, noteName, indexUpdated, bytes: Buffer.byteLength(markdown, 'utf8') }
}
