import { getDb, closeDb, inspectSchema } from '../db.js'
import { migrate } from '../migrate.js'
import { SQLITE_PATH, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '../config.js'

const db = getDb()

try {
  const result = migrate(db)

  console.log(`Base de datos: ${SQLITE_PATH}`)
  if (result.applied.length === 0) {
    console.log(`Sin cambios. Esquema ya en la version ${result.alreadyAt}.`)
  } else {
    console.log(`Migraciones aplicadas (${result.applied.length}):`)
    for (const name of result.applied) console.log(`  + ${name}`)
    console.log(`Esquema ahora en la version ${result.alreadyAt}.`)
  }
  console.log(`Embeddings: ${EMBEDDING_MODEL} @ ${EMBEDDING_DIMENSIONS} dimensiones.`)

  const status = inspectSchema(db)
  if (!status.ok) {
    console.error('\nEl esquema quedo incompleto:')
    for (const problem of status.problems) console.error(`  - ${problem}`)
    process.exitCode = 1
  }
} catch (error) {
  console.error(`\nFallo la migracion: ${(error as Error).message}`)
  process.exitCode = 1
} finally {
  closeDb()
}
