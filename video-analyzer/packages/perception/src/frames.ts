import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, rm, unlink } from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)
const ffmpegBin = () => process.env.FFMPEG_PATH || 'ffmpeg'

export type Frame = { path: string; time: number }

export type FrameOptions = {
  /** Frame grid to sample from (the video is read at this rate, then filtered). */
  fps: number
  /** Keep a frame only when it differs this much from the previous kept one (0..1). */
  sceneThreshold: number
  /** Always keep one frame every N seconds, so the model is never blind between scene changes. */
  keyframeEverySeconds: number
  /** Hard cap on frames kept, spread evenly over the video if exceeded. */
  maxFrames: number
  /** Output width in px; height follows the aspect ratio. */
  width: number
}

export const DEFAULT_FRAME_OPTIONS: FrameOptions = {
  fps: 120,
  sceneThreshold: 0.03,
  keyframeEverySeconds: 1,
  maxFrames: 1200,
  width: 768,
}

/**
 * "Ver": samples the video at up to `fps` but keeps only frames whose content
 * changed (ffmpeg scene score). Sampling 120 fps raw is ~7200 frames per
 * minute of video, most of them near-identical; the scene filter keeps the
 * ones that carry information, so the density the model sees is high where
 * the picture changes and small where it doesn't.
 */
export async function extractFrames(
  file: string,
  outDir: string,
  opts: FrameOptions = DEFAULT_FRAME_OPTIONS,
): Promise<Frame[]> {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const vf = [
    `fps=${opts.fps}`,
    `select='eq(n\\,0)+gt(scene\\,${opts.sceneThreshold})+not(mod(n\\,${Math.round(opts.fps * opts.keyframeEverySeconds)}))'`,
    'showinfo',
    `scale=${opts.width}:-2`,
  ].join(',')

  const { stderr } = await run(
    ffmpegBin(),
    ['-hide_banner', '-v', 'info', '-i', file, '-vf', vf, '-vsync', '0', '-q:v', '4', path.join(outDir, '%06d.jpg')],
    { maxBuffer: 256 * 1024 * 1024 },
  )

  // showinfo writes one line per kept frame to stderr, in output order.
  const times = [...String(stderr).matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]))
  const files = (await readdir(outDir)).filter((f) => f.endsWith('.jpg')).sort()
  const count = Math.min(files.length, times.length)

  let frames: Frame[] = files.slice(0, count).map((f, i) => ({
    path: path.join(outDir, f),
    time: times[i] ?? 0,
  }))

  if (frames.length > opts.maxFrames) {
    const keep = new Set<number>()
    for (let i = 0; i < opts.maxFrames; i++) {
      keep.add(Math.round((i * (frames.length - 1)) / (opts.maxFrames - 1)))
    }
    const dropped = frames.filter((_, i) => !keep.has(i))
    await Promise.all(dropped.map((f) => unlink(f.path)))
    frames = frames.filter((_, i) => keep.has(i))
  }
  return frames
}

/** "Escuchar" prep: mono 16 kHz WAV, the input format speech models expect. */
export async function extractAudio(file: string, outWav: string): Promise<string> {
  await run(ffmpegBin(), ['-hide_banner', '-v', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', outWav])
  return outWav
}

/** Duration and whether there is an audio track (silent/ASMR videos have none). */
export async function probeMedia(file: string): Promise<{ duration: number; hasAudio: boolean }> {
  const bin = process.env.FFPROBE_PATH || 'ffprobe'
  const { stdout } = await run(bin, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file])
  const data = JSON.parse(String(stdout)) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> }
  return {
    duration: Number(data.format?.duration) || 0,
    hasAudio: (data.streams ?? []).some((s) => s.codec_type === 'audio'),
  }
}
