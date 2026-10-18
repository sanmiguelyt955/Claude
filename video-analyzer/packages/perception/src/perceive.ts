import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { AnalysisResult } from '@cva/ai-router'
import { captionCoverage, MIN_CAPTION_COVERAGE } from './captions.js'
import { extractAudio, extractFrames, probeMedia, type Frame, type FrameOptions, DEFAULT_FRAME_OPTIONS } from './frames.js'
import { transcribe, type Transcript } from './transcribe.js'
import { diarize } from './diarize.js'
import { describeWithFallback, type FallbackOptions } from './chain.js'
import { claude } from './providers/claude.js'
import { geminiProviders } from './providers/gemini.js'
import type { VisionProvider } from './providers/types.js'

/** Every configured Gemini model in order, then Claude. */
export function defaultVisionProviders(): VisionProvider[] {
  return [...geminiProviders(), claude]
}

/**
 * Frames per request. At low media resolution (264 tokens each, measured with
 * countTokens) 300 frames are ~80k tokens, and Gemini answers in about 8 s
 * while still reading small on-screen text. Claude, as the fallback, sees an
 * even sample of 100 of them.
 */
export const WINDOW_FRAMES = 300

export type PerceiveOptions = {
  frameOptions?: FrameOptions
  /** Order = priority. Defaults to defaultVisionProviders(); unconfigured ones are skipped. */
  providers?: VisionProvider[]
  whisperModel?: string
  language?: string
  /**
   * What is said, already written by the platform (TikTok/YouTube captions).
   * When they cover at least half the video, Whisper is skipped: reading
   * captions takes no time and they come split into sentences.
   */
  captions?: Transcript
  /**
   * Tell the speakers apart ("Hablante 1", "Hablante 2"...). Default: on,
   * unless DIARIZATION=0. A failure only costs the labels, never the analysis.
   */
  diarize?: boolean
  log?: (msg: string) => void
  /**
   * Where the analysis is, in Spanish for the progress bar: the stage, and
   * windows done out of the total once the frames are known (the summary
   * counts as the last step).
   */
  onProgress?: (progress: { label: string; current?: number; total?: number }) => void
  /** Progress saved by an earlier attempt on the same video; finished work is reused. */
  checkpoint?: PerceptionCheckpoint
  /** Every request sent to a vision provider (see describeWithFallback). */
  onAttempt?: FallbackOptions<unknown>['onAttempt']
  /** Called after the transcript and after every window, with everything done so far. */
  onCheckpoint?: (checkpoint: PerceptionCheckpoint) => void
}

/**
 * What a failed analysis keeps, so the retry starts where it stopped instead
 * of transcribing again and paying again for every window already answered.
 * Windows are keyed by their time span and frame count: if the frames come
 * out different on the retry (other options), the key misses and that window
 * is simply redone.
 */
export type PerceptionCheckpoint = {
  engine: 'perception'
  version: 1
  transcript?: Transcript
  windows: Record<string, { scenes: Scene[]; elements: Element[] }>
}

/** Reads a checkpoint back from the jobs table; anything else (e.g. the Gemini engine's) is ignored. */
export function parseCheckpoint(json: string | null | undefined): PerceptionCheckpoint | undefined {
  if (!json) return undefined
  try {
    const value = JSON.parse(json) as Partial<PerceptionCheckpoint>
    if (value.engine !== 'perception' || value.version !== 1 || typeof value.windows !== 'object' || !value.windows) {
      return undefined
    }
    return value as PerceptionCheckpoint
  } catch {
    return undefined
  }
}

const windowKey = (w: { start: number; end: number; frames: Frame[] }) =>
  `${w.start.toFixed(3)}-${w.end.toFixed(3)}-${w.frames.length}`

const ELEMENT_KINDS = ['object', 'on_screen_text', 'action', 'person', 'relation'] as const
type ElementKind = (typeof ELEMENT_KINDS)[number]

