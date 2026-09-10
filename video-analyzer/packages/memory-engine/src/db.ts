import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { SQLITE_PATH, EMBEDDING_DIMENSIONS } from './config.js'

export type Db = Database.Database

let cached: Db | undefined

/**
 * Opens (once per process) the single SQLite file that holds everything:
 * structured analysis, FTS index and the sqlite-vec vector index.
 *
 * WAL mode matters here: the Next.js server reads while the worker writes,
 * and without it every UI poll would collide with an in-flight analysis.
 */
export function getDb(): Db {
  if (cached) return cached

  fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true })

  const db = new Database(SQLITE_PATH)
  sqliteVec.load(db)

  db.pragma('journal_mode = WAL')
  // NORMAL is the right trade for a local single-user app: durable across
  // process crashes, and it does not fsync on every transaction.
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  // Readers wait instead of failing outright when the worker holds the lock.
  db.pragma('busy_timeout = 5000')

  cached = db
  return db
}

/** Closes the connection. Only used by CLIs and tests. */
export function closeDb(): void {
  cached?.close()
  cached = undefined
}

export type SchemaStatus = {
  ok: boolean
  vecVersion: string | null
  schemaVersion: number
  embeddingDimensions: number | null
  problems: string[]
}

/**
 * Verifies that the file on disk actually matches what the code expects,
 * rather than assuming a migration ran. Called by the worker and by
 * `npm run db:check`.
 */
export function inspectSchema(db: Db = getDb()): SchemaStatus {
  const problems: string[] = []

  let vecVersion: string | null = null
  try {
    vecVersion = (db.prepare('SELECT vec_version() AS v').get() as { v: string }).v
  } catch {
    problems.push('La extension sqlite-vec no esta cargada.')
  }

  const hasMeta = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='meta'")
    .get()
  if (!hasMeta) {
    problems.push('Base de datos sin migrar: ejecuta `npm run db:migrate`.')
    return { ok: false, vecVersion, schemaVersion: 0, embeddingDimensions: null, problems }
  }

  const readMeta = (key: string): string | null => {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  const schemaVersion = Number(readMeta('schema_version') ?? 0)
  const storedDims = readMeta('embedding_dimensions')
  const embeddingDimensions = storedDims === null ? null : Number(storedDims)

  // A silent mismatch here would produce a vector index that returns garbage
  // neighbours, so it is a hard failure rather than a warning.
  if (embeddingDimensions !== null && embeddingDimensions !== EMBEDDING_DIMENSIONS) {
    problems.push(
      `EMBEDDING_DIMENSIONS=${EMBEDDING_DIMENSIONS} no coincide con la base ` +
        `(${embeddingDimensions}). Hay que reindexar la memoria antes de cambiarlo.`,
    )
  }

  const expected = [
    'videos',
    'video_segments',
    'jobs',
    'analysis_runs',
    'video_summaries',
    'scenes',
    'transcript_chunks',
    'video_elements',
    'memory_chunks',
    'memory_chunks_fts',
    'vec_memory_chunks',
    'skills',
    'skill_improvements',
  ]
  const present = new Set(
    (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
        .all() as { name: string }[]
    ).map((r) => r.name),
  )
  for (const table of expected) {
    if (!present.has(table)) problems.push(`Falta la tabla \`${table}\`.`)
  }

  return { ok: problems.length === 0, vecVersion, schemaVersion, embeddingDimensions, problems }
}
