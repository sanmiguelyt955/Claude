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
  enqueueJobUnlessActive,
  claimNextJob,
  updateJobProgress,
  completeJob,
  retryOrFailJob,
  deferJob,
  getJob,
  listJobsForVideo,
  getActiveJobForVideo,
} from './repo/jobs.js'
export type { EnqueueJobInput } from './repo/jobs.js'

export { insertAnalysisRun, getQuotaWindowCounts, listAnalysisRunsForVideo } from './repo/analysis.js'
export type { InsertAnalysisRunInput, QuotaWindowCounts } from './repo/analysis.js'

export {
  saveAnalysisResult,
  getVideoSummary,
  listScenes,
  listTranscriptChunks,
  listVideoElements,
} from './repo/analysis-results.js'
export type {
  FullAnalysisResult,
  SummaryInput,
  SceneInput,
  TranscriptChunkInput,
  VideoElementInput,
  VideoSummaryRow,
} from './repo/analysis-results.js'

export { getPendingChunks, insertEmbeddingsBatch, searchMemoryChunks } from './repo/embeddings.js'
export type { PendingChunk, SemanticSearchResult } from './repo/embeddings.js'

export {
  insertSkillCandidates,
  getSkill,
  listSkillsForVideo,
  setSkillStatus,
  saveGeneratedSkill,
  listGeneratedSkills,
  updateSkillMd,
} from './repo/skills.js'
export type { SkillCandidateInput, SaveGeneratedSkillInput } from './repo/skills.js'

export {
  insertSkillImprovements,
  getSkillImprovement,
  listSkillImprovementsForVideo,
  setSkillImprovementStatus,
} from './repo/skill-improvements.js'
export type { SkillImprovementInput } from './repo/skill-improvements.js'
