import { getDb, closeDb, inspectSchema } from '../db.js'
import { SQLITE_PATH } from '../config.js'

/**
 * Smoke test for the whole storage layer: opens the DB, confirms sqlite-vec
 * loaded, round-trips a vector through the vec0 index, and confirms FTS5 sees
 * the same row. Leaves nothing behind.
 */
const db = getDb()

try {
  const status = inspectSchema(db)

  console.log(`Base de datos : ${SQLITE_PATH}`)
  console.log(`sqlite-vec    : ${status.vecVersion ?? 'NO CARGADO'}`)
  console.log(`sqlite version: ${(db.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v}`)
  console.log(`esquema       : v${status.schemaVersion}`)
  console.log(`embeddings    : ${status.embeddingDimensions ?? '?'} dimensiones`)

  if (!status.ok) {
    console.error('\nProblemas:')
    for (const problem of status.problems) console.error(`  - ${problem}`)
    process.exitCode = 1
  } else {
    const dims = status.embeddingDimensions ?? 0
    const vector = new Float32Array(dims).fill(0.1)

    db.transaction(() => {
      db.prepare(
        `INSERT INTO videos (id, title, source_kind, status)
         VALUES ('__selftest__', 'self test', 'file', 'pending')`,
      ).run()
      db.prepare(
        `INSERT INTO memory_chunks (id, video_id, source, text, embedding_rowid)
         VALUES ('__selftest__', '__selftest__', 'summary', 'prueba de memoria semantica', 1)`,
      ).run()
      db.prepare(
        'INSERT INTO vec_memory_chunks (chunk_rowid, video_id, embedding) VALUES (1, ?, ?)',
      ).run('__selftest__', vector)

      const neighbour = db
        .prepare(
          `SELECT chunk_rowid, distance FROM vec_memory_chunks
           WHERE embedding MATCH ? AND k = 1`,
        )
        .get(vector) as { chunk_rowid: number; distance: number } | undefined
      if (!neighbour) throw new Error('la busqueda vectorial no devolvio resultados')

      const hit = db
        .prepare(`SELECT rowid FROM memory_chunks_fts WHERE memory_chunks_fts MATCH 'semantica'`)
        .get()
      if (!hit) throw new Error('el indice FTS5 no encontro el texto insertado')

      // Deleting the video must cascade to memory_chunks and, via trigger,
      // into the vec0 table. This is the assertion that matters most.
      db.prepare(`DELETE FROM videos WHERE id = '__selftest__'`).run()

      const orphan = db
        .prepare('SELECT COUNT(*) AS n FROM vec_memory_chunks WHERE chunk_rowid = 1')
        .get() as { n: number }
      if (orphan.n !== 0) throw new Error('el vector quedo huerfano tras borrar el video')
    })()

    console.log('\nOK: vec0 + FTS5 + cascada de borrado funcionan.')
  }
} catch (error) {
  console.error(`\nFallo la verificacion: ${(error as Error).message}`)
  process.exitCode = 1
} finally {
  closeDb()
}
