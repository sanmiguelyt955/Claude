/**
 * Row shapes mirroring migrations/001_initial.sql. SQLite has no boolean type,
 * so every 0/1 column is typed as 0 | 1 rather than boolean — mapping happens
 * at the repository layer, not here.
 */

export type VideoStatus = 'pending' | 'probing' | 'queued' | 'analyzing' | 'ready' | 'failed'

/**
 * Shape produced by packages/video-processor's probe(). Duplicated here
 * (rather than imported) so memory-engine has no dependency on other
 * workspace packages — apps depend on memory-engine, not the other way.
 */
export type VideoMetadata = {
  durationSeconds: number
  width: number | null
  height: number | null
  fps: number | null
  container: string
  videoCodec: string | null
  audioCodec: string | null
  hasAudio: boolean
  sizeBytes: number
}

export type JobType =
  | 'probe'
  | 'segment'
  | 'analyze'
  | 'embed'
  | 'detect_skills'
  | 'generate_skill'
  | 'improve_skill'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export type VideoRow = {
  id: string
  title: string
  source_kind: 'file' | 'url'
  source_url: string | null
  original_filename: string | null
  stored_path: string | null
  retained: 0 | 1
  saved_to_memory: 0 | 1
  duration_seconds: number | null
  width: number | null
  height: number | null
  fps: number | null
  container: string | null
  video_codec: string | null
  audio_codec: string | null
  has_audio: 0 | 1 | null
  size_bytes: number | null
  content_hash: string | null
  status: VideoStatus
  error_message: string | null
  created_at: string
  updated_at: string
}

export type JobRow = {
  id: string
  video_id: string | null
  type: JobType
  status: JobStatus
  priority: number
  payload_json: string
  result_json: string | null
  progress_current: number
  progress_total: number | null
  progress_label: string | null
  attempts: number
  max_attempts: number
  run_after: string
  last_error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export type AnalysisRunRow = {
  id: string
  video_id: string
  job_id: string | null
  segment_id: string | null
  phase: 'first_pass' | 'deep_pass' | 'skill_detection' | 'embedding'
  provider: string
  model: string
  processing_mode: 'STATIC' | 'AGENTIC' | null
  input_tokens: number | null
  output_tokens: number | null
  cached_tokens: number | null
  thought_tokens: number | null
  estimated_cost_usd: number | null
  latency_ms: number | null
  succeeded: 0 | 1
  error_message: string | null
  raw_response_path: string | null
  created_at: string
}

export type SceneRow = {
  id: string
  video_id: string
  scene_index: number
  start_seconds: number
  end_seconds: number
  title: string | null
  description: string
  audio_description: string | null
  keyframe_path: string | null
  created_at: string
}

export type TranscriptChunkRow = {
  id: string
  video_id: string
  scene_id: string | null
  chunk_index: number
  start_seconds: number
  end_seconds: number
  speaker: string | null
  text: string
  language: string | null
  confidence: number | null
  created_at: string
}

export type VideoElementRow = {
  id: string
  video_id: string
  scene_id: string | null
  kind: 'object' | 'on_screen_text' | 'action' | 'person' | 'relation'
  label: string
  detail: string | null
  start_seconds: number
  end_seconds: number | null
  confidence: number | null
  attributes_json: string
  created_at: string
}

export type MemoryChunkRow = {
  id: string
  video_id: string
  source: 'summary' | 'scene' | 'transcript' | 'element' | 'skill'
  source_id: string | null
  start_seconds: number | null
  end_seconds: number | null
  text: string
  token_count: number | null
  embedding_rowid: number | null
  embedding_model: string | null
  created_at: string
}

export type SkillRow = {
  id: string
  video_id: string | null
  name: string
  description: string
  start_seconds: number | null
  end_seconds: number | null
  status: 'detected' | 'generating' | 'generated' | 'discarded'
  version: number
  skill_md: string | null
  output_path: string | null
  assets_json: string
  confidence: number | null
  created_at: string
  updated_at: string
}

export type SkillImprovementRow = {
  id: string
  skill_id: string | null
  source_skill_path: string | null
  video_id: string
  kind: 'new_step' | 'better_method' | 'new_tool' | 'pitfall' | 'missing_info' | 'outdated'
  title: string
  rationale: string
  start_seconds: number | null
  end_seconds: number | null
  proposed_diff: string | null
  status: 'proposed' | 'applied' | 'ignored'
  applied_at: string | null
  created_at: string
}
