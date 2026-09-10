/**
 * File types accepted at ingestion. PROJECT.md §7 lists video formats
 * explicitly (MP4, MOV, MKV, AVI, WebM) and audio as an additional input
 * type; both go through the same FFmpeg probe path, so they are validated
 * together here.
 *
 * Images, PDFs and other documents are also named in §7 but need a
 * completely different metadata/analysis path (no FFmpeg involved) — out of
 * scope for the ingestion pipeline built in this block. Deferred.
 */

export const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.avi', '.webm'] as const

export const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'] as const

export const SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_VIDEO_EXTENSIONS,
  ...SUPPORTED_AUDIO_EXTENSIONS,
] as const

export function isSupportedExtension(ext: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'])

/**
 * Gemini's File API accepts a YouTube URL directly (agentic video
 * understanding works on it without a local download). Every other URL is
 * downloaded locally so FFmpeg can probe it like any uploaded file.
 */
export function isYoutubeUrl(url: string): boolean {
  try {
    return YOUTUBE_HOSTS.has(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}
