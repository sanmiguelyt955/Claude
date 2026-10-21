import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readdir, readFile, rm, unlink } from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)
const ffmpegBin = () => process.env.FFMPEG_PATH || 'ffmpeg'

export type Frame = { path: string; time: number }
/** A shot change found by FFmpeg's scdet: its instant and score (0-100). */
export type Cut = { time: number; score: number }

export type FrameOptions = {
  /** Frame grid to sample from (the video is read at this rate, then filtered). */
  fps: number
  /** Keep a frame only when it differs this much from the previous kept one (0..1). */
  sceneThreshold: number
  /**
   * Keep at least one frame every N seconds, so the model is never blind
   * between scene changes. The real interval shrinks on shorter videos (see
   * keyframeBudget), down to every frame of the source.
   */
  keyframeEverySeconds: number
  /**
   * Keyframes to spread over the whole video: a 1-minute clip gets them at
   * the source rate (30 fps), a 15-minute one every 0.5 s. Scene changes are
   * kept on top of these, up to maxFrames.
   */
  keyframeBudget: number
  /** Hard cap on frames kept, spread evenly over the video if exceeded. */
  maxFrames: number
  /**
   * Longest side of the frames, in px; the other follows the aspect ratio. A
   * smaller source is not enlarged: upscaling added bytes (and Claude image
   * tokens), not detail.
   */
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
  keyframeBudget: 1800,
  maxFrames: 3600,
  width: 768,
  dedupThreshold: 2,
  maxGapSeconds: 10,
}

/**
 * Thumbnails used to spot near-duplicate frames: 32x32 RGB. Colour, not
 * grayscale, because a cut between two colours of equal brightness (pure red
 * and dark green) looks identical in gray. 32, not 16: a 20 px caption on a
 * 1280 px frame barely moves one 16x16 cell.
 */
const THUMB = 32
const THUMB_BYTES = THUMB * THUMB * 3
/**
 * A frame is also new when any single thumbnail value moves this much, even
 * if the average barely changes: a short price or offer caption on a static
 * shot (mean change 0.5-0.8) was dropped with every frame that showed it.
 * Compression noise stays under 10.
 */
const LOCAL_CHANGE = 40

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
  return (await extractFramesAndCuts(file, outDir, opts)).frames
}

/** scdet score above which a frame change counts as a cut (FFmpeg's default is 10). */
const CUT_THRESHOLD = Number(process.env.CUT_THRESHOLD ?? 10) || 10

/**
 * The frames plus every cut in the video, measured in the same decoding pass:
 * a 160 px copy of each source frame goes through scdet, so the shot map
 * (protocol 9.4) comes from FFmpeg [META], not from the model's guess. In
 * planar RGB, not the default luma: a cut between two colours of equal
 * brightness (red to green) scored 0 on luma and 50 in RGB.
 */
