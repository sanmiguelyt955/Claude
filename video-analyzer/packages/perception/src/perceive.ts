import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { AnalysisResult } from '@cva/ai-router'
import { extractAudio, extractFrames, probeMedia, type Frame, type FrameOptions, DEFAULT_FRAME_OPTIONS } from './frames.js'
import { transcribe, type Transcript } from './transcribe.js'
import { describeWithFallback } from './chain.js'
import { claude } from './providers/claude.js'
import { gemini } from './providers/gemini.js'
import type { VisionProvider } from './providers/types.js'

/** Claude accepts at most 100 images per request; keep every window under it. */
export const WINDOW_FRAMES = 100

export type PerceiveOptions = {
  frameOptions?: FrameOptions
  /** Order = priority. Defaults to Gemini then Claude; unconfigured ones are skipped. */
  providers?: VisionProvider[]
  whisperModel?: string
  language?: string
  log?: (msg: string) => void
}

const ELEMENT_KINDS = ['object', 'on_screen_text', 'action', 'person', 'relation'] as const
type ElementKind = (typeof ELEMENT_KINDS)[number]

const WINDOW_INSTRUCTION = `Mira estos fotogramas en orden (cada uno tiene su marca de tiempo) y la transcripción del tramo.
Devuelve SOLO JSON con esta forma:
{"scenes":[{"start_seconds":number,"end_seconds":number,"title":string,"description":string,"audio_description":string|null}],
 "elements":[{"kind":"object"|"on_screen_text"|"action"|"person"|"relation","label":string,"detail":string|null,"start_seconds":number,"end_seconds":number|null}]}
Usa segundos absolutos del video. Describe qué pasa en pantalla y qué se escucha. Responde en español.`

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
  const providers = opts.providers ?? [gemini, claude]
  await mkdir(workDir, { recursive: true })

  const { duration, hasAudio } = await probeMedia(file)
  const wavPath = path.join(workDir, 'audio.wav')

  log(hasAudio ? 'extrayendo frames y audio' : 'extrayendo frames (el video no tiene audio)')
  const [frames] = await Promise.all([
    extractFrames(file, path.join(workDir, 'frames'), opts.frameOptions ?? DEFAULT_FRAME_OPTIONS),
    hasAudio ? extractAudio(file, wavPath) : Promise.resolve(null),
  ])
  if (frames.length === 0) throw new Error('No se pudo extraer ningún fotograma del video.')

  let speech: Transcript = { language: opts.language ?? 'es', segments: [] }
  if (hasAudio) {
    log(`${frames.length} frames únicos; transcribiendo audio`)
    speech = await transcribe(wavPath, { model: opts.whisperModel, language: opts.language })
  }

  const transcript: AnalysisResult['transcript'] = speech.segments.map((s, i) => ({
    index: i,
    start_seconds: s.start,
    end_seconds: s.end,
    speaker: null,
    text: s.text,
    language: speech.language ?? null,
  }))
  const speechIn = (start: number, end: number) =>
    speech.segments
      .filter((s) => s.end >= start && s.start <= end)
      .map((s) => `[${s.start.toFixed(1)}-${s.end.toFixed(1)}] ${s.text}`)
      .join('\n')

  const scenes: Scene[] = []
  const elements: Element[] = []
  const windows = windowsOf(frames, duration)
  for (const [n, w] of windows.entries()) {
    log(`ventana ${n + 1}/${windows.length} (${w.start.toFixed(1)}-${w.end.toFixed(1)}s, ${w.frames.length} frames)`)
    const { provider, value } = await describeWithFallback(
      providers,
      { frames: w.frames, transcript: speechIn(w.start, w.end), instruction: WINDOW_INSTRUCTION },
      { log, parse: (text) => parseWindowReply(text, w) },
    )
    log(`ventana ${n + 1} respondida por ${provider}`)
    scenes.push(...value.scenes)
    elements.push(...value.elements)
  }

  scenes.sort((a, b) => a.start_seconds - b.start_seconds)
  const sceneLines = scenes.map((s) => `${s.start_seconds}-${s.end_seconds}s ${s.title}: ${s.description}`).join('\n')
  const { value: summary } = await describeWithFallback(
    providers,
    {
      frames: [],
      transcript: `Escenas:\n${sceneLines}\n\nTranscripción:\n${transcript.map((t) => t.text).join(' ') || '(sin voz)'}`,
      instruction: SUMMARY_INSTRUCTION,
    },
    { log, parse: (text) => parseSummaryReply(text, speech.language) },
  )

  return {
    summary,
    scenes: scenes.map((s, index) => ({ index, ...s })),
    transcript,
    elements: elements.sort((a, b) => a.start_seconds - b.start_seconds),
  }
}
