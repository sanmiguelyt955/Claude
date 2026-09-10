import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Db } from './db.js'
import { getDb } from './db.js'
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from './config.js'

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
)

type Migration = { version: number; name: string; sql: string }

/**
 * Loads migrations from disk. Files ending in `.sql.tpl` get `{{TOKEN}}`
 * placeholders substituted — currently only the vec0 dimension, which cannot
 * be a bound parameter because it is part of the table definition.
 */
function loadMigrations(): Migration[] {
  const substitutions: Record<string, string> = {
    DIMENSIONS: String(EMBEDDING_DIMENSIONS),
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') || f.endsWith('.sql.tpl'))
    .sort()
    .map((file) => {
      const version = Number(file.slice(0, 3))
      if (!Number.isInteger(version)) {
        throw new Error(`Migracion con nombre invalido (debe empezar por NNN_): ${file}`)
      }
      let sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
      if (file.endsWith('.tpl')) {
        sql = sql.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
          const value = substitutions[key]
          if (value === undefined) throw new Error(`Placeholder sin valor en ${file}: {{${key}}}`)
          return value
        })
      }
      return { version, name: file, sql }
    })
}

function ensureMetaTable(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)
}

export type MigrateResult = { applied: string[]; alreadyAt: number }

/**
 * Applies every migration newer than the recorded version. Each migration runs
 * inside its own transaction, so a failure halfway leaves the database at the
 * last fully-applied version rather than in a half-built state.
 */
export function migrate(db: Db = getDb()): MigrateResult {
  ensureMetaTable(db)

  const applied = new Set(
    (db.prepare('SELECT version FROM migrations').all() as { version: number }[]).map(
      (r) => r.version,
    ),
  )

  // Guard the one change that silently corrupts search results: the vector
  // index dimension is fixed at CREATE time and cannot be altered in place.
  const storedDims = db.prepare("SELECT value FROM meta WHERE key='embedding_dimensions'").get() as
    | { value: string }
    | undefined
  if (storedDims && Number(storedDims.value) !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `La base fue creada con embeddings de ${storedDims.value} dimensiones y ahora ` +
        `EMBEDDING_DIMENSIONS=${EMBEDDING_DIMENSIONS}. Un vec0 no se puede redimensionar: ` +
        `hay que borrar data/db/app.sqlite (o reindexar) antes de continuar.`,
    )
  }

  const done: string[] = []
  for (const migration of loadMigrations()) {
    if (applied.has(migration.version)) continue
    db.transaction(() => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name,
      )
    })()
    done.push(migration.name)
  }

  const setMeta = db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  const maxVersion = (
    db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM migrations').get() as { v: number }
  ).v
  setMeta.run('schema_version', String(maxVersion))
  setMeta.run('embedding_dimensions', String(EMBEDDING_DIMENSIONS))
  setMeta.run('embedding_model', EMBEDDING_MODEL)

  return { applied: done, alreadyAt: maxVersion }
}
