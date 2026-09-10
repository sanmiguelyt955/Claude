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
  resolveDataPath,
  toDataRelativePath,
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
  VideoMetadata,
} from './types.js'

export {
  createVideo,
  getVideo,
  listVideos,
  setVideoStatus,
  setVideoStoredPath,
  applyVideoMetadata,
  setVideoTitle,
  deleteVideo,
} from './repo/videos.js'
export type { CreateVideoInput } from './repo/videos.js'

export {
  enqueueJob,
  claimNextJob,
  updateJobProgress,
  completeJob,
  retryOrFailJob,
  getJob,
  listJobsForVideo,
} from './repo/jobs.js'
export type { EnqueueJobInput } from './repo/jobs.js'
