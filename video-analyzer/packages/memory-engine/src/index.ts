export { getDb, closeDb, inspectSchema } from './db.js'
export type { Db, SchemaStatus } from './db.js'
export { migrate } from './migrate.js'
export type { MigrateResult } from './migrate.js'
export {
  REPO_ROOT,
  DATA_DIR,
  SQLITE_PATH,
  VIDEOS_DIR,
  SKILLS_OUT_DIR,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from './config.js'
export type {
  VideoRow,
  JobRow,
  SceneRow,
  TranscriptChunkRow,
  VideoElementRow,
  MemoryChunkRow,
  SkillRow,
  SkillImprovementRow,
  AnalysisRunRow,
  JobType,
  JobStatus,
  VideoStatus,
} from './types.js'
