import { execa } from 'execa'
// @ts-expect-error -- no published types; the module's only export is a path string.
import ffprobeStatic from 'ffprobe-static'
import type { VideoMetadata } from './types.js'

const FFPROBE_PATH: string = (ffprobeStatic as { path: string }).path

type FfprobeStream = {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  r_frame_rate?: string // e.g. "30000/1001"
  avg_frame_rate?: string
}

type FfprobeFormat = {
  format_name?: string
  duration?: string
  size?: string
}

type FfprobeOutput = {
  streams?: FfprobeStream[]
  format?: FfprobeFormat
}

/** Parses ffprobe's "num/den" frame rate strings; guards against "0/0". */
function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null
  const [num, den] = value.split('/').map(Number)
  if (!num || !den) return null
  return num / den
}

/**
 * Runs ffprobe against a local file and normalizes its JSON output into the
 * app's VideoMetadata shape. Works for audio-only files too (PROJECT.md §7):
 * video-specific fields (width/height/fps/videoCodec) come back null.
 */
export async function probe(filePath: string): Promise<VideoMetadata> {
  let stdout: string
  try {
    ;({ stdout } = await execa(FFPROBE_PATH, [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]))
  } catch (error) {
    throw new Error(
      `ffprobe no pudo leer el archivo (formato no soportado o corrupto): ${(error as Error).message}`,
    )
  }

  let parsed: FfprobeOutput
  try {
    parsed = JSON.parse(stdout) as FfprobeOutput
  } catch {
    throw new Error('ffprobe devolvio una salida ilegible.')
  }

  const streams = parsed.streams ?? []
  const videoStream = streams.find((s) => s.codec_type === 'video')
  const audioStream = streams.find((s) => s.codec_type === 'audio')

  if (!videoStream && !audioStream) {
    throw new Error('El archivo no contiene ninguna pista de video ni de audio reconocible.')
  }

  const durationSeconds = Number(parsed.format?.duration ?? Number.NaN)
  const sizeBytes = Number(parsed.format?.size ?? Number.NaN)

  return {
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    fps: videoStream ? parseFrameRate(videoStream.avg_frame_rate ?? videoStream.r_frame_rate) : null,
    container: parsed.format?.format_name ?? 'unknown',
    videoCodec: videoStream?.codec_name ?? null,
    audioCodec: audioStream?.codec_name ?? null,
    hasAudio: !!audioStream,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
  }
}
