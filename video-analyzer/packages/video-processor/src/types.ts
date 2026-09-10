export type VideoMetadata = {
  durationSeconds: number
  /** null for audio-only files. */
  width: number | null
  height: number | null
  fps: number | null
  container: string
  videoCodec: string | null
  audioCodec: string | null
  hasAudio: boolean
  sizeBytes: number
}

export type SegmentPlan = {
  /** Why the split was needed, surfaced to the user before spending quota. */
  reason: 'fits' | 'token_budget' | 'file_size'
  estimatedTokens: number
  segments: { index: number; startSeconds: number; endSeconds: number }[]
}