export async function extractFramesAndCuts(
  file: string,
  outDir: string,
  opts: FrameOptions = DEFAULT_FRAME_OPTIONS,
): Promise<{ frames: Frame[]; cuts: Cut[] }> {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  // Sampling above the video's own frame rate only makes FFmpeg duplicate
  // frames (a 30 fps video read at 120 fps is four copies of each) and score
  // every copy for scene changes, which made long videos crawl.
  const [rate, { duration }] = await Promise.all([sourceFps(file), probeMedia(file)])
  const fps = Math.min(opts.fps, rate ?? opts.fps)
  const keyframeSeconds = Math.min(opts.keyframeEverySeconds, Math.max(1 / fps, duration / opts.keyframeBudget))

  // -fps_mode passthrough keeps exactly the selected frames (no duplicates
  // to fill the timeline). It replaced -vsync 0, which FFmpeg 9 removed.
  // One pass, two outputs of the same selected frames: the JPGs the model
  // sees and a raw 16x16 RGB strip used to drop near-duplicates (the
  // 1 s keyframes of a static shot are otherwise all sent).
  const graph = `[0:v]split=2[fr][sc];[sc]scale=160:-2,format=gbrp,scdet=threshold=${CUT_THRESHOLD},nullsink;` + [
    `[fr]fps=${fps}`,
    `select='eq(n\\,0)+gt(scene\\,${opts.sceneThreshold})+not(mod(n\\,${Math.max(1, Math.round(fps * keyframeSeconds))}))'`,
    'showinfo',
    'split=2[big][small];',
  ].join(',') +
    `[big]scale=w='min(${opts.width}\\,iw)':h='min(${opts.width}\\,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2[jpg];` +
    `[small]scale=${THUMB}:${THUMB},format=rgb24[thumb]`
  const thumbsPath = path.join(outDir, 'thumbs.rgb')

  const { stderr } = await run(
    ffmpegBin(),
    [
      '-hide_banner', '-v', 'info', '-i', file, '-filter_complex', graph,
      '-map', '[jpg]', '-fps_mode', 'passthrough', '-q:v', '4', path.join(outDir, '%06d.jpg'),
      '-map', '[thumb]', '-fps_mode', 'passthrough', '-f', 'rawvideo', thumbsPath,
    ],
    { maxBuffer: 256 * 1024 * 1024 },
  )

  // showinfo writes one line per kept frame to stderr, in output order.
  const log = String(stderr)
  const times = [...log.matchAll(/^\[Parsed_showinfo[^\n]*?pts_time:([\d.]+)/gm)].map((m) => Number(m[1]))
  const cuts = [...log.matchAll(/lavfi\.scd\.score: ([\d.]+), lavfi\.scd\.time: ([\d.]+)/g)].map((m) => ({ score: Number(m[1]), time: Number(m[2]) }))
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
    const keep = capFrames(frames, cuts, opts.maxFrames)
    const dropped = frames.filter((_, i) => !keep.has(i))
    await Promise.all(dropped.map((f) => unlink(f.path)))
    frames = frames.filter((_, i) => keep.has(i))
  }
  return { frames, cuts }
}

/**
 * At most `max` frame indexes: the first frame and the first one of each
 * measured shot always stay (every shot keeps an image), the rest is
 * spread evenly. Thinning evenly over everything left 384 of 803 cuts and 21
 * whole shots of a 60-minute video without a frame.
 */
export function capFrames(frames: Frame[], cuts: Cut[], max: number): Set<number> {
  const must = new Set<number>([0])
  const times = [...cuts].map((c) => c.time).sort((a, b) => a - b)
  let j = 0
  times.forEach((t, k) => {
    // The shot's first frame, wherever it falls before the next cut.
    const next = times[k + 1] ?? Number.POSITIVE_INFINITY
    while (j < frames.length && frames[j]!.time < t - 0.01) j++
    if (j < frames.length && frames[j]!.time < next - 0.01) must.add(j)
  })
  const spread = <T>(items: T[], n: number) =>
    n <= 0 ? [] : n >= items.length ? items : Array.from({ length: n }, (_, i) => items[n === 1 ? 0 : Math.round((i * (items.length - 1)) / (n - 1))]!)
  if (must.size >= max) return new Set(spread([...must].sort((a, b) => a - b), max))
  const rest = frames.map((_, i) => i).filter((i) => !must.has(i))
  return new Set([...must, ...spread(rest, max - must.size)])
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
    if (
      last < 0 ||
      frames[i]!.time - frames[last]!.time >= opts.maxGapSeconds ||
      meanDiff(thumbOf(i), thumbOf(last)) > opts.dedupThreshold ||
      maxDiff(thumbOf(i), thumbOf(last)) > LOCAL_CHANGE
    ) {
      keep.add(i)
      last = i
    }
  }
  return keep
}

function maxDiff(a: Uint8Array, b: Uint8Array): number {
  let max = 0
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]! - (b[i] ?? 0)))
  return max
}

function meanDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - (b[i] ?? 0))
  return a.length ? sum / a.length : 0
}

/** The video stream's average frame rate, or null when FFprobe cannot tell. */
export async function sourceFps(file: string): Promise<number | null> {
  try {
    const bin = process.env.FFPROBE_PATH || 'ffprobe'
    const { stdout } = await run(bin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', file])
    const [num, den] = String(stdout).trim().split('/').map(Number)
    const rate = den ? num! / den : num!
    return Number.isFinite(rate) && rate > 0 ? rate : null
  } catch {
    return null
  }
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
