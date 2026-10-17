import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, readFile, rm, unlink } from 'node:fs/promises'
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
  /**
   * Drop a frame when its 16x16 colour thumbnail differs from the last kept
   * one by at most this mean per-channel value (0..255). 0 keeps every frame.
   */
  dedupThreshold: number
  /** A near-duplicate is still kept when the last kept frame is this many seconds old. */
  maxGapSeconds: number
}

export const DEFAULT_FRAME_OPTIONS: FrameOptions = {
  fps: 120,
  sceneThreshold: 0.03,
  keyframeEverySeconds: 1,
  maxFrames: 1200,
  width: 768,
  dedupThreshold: 2,
  maxGapSeconds: 10,
}

/**
 * Thumbnails used to spot near-duplicate frames: 16x16 RGB. Colour, not
 * grayscale, because a cut between two colours of equal brightness (pure red
 * and dark green) looks identical in gray.
 */
const THUMB = 16
const THUMB_BYTES = THUMB * THUMB * 3

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

  // One pass, two outputs of the same selected frames: the JPGs the model
  // sees and a raw 16x16 RGB strip used to drop near-duplicates (the
  // 1 s keyframes of a static shot are otherwise all sent).
  const graph = [
    `[0:v]fps=${opts.fps}`,
    `select='eq(n\\,0)+gt(scene\\,${opts.sceneThreshold})+not(mod(n\\,${Math.round(opts.fps * opts.keyframeEverySeconds)}))'`,
    'showinfo',
    'split=2[big][small];',
  ].join(',') + `[big]scale=${opts.width}:-2[jpg];[small]scale=${THUMB}:${THUMB},format=rgb24[thumb]`
  const thumbsPath = path.join(outDir, 'thumbs.rgb')

  const { stderr } = await run(
    ffmpegBin(),
    [
      '-hide_banner', '-v', 'info', '-i', file, '-filter_complex', graph,
      '-map', '[jpg]', '-vsync', '0', '-q:v', '4', path.join(outDir, '%06d.jpg'),
      '-map', '[thumb]', '-vsync', '0', '-f', 'rawvideo', thumbsPath,
    ],
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

  const thumbs = await readFile(thumbsPath)
  await unlink(thumbsPath)
  if (opts.dedupThreshold > 0 && thumbs.length >= count * THUMB_BYTES) {
    const keep = dedupFrames(frames, (i) => thumbs.subarray(i * THUMB_BYTES, (i + 1) * THUMB_BYTES), opts)
    await Promise.all(frames.filter((_, i) => !keep.has(i)).map((f) => unlink(f.path)))
    frames = frames.filter((_, i) => keep.has(i))
  }

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

/**
 * Indexes of the frames worth keeping: the first one, then each frame whose
 * thumbnail differs enough from the last kept one, plus one every
 * maxGapSeconds so a long static shot still has a frame on the timeline.
 */
export function dedupFrames(
  frames: Frame[],
  thumbOf: (index: number) => Uint8Array,
  opts: Pick<FrameOptions, 'dedupThreshold' | 'maxGapSeconds'>,
): Set<number> {
  const keep = new Set<number>()
  let last = -1
  for (let i = 0; i < frames.length; i++) {
    if (last < 0 || frames[i]!.time - frames[last]!.time >= opts.maxGapSeconds || meanDiff(thumbOf(i), thumbOf(last)) > opts.dedupThreshold) {
      keep.add(i)
      last = i
    }
  }
  return keep
}

function meanDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - (b[i] ?? 0))
  return a.length ? sum / a.length : 0
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
