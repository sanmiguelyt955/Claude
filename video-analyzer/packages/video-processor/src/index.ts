/**
 * FFmpeg wrappers. Implemented in bloque 2 (pipeline de ingesta).
 * The contracts live here so the schema, the worker and the UI already agree
 * on shapes before any of it is wired up.
 */

export type VideoMetadata = {
  durationSeconds: number
  width: number
  height: number
  fps: number
  container: string
  videoCodec: string
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

export declare function probe(filePath: string): Promise<VideoMetadata>

export declare function planSegments(
  metadata: VideoMetadata,
  budget: { maxTokensPerRequest: number; agentic: boolean },
): SegmentPlan

export declare function extractSegment(
  filePath: string,
  outPath: string,
  startSeconds: number,
  endSeconds: number,
): Promise<void>

export declare function extractKeyframe(
  filePath: string,
  outPath: string,
  atSeconds: number,
): Promise<void>
