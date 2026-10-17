export type VideoStatus = 'pending' | 'probing' | 'queued' | 'analyzing' | 'ready' | 'failed'

export type ActiveJob = {
  type: string
  status: string
  progressLabel: string | null
  /** Windows completed so far — only set for a windowed video's per-window
   * notifications. Null/undefined means "no numeric progress to show yet",
   * which is the UI's cue to render the indeterminate bar instead. */
  progressCurrent?: number
  progressTotal?: number | null
  startedAt?: string | null
} | null

export type VideoRow = {
  id: string
  title: string
  source_kind: 'file' | 'url'
  source_url: string | null
  status: VideoStatus
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
  error_message: string | null
  folder: string | null
  created_at: string
  updated_at: string
  activeJob: ActiveJob
}

export type VideoSummary = {
  short_summary: string
  full_summary: string
  topics_json: string
  language: string | null
}

export type SceneDetail = {
  scene_index: number
  start_seconds: number
  end_seconds: number
  title: string | null
  description: string
  audio_description: string | null
}

export type TranscriptDetail = {
  chunk_index: number
  start_seconds: number
  end_seconds: number
  speaker: string | null
  text: string
}

export type ElementKind = 'object' | 'on_screen_text' | 'action' | 'person' | 'relation'

export type ElementDetail = {
  kind: ElementKind
  label: string
  detail: string | null
  start_seconds: number
  end_seconds: number | null
}

export type AnalysisRunSummary = {
  phase: string
  model: string
  processing_mode: string | null
  input_tokens: number | null
  output_tokens: number | null
  estimated_cost_usd: number | null
  succeeded: 0 | 1
  created_at: string
}

export type SkillStatus = 'detected' | 'generating' | 'generated' | 'discarded'

export type SkillDetail = {
  id: string
  video_id: string | null
  name: string
  description: string
  start_seconds: number | null
  end_seconds: number | null
  status: SkillStatus
  version: number
  skill_md: string | null
  output_path: string | null
  assets_json: string
  confidence: number | null
  created_at: string
  updated_at: string
}

export type SkillImprovementKind =
  | 'new_step'
  | 'better_method'
  | 'new_tool'
  | 'pitfall'
  | 'missing_info'
  | 'outdated'

export type SkillImprovementStatus = 'proposed' | 'applied' | 'ignored'

export type SkillImprovementDetail = {
  id: string
  skill_id: string | null
  source_skill_path: string | null
  video_id: string
  kind: SkillImprovementKind
  title: string
  rationale: string
  start_seconds: number | null
  end_seconds: number | null
  proposed_diff: string | null
  status: SkillImprovementStatus
  applied_at: string | null
  created_at: string
}

export type VideoDetailResponse = {
  video: VideoRow
  summary: VideoSummary | null
  scenes: SceneDetail[]
  transcript: TranscriptDetail[]
  elements: ElementDetail[]
  analysisRuns: AnalysisRunSummary[]
  skills: SkillDetail[]
  skillImprovements: SkillImprovementDetail[]
}

export type SemanticSearchResult = {
  id: string
  source: 'summary' | 'scene' | 'transcript' | 'element' | 'skill'
  start_seconds: number | null
  end_seconds: number | null
  text: string
  distance: number
}

export type LibrarySearchResult = SemanticSearchResult & {
  video_id: string
  video_title: string
  video_status: VideoStatus
  match_type: 'semantic' | 'keyword' | 'both'
}