const WINDOW_INSTRUCTION = `Mira estos fotogramas en orden (cada uno tiene su marca de tiempo) y la transcripción del tramo.
Devuelve SOLO JSON con esta forma:
{"scenes":[{"start_seconds":number,"end_seconds":number,"title":string,"description":string,"audio_description":string|null}],
 "elements":[{"kind":"object"|"on_screen_text"|"action"|"person"|"relation","label":string,"detail":string|null,"start_seconds":number,"end_seconds":number|null}]}
Usa segundos absolutos del video. Describe qué pasa en pantalla y qué se escucha. Si la transcripción dice quién habla (Hablante 1, Hablante 2...), usa esos nombres en audio_description y, si se ve quién es, dilo. Responde en español.`

const SUMMARY_INSTRUCTION = `Con estas escenas y la transcripción del video, devuelve SOLO JSON:
{"short_summary":string,"full_summary":string,"topics":string[],"language":string}
Responde en español.`

export function parseJsonReply<T>(text: string): T {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error(`Respuesta sin JSON: ${text.slice(0, 200)}`)
  return JSON.parse(text.slice(start, end + 1)) as T
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

type Scene = Omit<AnalysisResult['scenes'][number], 'index'>
type Element = AnalysisResult['elements'][number]

/**
 * Validates one window reply. Entries a model got wrong (missing times, an
 * element kind the database CHECK would reject) are dropped, clamped to the
 * window, or mapped, so one bad entry never sinks the whole analysis. A reply
 * with no usable scene at all throws, which sends the window to the next
 * provider.
 */
export function parseWindowReply(text: string, window: { start: number; end: number }): { scenes: Scene[]; elements: Element[] } {
  const raw = parseJsonReply<{ scenes?: unknown[]; elements?: unknown[] }>(text)
  const clamp = (t: number) => Math.min(Math.max(t, window.start), window.end)

  const scenes: Scene[] = []
  for (const item of Array.isArray(raw.scenes) ? raw.scenes : []) {
    const s = item as Record<string, unknown>
    const start = num(s.start_seconds)
    const description = str(s.description)
    if (start === null || !description) continue
    const end = num(s.end_seconds)
    scenes.push({
      start_seconds: clamp(start),
      end_seconds: clamp(end !== null && end >= start ? end : start),
      title: str(s.title) ?? description.slice(0, 60),
      description,
      audio_description: str(s.audio_description),
    })
  }
  if (scenes.length === 0) throw new Error('La respuesta no trae ninguna escena válida.')

  const elements: Element[] = []
  for (const item of Array.isArray(raw.elements) ? raw.elements : []) {
    const e = item as Record<string, unknown>
    const label = str(e.label)
    const start = num(e.start_seconds)
    if (!label || start === null) continue
    const kind = (ELEMENT_KINDS as readonly string[]).includes(String(e.kind)) ? (e.kind as ElementKind) : 'object'
    const end = num(e.end_seconds)
    elements.push({
      kind,
      label,
      detail: str(e.detail),
      start_seconds: clamp(start),
      end_seconds: end !== null && end >= start ? clamp(end) : null,
    })
  }
  return { scenes, elements }
}

export function parseSummaryReply(text: string, fallbackLanguage: string): AnalysisResult['summary'] {
  const raw = parseJsonReply<Record<string, unknown>>(text)
  const short = str(raw.short_summary)
  const full = str(raw.full_summary)
  if (!short || !full) throw new Error('El resumen no trae short_summary/full_summary.')
  return {
    short_summary: short,
    full_summary: full,
    topics: Array.isArray(raw.topics) ? raw.topics.map(str).filter((t): t is string => !!t) : [],
    language: str(raw.language) ?? fallbackLanguage,
  }
}

/** Frames grouped into time windows of at most WINDOW_FRAMES, with their time span. */
function windowsOf(frames: Frame[], duration: number) {
  const out: Array<{ frames: Frame[]; start: number; end: number }> = []
  for (let i = 0; i < frames.length; i += WINDOW_FRAMES) {
    const chunk = frames.slice(i, i + WINDOW_FRAMES)
    const first = chunk[0]
    if (!first) continue
    const next = frames[i + WINDOW_FRAMES]
    out.push({ frames: chunk, start: first.time, end: next ? next.time : Math.max(duration, first.time) })
  }
  return out
}

/**
 * Runs the full perception pipeline on one video:
 *   ver      -> frames at high fps, scene-filtered, sent to the vision chain
 *   escuchar -> audio extracted and transcribed by Whisper (skipped if the
 *               video has no audio track)
 * and merges both into the AnalysisResult shape the app already stores.
 * Speech is passed to the vision model as text, so it works for models
 * that cannot hear, and the transcript is kept verbatim in the result.
 */
export async function perceive(file: string, workDir: string, opts: PerceiveOptions = {}): Promise<AnalysisResult> {
  const log = opts.log ?? (() => {})
  const progress = opts.onProgress ?? (() => {})
  const providers = opts.providers ?? defaultVisionProviders()
  const checkpoint: PerceptionCheckpoint = {
    engine: 'perception',
    version: 1,
    transcript: opts.checkpoint?.transcript,
    windows: { ...opts.checkpoint?.windows },
  }
  const save = () => opts.onCheckpoint?.(checkpoint)
  await mkdir(workDir, { recursive: true })

  const { duration, hasAudio } = await probeMedia(file)
  const wavPath = path.join(workDir, 'audio.wav')

  const coverage = opts.captions ? captionCoverage(opts.captions.segments, duration) : 0
  const captions = hasAudio && opts.captions?.segments.length && coverage >= MIN_CAPTION_COVERAGE ? opts.captions : null
  if (hasAudio && opts.captions?.segments.length && !captions) {
    log(`los subtítulos de la plataforma cubren solo el ${Math.round(coverage * 100)} % del video; se transcribe con Whisper`)
  }
  const needsWhisper = hasAudio && !captions && !checkpoint.transcript
  const alreadyLabelled = checkpoint.transcript?.segments.some((s) => s.speaker !== undefined) ?? false
  const wantsSpeakers = hasAudio && (opts.diarize ?? process.env.DIARIZATION !== '0') && !alreadyLabelled
  const needsAudio = needsWhisper || wantsSpeakers
  log(needsAudio ? 'extrayendo frames y audio' : 'extrayendo frames')
  progress({ label: needsWhisper ? 'Extrayendo fotogramas y transcribiendo el audio...' : 'Extrayendo fotogramas...' })
  // Frames and speech are independent until the windows need both, so they
  // run side by side: the frame pass no longer waits for Whisper or the other
  // way round. The audio extraction itself takes seconds.
  const audio = needsAudio ? extractAudio(file, wavPath) : Promise.resolve(null)
  const framesJob = extractFrames(file, path.join(workDir, 'frames'), opts.frameOptions ?? DEFAULT_FRAME_OPTIONS)
  const speechJob = (async (): Promise<Transcript> => {
    await audio
    let speech: Transcript = { language: opts.language ?? 'es', segments: [] }
    if (captions) {
      log(`${captions.segments.length} frases de los subtítulos de la plataforma, sin transcribir`)
      speech = captions
    } else if (hasAudio && checkpoint.transcript) {
      log('transcripción retomada del intento anterior')
      speech = checkpoint.transcript
    } else if (hasAudio) {
      log('transcribiendo audio')
      speech = await transcribe(wavPath, { model: opts.whisperModel, language: opts.language })
      if (speech.device) log(speech.device === 'cuda' ? 'audio transcrito en la tarjeta gráfica' : 'audio transcrito en el procesador')
      checkpoint.transcript = speech
      save()
    }

    if (wantsSpeakers && speech.segments.length > 0) {
      progress({ label: 'Separando quién habla...' })
      try {
        speech = await diarize(wavPath, speech)
        const voices = new Set(speech.segments.map((s) => s.speaker).filter(Boolean)).size
        log(voices === 1 ? '1 voz' : voices ? `${voices} voces distintas` : 'no se pudo distinguir ninguna voz')
      } catch (err) {
        // The labels are a bonus: without them the analysis is still complete.
        log(`no se pudo separar quién habla: ${(err as Error).message.slice(0, 200)}`)
        speech = { ...speech, segments: speech.segments.map((s) => ({ ...s, speaker: null })) }
      }
      checkpoint.transcript = speech
      save()
    }
    return speech
  })()
  // Settle both before failing, so a frame error never leaves Whisper running unobserved.
  const [framesResult, speechResult] = await Promise.allSettled([framesJob, speechJob])
  if (framesResult.status === 'rejected') throw framesResult.reason
  if (speechResult.status === 'rejected') throw speechResult.reason
  const frames = framesResult.value
  const speech = speechResult.value
  if (frames.length === 0) throw new Error('No se pudo extraer ningún fotograma del video.')
  log(`${frames.length} frames únicos`)

  const transcript: AnalysisResult['transcript'] = speech.segments.map((s, i) => ({
    index: i,
    start_seconds: s.start,
    end_seconds: s.end,
    speaker: s.speaker ?? null,
    text: s.text,
    language: speech.language ?? null,
  }))
  const speechIn = (start: number, end: number) =>
    speech.segments
      .filter((s) => s.end >= start && s.start <= end)
      .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.speaker ? `${s.speaker}: ` : ''}${s.text}`)
      .join('\n')

  const scenes: Scene[] = []
  const elements: Element[] = []
  const windows = windowsOf(frames, duration)
  const steps = windows.length + 1 // + the summary
  // Windows are independent, so several go to the model at once instead of
  // one after another: on a long video the waits add up to most of the
  // analysis. VISION_CONCURRENCY=1 restores the old one-by-one order.
  const concurrency = Math.max(1, Number(process.env.VISION_CONCURRENCY ?? 3) || 1)
  const results: Array<{ scenes: Scene[]; elements: Element[] }> = new Array(windows.length)
  let finished = 0
  const report = () =>
    progress({ label: `Mirando el video: ${finished} de ${windows.length} tramos listos...`, current: finished, total: steps })
  report()
  let next = 0
  const worker = async () => {
    while (next < windows.length) {
      const n = next++
      const w = windows[n]!
      const key = windowKey(w)
      let done = checkpoint.windows[key]
      if (done) {
        log(`ventana ${n + 1}/${windows.length} retomada del intento anterior`)
      } else {
        log(`ventana ${n + 1}/${windows.length} (${w.start.toFixed(1)}-${w.end.toFixed(1)}s, ${w.frames.length} frames)`)
        const { provider, value } = await describeWithFallback(
          providers,
          { frames: w.frames, transcript: speechIn(w.start, w.end), instruction: WINDOW_INSTRUCTION, thinking: 'low' },
          { log, parse: (text) => parseWindowReply(text, w), onAttempt: opts.onAttempt },
        )
        log(`ventana ${n + 1} respondida por ${provider}`)
        done = value
        checkpoint.windows[key] = value
        save()
      }
      results[n] = done
      finished++
      report()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, windows.length) }, worker))
  for (const done of results) {
    scenes.push(...done.scenes)
    elements.push(...done.elements)
  }

  scenes.sort((a, b) => a.start_seconds - b.start_seconds)
  progress({ label: 'Escribiendo el resumen...', current: windows.length, total: steps })
  const sceneLines = scenes.map((s) => `${s.start_seconds}-${s.end_seconds}s ${s.title}: ${s.description}`).join('\n')
  const { value: summary } = await describeWithFallback(
    providers,
    {
      frames: [],
      transcript: `Escenas:\n${sceneLines}\n\nTranscripción:\n${transcript.map((t) => (t.speaker ? `${t.speaker}: ${t.text}` : t.text)).join('\n') || '(sin voz)'}`,
      instruction: SUMMARY_INSTRUCTION,
    },
    { log, parse: (text) => parseSummaryReply(text, speech.language), onAttempt: opts.onAttempt },
  )

  return {
    summary,
    scenes: scenes.map((s, index) => ({ index, ...s })),
    transcript,
    elements: elements.sort((a, b) => a.start_seconds - b.start_seconds),
  }
}
