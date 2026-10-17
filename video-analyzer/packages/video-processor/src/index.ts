export type { VideoMetadata, SegmentPlan } from './types.js'
export { probe } from './ffmpeg.js'
export { hashFile } from './hash.js'
export { downloadToFile } from './download.js'
export { downloadWithYtDlp, downloadCaptions, pickCaptionTrack, isSocialVideoUrl, socialPlatformOf, explainYtDlpError } from './social.js'
export type { SocialDownload, SocialPlatform } from './social.js'
export {
  SUPPORTED_VIDEO_EXTENSIONS,
  SUPPORTED_AUDIO_EXTENSIONS,
  SUPPORTED_EXTENSIONS,
  isSupportedExtension,
  isYoutubeUrl,
} from './formats.js'

import type { VideoMetadata, SegmentPlan } from './types.js'

/**
 * Splitting a video for the token budget needs to know which Gemini model
 * and processing mode will receive it — that lives in ai-router, built in
 * bloque 3. Stubs kept here so the schema and callers already agree on the
 * shape; calling them before bloque 3 fails loudly rather than silently.
 */
export function planSegments(
  _metadata: VideoMetadata,
  _budget: { maxTokensPerRequest: number; agentic: boolean },
): SegmentPlan {
  throw new Error('planSegments() se implementa en el bloque 3 (integracion con Gemini).')
}

export async function extractSegment(
  _filePath: string,
  _outPath: string,
  _startSeconds: number,
  _endSeconds: number,
): Promise<void> {
  throw new Error('extractSegment() se implementa en el bloque 3 (integracion con Gemini).')
}

export async function extractKeyframe(
  _filePath: string,
  _outPath: string,
  _atSeconds: number,
): Promise<void> {
  throw new Error('extractKeyframe() se implementa en el bloque 5 (UI de resultados).')
}
