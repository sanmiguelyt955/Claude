import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { AnalysisResult } from '@cva/ai-router'
import { extractAudio, extractFrames, probeDuration, type Frame, type FrameOptions, DEFAULT_FRAME_OPTIONS } from './frames.js'
import { transcribe, type Segment } from './transcribe.js'
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

const WINDOW_INSTRUCTION = `Mira estos fotogramas en orden (cada uno tiene su marca de tiempo) y la transcripción del tramo.
Devuelve SOLO JSON con esta forma:
{"scenes":[{"start_seconds":number,"end_seconds":number,"title":string,"description":string,"audio_description":string|null}],
 "elements":[{"kind":"object"|"on_screen_text"|"action"|"person"|"relation","label":string,"detail":string|null,"start_seconds":number,"end_seconds":number|null}]}
Usa segundos absolutos del video. Describe qué pasa en pantalla y qué se escucha. Responde en español.`

const SUMMARY_INSTRUCTION = `Con esta transcripción completa del video, devuelve SOLO JSON:
{"short_summary":string,"full_summary":string,"topics":string[],"language":string}
Responde en español.`

export function parseJsonReply<T>(text: string): T {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error(`Respuesta sin JSON: ${text.slice(0, 200)}`)
  return JSON.parse(text.slice(start, end + 1)) as T
}

type WindowReply = {
  scenes?: Array<{ start_seconds: number; end_seconds: number; title: string; description: string; audio_description: string | null }>
  elements?: AnalysisResult['elements']
}

/** Frames grouped into time windows of at most WINDOW_FRAMES, with their time span. */
function windowsOf(frames: Frame[], duration: number) {
  const out: Array<{ frames: Frame[]; start: number; end: number }> = []
  for (let i = 0; i < frames.length; i += WINDOW_FRAMES) {
    const chunk = frames.slice(i, i + WINDOW_FRAMES)
    const first = chunk[0]
    if (!first) continue
    const next = frames[i + WINDOW_FRAMES]
    out.push({ frames: chunk, start: first.time, end: next ? next.time : duration })
  }
  return out
}

/**
 * Runs the full perception pipeline on one video:
 *   ver    -> frames at high fps, scene-filtered, sent to the vision chain
 *   escuchar -> audio extracted and transcribed by Whisper
 * and merges both into the AnalysisResult shape the app already stores.
 * Speech is passed to the vision model as text, so it works for models
 * that cannot hear, and the transcript is kept verbatim in the result.
 */
export async function perceive(file: string, workDir: string, opts: PerceiveOptions = {}): Promise<AnalysisResult> {
  const log = opts.log ?? (() => {})
  const providers = opts.providers ?? [gemini, claude]
  await mkdir(workDir, { recursive: true })

  const duration = await probeDuration(file)
  const wavPath = path.join(workDir, 'audio.wav')

  log('[perception] extrayendo frames y audio')
  const [frames] = await Promise.all([
    extractFrames(file, path.join(workDir, 'frames'), opts.frameOptions ?? DEFAULT_FRAME_OPTIONS),
    extractAudio(file, wavPath),
  ])
  log(`[perception] ${frames.length} frames únicos; transcribiendo audio`)
  const speech = await transcribe(wavPath, { model: opts.whisperModel, language: opts.language })

  const transcript: AnalysisResult['transcript'] = speech.segments.map((s: Segment, i) => ({
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

  const scenes: NonNullable<WindowReply['scenes']> = []
  const elements: AnalysisResult['elements'] = []
  const windows = windowsOf(frames, duration)
  for (const [n, w] of windows.entries()) {
    log(`[perception] ventana ${n + 1}/${windows.length} (${w.start.toFixed(1)}-${w.end.toFixed(1)}s)`)
    const { provider, text } = await describeWithFallback(
      providers,
      { frames: w.frames, transcript: speechIn(w.start, w.end), instruction: WINDOW_INSTRUCTION },
      { log },
    )
    log(`[perception] ventana ${n + 1} respondida por ${provider}`)
    const reply = parseJsonReply<WindowReply>(text)
    scenes.push(...(reply.scenes ?? []))
    elements.push(...(reply.elements ?? []))
  }

  const sceneLines = scenes.map((s) => `${s.start_seconds}-${s.end_seconds}s ${s.title}: ${s.description}`).join('\n')
  const summaryReply = await describeWithFallback(
    providers,
    {
      frames: [],
      transcript: `Escenas:\n${sceneLines}\n\nTranscripción:\n${transcript.map((t) => t.text).join(' ')}`,
      instruction: SUMMARY_INSTRUCTION,
    },
    { log },
  )
  const summary = parseJsonReply<AnalysisResult['summary']>(summaryReply.text)

  const ordered = scenes
    .sort((a, b) => a.start_seconds - b.start_seconds)
    .map((s, index) => ({ index, ...s, audio_description: s.audio_description ?? null }))

  return {
    summary: { ...summary, language: summary.language || speech.language },
    scenes: ordered,
    transcript,
    elements: elements.sort((a, b) => a.start_seconds - b.start_seconds),
  }
}
