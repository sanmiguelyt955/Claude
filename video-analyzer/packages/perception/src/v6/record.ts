import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  PROTOCOL_VERSION,
  V6_PHASE1_SCHEMA,
  V6_PHASE3_SCHEMA,
  mmss,
  renderV6Record,
  type AnalysisResult,
  type V6Phase1,
  type V6Phase3,
  type VideoMeta,
} from '@cva/ai-router'
import { describeWithFallback, type FallbackOptions } from '../chain.js'
import type { Cut, Frame } from '../frames.js'
import type { VisionProvider } from '../providers/types.js'
import type { Transcript } from '../transcribe.js'
import { V6_ACCESS, V6_CORE, V6_PHASE1, V6_PHASE3, V6_WINDOW } from './prompts.js'

const run = promisify(execFile)
const ffmpegBin = () => process.env.FFMPEG_PATH || 'ffmpeg'

type Scene = AnalysisResult['scenes'][number]
type Element = AnalysisResult['elements'][number]

/** Frames per window: at low resolution 300 frames are ~80k input tokens. */
const WINDOW_FRAMES = 300
/**
 * Longest window, in seconds. The timeline has one entry per second (or per
 * run of identical seconds) with four channels; 240 s stay well inside the
 * 65k-token reply even on a busy video.
 */
const windowSeconds = () => Math.max(30, Number(process.env.V6_WINDOW_SECONDS ?? 240) || 240)
/** Most shots described by their own frame in phase 1. */
const MAX_PHASE1_FRAMES = 300
/** Gemini 3 Flash replies are capped at 65,536 tokens; windows and the synthesis use all of it. */
const MAX_REPLY_TOKENS = 65_536

const STR = { type: 'string' } as const
const NUM = { type: 'number' } as const
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties) })
const arr = (items: unknown) => ({ type: 'array', items })

export const V6_PERCEPTION_WINDOW_SCHEMA = obj({
  timeline: arr(
    obj({
      start_seconds: NUM,
      end_seconds: NUM,
      sin_cambios: { type: 'boolean' },
      vis: STR,
      aud: STR,
      txt: STR,
      cam: STR,
      cortes: arr(STR),
    }),
  ),
  textos_pantalla: arr(
    obj({ id: STR, aparece: STR, desaparece: STR, duracion: STR, tipo: STR, posicion: STR, contenido: STR, apariencia: STR, animacion: STR }),
  ),
  cambios_estado: arr(obj({ timestamp: STR, antes: STR, transicion: STR, despues: STR, no_determinable: STR })),
  escenas: arr(obj({ start_seconds: NUM, end_seconds: NUM, title: STR, description: STR, audio_description: STR })),
  elementos: arr(obj({ kind: STR, label: STR, detail: STR, start_seconds: NUM, end_seconds: NUM })),
  entidades_nuevas: arr(obj({ id: STR, primera_aparicion_segundo: NUM, descripcion_fisica: STR, identificacion: STR })),
  limites: arr(STR),
})

/** Phase 3 without 9.8 (the windows wrote it, with the frames in view) and with the library summary. */
export const V6_PERCEPTION_PHASE3_SCHEMA = (() => {
  const base = V6_PHASE3_SCHEMA as { type: string; properties: Record<string, unknown>; required: string[] }
  const properties = { ...base.properties, resumen_completo: STR, idioma: STR }
  delete (properties as Record<string, unknown>).cambios_estado
  return { type: 'object', properties, required: Object.keys(properties) }
})()

type WindowOut = {
  timeline: Array<{ start_seconds: number; end_seconds: number; sin_cambios: boolean; vis: string; aud: string; txt: string; cam: string; cortes: string[] }>
  textos_pantalla: V6Phase1['textos_pantalla']
  cambios_estado: V6Phase3['cambios_estado']
  escenas: Array<{ start_seconds: number; end_seconds: number; title: string; description: string; audio_description: string }>
  elementos: Array<{ kind: string; label: string; detail: string; start_seconds: number; end_seconds: number }>
  entidades_nuevas: Array<{ id: string; primera_aparicion_segundo: number; descripcion_fisica: string; identificacion: string }>
  limites: string[]
}

type Phase3Out = Omit<V6Phase3, 'cambios_estado'> & { resumen_completo: string; idioma: string }

/** What the V6 record keeps between attempts (inside the perception checkpoint). */
export type V6Checkpoint = {
  phase1?: V6Phase1
  windows: Record<string, WindowOut>
  phase3?: Phase3Out
}

export type Shot = { id: string; start: number; end: number }

/** Shots between the measured cuts; cuts closer than 0.2 s are one change. */
export function shotsFrom(cuts: Cut[], duration: number): Shot[] {
  const bounds = [0]
  for (const c of [...cuts].sort((a, b) => a.time - b.time)) {
    if (c.time > bounds[bounds.length - 1]! + 0.2 && c.time < duration - 0.2) bounds.push(c.time)
  }
  bounds.push(duration)
  return bounds.slice(0, -1).map((start, i) => ({ id: `PL${i + 1}`, start, end: bounds[i + 1]! }))
}

export type V6Window = { index: number; start: number; end: number; frames: Frame[] }

/** Contiguous windows over the whole video, each at most WINDOW_FRAMES frames and windowSeconds() long. */
export function v6Windows(frames: Frame[], duration: number): V6Window[] {
  const maxSeconds = windowSeconds()
  const out: V6Window[] = []
  let start = 0
  let current: Frame[] = []
  for (const f of frames) {
    if (current.length >= WINDOW_FRAMES || f.time - start >= maxSeconds) {
      const end = current.length >= WINDOW_FRAMES ? f.time : Math.min(start + maxSeconds, f.time)
      out.push({ index: out.length, start, end, frames: current })
      start = end
      current = []
      // A window with no frames is still covered: it gets the audio and is declared.
      while (f.time - start >= maxSeconds) {
        out.push({ index: out.length, start, end: start + maxSeconds, frames: [] })
        start += maxSeconds
      }
    }
    current.push(f)
  }
  if (start < duration || current.length) out.push({ index: out.length, start, end: Math.max(duration, start), frames: current })
  return out.filter((w) => w.end > w.start)
}

/** Silences of at least 0.5 s below -35 dB, measured by FFmpeg [META]. */
export async function measureSilences(wavPath: string): Promise<Array<{ start: number; end: number }>> {
  try {
    const { stderr } = await run(ffmpegBin(), ['-hide_banner', '-nostats', '-i', wavPath, '-af', 'silencedetect=noise=-35dB:d=0.5', '-f', 'null', '-'], {
      maxBuffer: 32 * 1024 * 1024,
    })
    const log = String(stderr)
    const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]))
    const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]))
    return starts.map((s, i) => ({ start: s, end: ends[i] ?? s }))
  } catch {
    return []
  }
}

/** Resolution and frame rate from FFprobe [META]. */
export async function probeVideo(file: string): Promise<{ width: number | null; height: number | null; fps: number | null }> {
  try {
    const bin = process.env.FFPROBE_PATH || 'ffprobe'
    const { stdout } = await run(bin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate', '-of', 'json', file])
    const s = (JSON.parse(String(stdout)) as { streams?: Array<{ width?: number; height?: number; avg_frame_rate?: string }> }).streams?.[0]
    const [num, den] = String(s?.avg_frame_rate ?? '').split('/').map(Number)
    const fps = num && den ? num / den : null
    return { width: s?.width ?? null, height: s?.height ?? null, fps: fps && Number.isFinite(fps) ? Math.round(fps * 1000) / 1000 : null }
  } catch {
    return { width: null, height: null, fps: null }
  }
}

/** The window's sound as a small Opus file the model can hear. */
async function audioClip(wavPath: string, dir: string, w: V6Window): Promise<{ path: string; mimeType: string; seconds: number }> {
  await mkdir(dir, { recursive: true })
  const out = path.join(dir, `tramo-${w.index + 1}.ogg`)
  await run(ffmpegBin(), [
    '-hide_banner', '-v', 'error', '-y', '-ss', w.start.toFixed(3), '-t', (w.end - w.start).toFixed(3), '-i', wavPath,
    '-ac', '1', '-c:a', 'libopus', '-b:a', '24k', '-f', 'ogg', out,
  ])
  return { path: out, mimeType: 'audio/ogg', seconds: w.end - w.start }
}

const tLine = (n: number, s: Transcript['segments'][number]) =>
  `T${n} — ${mmss(s.start)}–${mmss(s.end)} — ${s.speaker ? s.speaker.replace(/^Hablante\s*/i, 'VOZ') : 'VOZ1'}: "${s.text}"`

function metaBlock(meta: VideoMeta, shots: Shot[], hasAudio: boolean): string {
  const lines = [
    `- Archivo: ${meta.title}`,
    `- Duración exacta: ${meta.durationSeconds} s (${mmss(meta.durationSeconds)}) [META]`,
    meta.width && meta.height ? `- Resolución: ${meta.width}x${meta.height} [META]` : '- Resolución: [ND]',
    meta.fps ? `- Fotogramas por segundo: ${meta.fps} [META]` : '- Fotogramas por segundo: [ND]',
    `- Pista de audio: ${hasAudio ? 'sí' : 'no (AUD: NO APLICA)'} [META]`,
    `- Planos medidos por FFmpeg (scdet): ${shots.length} [META]`,
  ]
  return `METADATA Y MEDICIONES [META] (prevalecen sobre tu estimación):\n${lines.join('\n')}`
}

function shotList(shots: Shot[]): string {
  return shots.map((s) => `${s.id} — ${mmss(s.start)}–${mmss(s.end)} (${(s.end - s.start).toFixed(2)} s)`).join('\n')
}

function phase1Reference(p1: V6Phase1): string {
  const ent = p1.entidades.map((e) => `${e.id} — ${e.descripcion_fisica}`).join('\n')
  const pl = p1.planos.map((p) => `${p.id} — ${p.inicio}–${p.fin}: ${p.escala}, ${p.angulo}, ${p.movimiento}`).join('\n')
  return `REGISTRO DE ENTIDADES (9.3, fijado para todo el video):\n${ent || '(ninguna)'}\n\nMAPA DE PLANOS (9.4):\n${pl}`
}

/** The frame nearest the middle of each shot, at most MAX_PHASE1_FRAMES, evenly spread. */
function shotFrames(frames: Frame[], shots: Shot[]): Frame[] {
  const picked = shots.map((s) => {
    const mid = (s.start + s.end) / 2
    let best = frames[0]!
    for (const f of frames) if (Math.abs(f.time - mid) < Math.abs(best.time - mid)) best = f
    return best
  })
  const unique = [...new Map(picked.map((f) => [f.path, f])).values()]
  if (unique.length <= MAX_PHASE1_FRAMES) return unique
  return Array.from({ length: MAX_PHASE1_FRAMES }, (_, i) => unique[Math.round((i * (unique.length - 1)) / (MAX_PHASE1_FRAMES - 1))]!)
}

const parseJson = <T>(text: string): T => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error(`Respuesta sin JSON: ${text.slice(0, 200)}`)
  return JSON.parse(text.slice(start, end + 1)) as T
}

/**
 * The window's timeline must run from its start to its end without holes: the
 * protocol's continuous coverage. Holes up to a quarter of the window are
 * filled with an entry that says the record of that interval was not produced
 * (it is not "SIN DATOS": the frames and audio were there); a bigger hole
 * means the model skipped part of the window and the reply is asked again.
 */
export function coverTimeline(w: WindowOut, range: { start: number; end: number }): { timeline: WindowOut['timeline']; filled: string[] } {
  const entries = [...(w.timeline ?? [])]
    .filter((e) => Number.isFinite(e.start_seconds) && Number.isFinite(e.end_seconds) && e.end_seconds > e.start_seconds)
    .sort((a, b) => a.start_seconds - b.start_seconds)
  if (!entries.length) throw new Error('El tramo no trae ninguna entrada de línea de tiempo.')
  const out: WindowOut['timeline'] = []
  const filled: string[] = []
  let at = range.start
  const hole = (a: number, b: number) => {
    filled.push(`[${mmss(a)}–${mmss(b)}] la línea de tiempo de este intervalo no se produjo; ver los fotogramas y el audio del tramo [ND].`)
    out.push({ start_seconds: a, end_seconds: b, sin_cambios: false, vis: '[ND] — registro no producido para este intervalo.', aud: '[ND]', txt: '[ND]', cam: '[ND]', cortes: [] })
  }
  let worst = 0
  for (const e of entries) {
    const s = Math.max(e.start_seconds, range.start)
    const t = Math.min(e.end_seconds, range.end)
    if (t <= at) continue
    if (s > at + 0.05) {
      worst = Math.max(worst, s - at)
      hole(at, s)
    }
    out.push({ ...e, start_seconds: Math.max(s, at), end_seconds: t })
    at = t
  }
  if (range.end > at + 0.05) {
    worst = Math.max(worst, range.end - at)
    hole(at, range.end)
  }
  if (worst > (range.end - range.start) / 4) throw new Error(`La línea de tiempo deja ${Math.round(worst)} s del tramo sin registrar.`)
  // One entry per second: only stable stretches (sin_cambios) may span more.
  // A real reply on 18 Oct 2026 put ten seconds of changing speech in one
  // entry; past a fifth of the window that is a summary, not the timeline.
  const coarse = out.filter((e) => !e.sin_cambios && !e.vis.startsWith('[ND]') && e.end_seconds - e.start_seconds > 1.5)
  const coarseSeconds = coarse.reduce((sum, e) => sum + (e.end_seconds - e.start_seconds), 0)
  if (coarseSeconds > (range.end - range.start) / 5) {
    throw new Error(`La línea de tiempo agrupa ${Math.round(coarseSeconds)} s con cambios en entradas de varios segundos; el protocolo pide una entrada por segundo.`)
  }
  for (const e of coarse) filled.push(`[${mmss(e.start_seconds)}–${mmss(e.end_seconds)}] granularidad reducida: una sola entrada para ${(e.end_seconds - e.start_seconds).toFixed(1)} s con cambios [BAJA].`)
  return { timeline: out, filled }
}

export type V6Input = {
  title: string
  file: string
  workDir: string
  duration: number
  hasAudio: boolean
  wavPath: string
  frames: Frame[]
  cuts: Cut[]
  speech: Transcript
  providers: VisionProvider[]
  checkpoint: V6Checkpoint
  save: () => void
  log: (msg: string) => void
  progress: (p: { label: string; current?: number; total?: number }) => void
  onAttempt?: FallbackOptions<unknown>['onAttempt']
}

/**
 * Protocol V6.5 on the perception engine, in three phases (1 entities and
 * shots, 2 the timeline window by window with frames and sound, 3 synthesis)
 * plus local measurements. Returns the app's AnalysisResult (scenes for the
 * library, transcript, elements) and the full record as Markdown.
 */
export async function buildV6Record(input: V6Input): Promise<{ result: AnalysisResult; markdown: string }> {
  const { duration, frames, speech, providers, checkpoint, log, progress } = input
  const [video, silences] = await Promise.all([probeVideo(input.file), input.hasAudio ? measureSilences(input.wavPath) : Promise.resolve([])])
  const meta: VideoMeta = { title: input.title, durationSeconds: Math.round(duration * 1000) / 1000, ...video }
  const shots = shotsFrom(input.cuts, duration)
  const transcriptText = speech.segments.length ? speech.segments.map((s, i) => tLine(i + 1, s)).join('\n') : 'No se detecta habla.'
  const windows = v6Windows(frames, duration)
  const steps = windows.length + 2
  const chain = <T>(req: Parameters<typeof describeWithFallback>[1], parse: (t: string) => T) =>
    describeWithFallback(providers, req, { log, parse, onAttempt: input.onAttempt })

  // ── Phase 1 ─────────────────────────────────────────────────────────────
  progress({ label: 'Registro V6.5: entidades y planos...', current: 0, total: steps })
  if (!checkpoint.phase1) {
    const p1Frames = shotFrames(frames, shots)
    const { value } = await chain(
      {
        frames: p1Frames,
        instruction: [
          V6_CORE,
          V6_ACCESS,
          metaBlock(meta, shots, input.hasAudio),
          `PLANOS MEDIDOS [META] (un fotograma por plano: el de su centro${p1Frames.length < shots.length ? `; hay ${shots.length} planos y van ${p1Frames.length} fotogramas repartidos, los planos sin fotograma propio llevan [ND] en lo no observable` : ''}):\n${shotList(shots)}`,
          `TRANSCRIPCIÓN AUTOMÁTICA [META] (Whisper, voces separadas):\n${transcriptText}`,
          V6_PHASE1,
        ].join('\n\n'),
        schema: V6_PHASE1_SCHEMA,
        maxOutputTokens: MAX_REPLY_TOKENS,
        // Describing, not reasoning: low thinking answers sooner (59 s with the default).
        thinking: 'low',
      },
      (t) => parseJson<V6Phase1>(t),
    )
    checkpoint.phase1 = value
    input.save()
  }
  const p1 = fixPhase1(checkpoint.phase1, shots, meta, frames)

  // ── Phase 2 ─────────────────────────────────────────────────────────────
  let done = windows.filter((w) => checkpoint.windows[windowKey(w)]).length
  const report = () => progress({ label: `Registro V6.5: ${done} de ${windows.length} tramos de la línea de tiempo...`, current: 1 + done, total: steps })
  report()
  const reference = phase1Reference(p1)
  const concurrency = Math.max(1, Number(process.env.VISION_CONCURRENCY ?? 3) || 1)
  let next = 0
  const worker = async () => {
    while (next < windows.length) {
      const w = windows[next++]!
      const key = windowKey(w)
      if (checkpoint.windows[key]) continue
      const range = { start: w.start, end: w.end }
      const tag = `t${w.index + 1}`
      const lines = speech.segments
        .map((s, i) => ({ s, n: i + 1 }))
        .filter(({ s }) => s.end > w.start && s.start < w.end)
        .map(({ s, n }) => tLine(n, s))
      const cutsHere = input.cuts.filter((c) => c.time >= w.start && c.time < w.end)
      const shotsHere = shots.filter((s) => s.end > w.start && s.start < w.end).map((s) => s.id)
      const silencesHere = silences.filter((s) => s.end > w.start && s.start < w.end)
      log(`V6 tramo ${w.index + 1}/${windows.length} (${mmss(w.start)}–${mmss(w.end)}, ${w.frames.length} fotogramas)`)
      const audio = input.hasAudio ? await audioClip(input.wavPath, path.join(input.workDir, 'v6-audio'), w) : undefined
      const { value } = await chain(
        {
          frames: w.frames,
          audio,
          thinking: 'low',
          instruction: [
            V6_CORE,
            V6_ACCESS,
            metaBlock(meta, shots, input.hasAudio),
            reference,
            `ESTE TRAMO: ${w.index + 1} de ${windows.length}, del segundo ${w.start.toFixed(1)} (${mmss(w.start)}) al ${w.end.toFixed(1)} (${mmss(w.end)}). ${secondsPlan(w, duration)} Sufijo para entidades y textos nuevos de este tramo: "-${tag}" (ej. O9-${tag}, TX1-${tag}; la app renumera los TX al unir los tramos). Planos en este tramo: ${shotsHere.join(', ') || '[ND]'}.${w.frames.length ? '' : ' Este tramo NO tiene fotogramas: VIS es [ND] en todo él; registra AUD y declara el hueco de imagen.'}`,
            `CORTES MEDIDOS EN ESTE TRAMO [META]: ${cutsHere.length ? cutsHere.map((c) => `${mmss(c.time)} (score ${c.score.toFixed(1)})`).join(', ') : 'ninguno'}`,
            `SILENCIOS MEDIDOS (≥0,5 s bajo -35 dB) [META]: ${silencesHere.length ? silencesHere.map((s) => `${mmss(s.start)}–${mmss(s.end)}`).join(', ') : input.hasAudio ? 'ninguno' : 'NO APLICA'}`,
            `TRANSCRIPCIÓN DE ESTE TRAMO [META] (numeración global T#):\n${lines.join('\n') || 'No se detecta habla en este tramo.'}`,
            V6_WINDOW,
          ].join('\n\n'),
          schema: V6_PERCEPTION_WINDOW_SCHEMA,
          maxOutputTokens: MAX_REPLY_TOKENS,
        },
        (t) => {
          const raw = parseJson<WindowOut>(t)
          const { timeline, filled } = coverTimeline(raw, range)
          return { ...raw, timeline, limites: [...(raw.limites ?? []), ...filled] }
        },
      )
      checkpoint.windows[key] = value
      input.save()
      done++
      report()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, windows.length) }, worker))
  const outs = windows.map((w) => checkpoint.windows[windowKey(w)]!)

  // TX numbering across windows: by first appearance.
  const tx = renumberTexts(outs)
  const timeline = outs.flatMap((o, i) => o.timeline.map((e) => ({ ...e, txt: tx.rename(i, e.txt), vis: tx.rename(i, e.vis) })))
  const cambios = outs.flatMap((o, i) => (o.cambios_estado ?? []).map((c) => ({ ...c, antes: tx.rename(i, c.antes), despues: tx.rename(i, c.despues) })))
  const windowLimits = outs.flatMap((o, i) => (o.limites ?? []).map((l) => `[tramo ${i + 1}] ${tx.rename(i, l)}`))
  const escenas = outs.flatMap((o) => o.escenas ?? [])

  // ── Phase 3 ─────────────────────────────────────────────────────────────
  progress({ label: 'Registro V6.5: síntesis...', current: steps - 1, total: steps })
  if (!checkpoint.phase3) {
    const record = [
      `FASE 1:\n${JSON.stringify({ ficha: p1.ficha, triaje: p1.triaje, procedencia: p1.procedencia, entidades: p1.entidades, planos: p1.planos })}`,
      `ESCENAS (resumen observacional por tramos, ≤120 s):\n${escenas.map((s) => `${mmss(s.start_seconds)}–${mmss(s.end_seconds)} ${s.title}: ${s.description} | AUD: ${s.audio_description}`).join('\n')}`,
      `CAMBIOS DE ESTADO (9.8):\n${cambios.map((c) => `${c.timestamp} ANTES: ${c.antes} / TRANSICIÓN: ${c.transicion} / DESPUÉS: ${c.despues} / ND: ${c.no_determinable}`).join('\n') || '(ninguno)'}`,
      `TEXTOS EN PANTALLA (9.7):\n${tx.list.map((t) => `${t.id} ${t.aparece}–${t.desaparece} [${t.tipo}] "${t.contenido}"`).join('\n') || 'No aparece texto en pantalla.'}`,
      `CORTES MEDIDOS [META]: ${input.cuts.map((c) => mmss(c.time)).join(', ') || 'ninguno'}`,
      `SILENCIOS MEDIDOS [META]: ${silences.map((s) => `${mmss(s.start)}–${mmss(s.end)}`).join(', ') || 'ninguno'}`,
      `TRANSCRIPCIÓN (9.6) [META]:\n${transcriptText}`,
      `LÍMITES DE LOS TRAMOS:\n${windowLimits.map((l) => `- ${l}`).join('\n') || '(ninguno)'}`,
    ].join('\n\n')
    const { value } = await chain(
      {
        frames: [],
        instruction: [
          V6_CORE,
          metaBlock(meta, shots, input.hasAudio),
          `PLANOS [META]:\n${shotList(shots)}`,
          V6_PHASE3,
          'Además, fuera del registro: resumen_completo = un párrafo que cuente de qué trata el video y qué se dice en él, para la biblioteca de la app; idioma = idioma del habla.',
          `REGISTRO:\n${record}`,
        ].join('\n\n'),
        schema: V6_PERCEPTION_PHASE3_SCHEMA,
        maxOutputTokens: MAX_REPLY_TOKENS,
      },
      (t) => parseJson<Phase3Out>(t),
    )
    checkpoint.phase3 = value
    input.save()
  }
  const p3 = checkpoint.phase3

  const imageCover = frames.length
    ? `VIS: fotogramas en ${new Set(frames.map((f) => Math.floor(f.time))).size} de ${Math.ceil(duration)} segundos (${Math.round((100 * new Set(frames.map((f) => Math.floor(f.time))).size) / Math.max(1, Math.ceil(duration)))} %), con todos los cambios de escena; los segundos sin fotograma propio se registran desde el contiguo o como [ND].`
    : 'VIS: sin fotogramas [ND].'
  const markdown = renderV6Record({
    meta,
    phase1: p1,
    merged: {
      summary: { short_summary: p3.resumen_corto, full_summary: '', topics: p3.temas, language: p3.idioma },
      scenes: timeline.map((e, index) => ({
        index,
        start_seconds: e.start_seconds,
        end_seconds: e.end_seconds,
        title: '',
        description: [e.sin_cambios && !/SIN CAMBIOS/.test(e.vis) ? `VIS: SIN CAMBIOS OBSERVABLES. ${e.vis}` : `VIS: ${e.vis}`, `TXT: ${e.txt}`, `CAM: ${e.cam}`, ...(e.cortes ?? [])].join('\n'),
        audio_description: e.aud,
      })),
      transcript: speech.segments.map((s, index) => ({ index, start_seconds: s.start, end_seconds: s.end, speaker: s.speaker?.replace(/^Hablante\s*/i, 'VOZ') ?? 'VOZ1', text: s.text, language: speech.language })),
      elements: outs.flatMap((o) =>
        (o.entidades_nuevas ?? []).map((e) => ({ kind: 'object' as const, label: `${e.id} — ${e.identificacion}`, detail: e.descripcion_fisica, start_seconds: e.primera_aparicion_segundo, end_seconds: null })),
      ),
    },
    phase3: { ...p3, cambios_estado: cambios },
    windowLimits: [
      'La transcripción (9.6) es automática (Whisper, separación de voces propia) [META]: sus palabras no se volvieron a escuchar línea por línea; las discrepancias que el modelo oyó constan arriba.',
      ...windowLimits,
    ],
    access: {
      acceso: 'muestreado',
      detalle: `imagen MUESTREADA: ${frames.length} fotogramas con su tiempo exacto (todos los cambios de escena y al menos uno cada 0,5–1 s, sin los casi idénticos); sonido DIRECTO CONTINUO: el modelo oye el audio completo de cada tramo${input.hasAudio ? '' : ' (el video no tiene pista de audio)'}; duración, fps, cortes y silencios medidos por FFmpeg [META]; transcripción por Whisper [META].`,
      cobertura: `${imageCover} AUD: ${input.hasAudio ? '100 %' : 'NO APLICA'}. TXT: lo legible en los fotogramas.`,
    },
    textosPantalla: tx.list,
  })

  const result: AnalysisResult = {
    summary: { short_summary: p3.resumen_corto, full_summary: p3.resumen_completo || p3.resumen_corto, topics: p3.temas, language: p3.idioma || speech.language },
    scenes: escenas
      .filter((s) => Number.isFinite(s.start_seconds) && s.end_seconds >= s.start_seconds)
      .sort((a, b) => a.start_seconds - b.start_seconds)
      .map((s, index) => ({ index, start_seconds: s.start_seconds, end_seconds: s.end_seconds, title: s.title, description: s.description, audio_description: s.audio_description || null })),
    transcript: speech.segments.map((s, index) => ({ index, start_seconds: s.start, end_seconds: s.end, speaker: s.speaker ?? null, text: s.text, language: speech.language })),
    elements: [
      ...outs.flatMap((o) => o.elementos ?? []).map((e) => ({
        kind: (['object', 'on_screen_text', 'action', 'person', 'relation'].includes(e.kind) ? e.kind : 'object') as Element['kind'],
        label: e.label,
        detail: e.detail || null,
        start_seconds: e.start_seconds,
        end_seconds: Number.isFinite(e.end_seconds) && e.end_seconds >= e.start_seconds ? e.end_seconds : null,
      })),
    ].sort((a, b) => a.start_seconds - b.start_seconds),
  }
  return { result, markdown }
}

/**
 * The entries the window must deliver, spelled out: told only "one per
 * second", the model summarised ten-second stretches.
 */
function secondsPlan(w: V6Window, duration: number): string {
  const first = Math.floor(w.start)
  const last = Math.ceil(w.end)
  const n = last - first
  const chaining = duration > 60
  return `La línea de tiempo de este tramo son ${n} segundos: entradas ${mmss(Math.max(first, w.start))}–${mmss(Math.min(first + 1, w.end))}, ${mmss(first + 1)}–${mmss(first + 2)}, … hasta la que termina en ${mmss(w.end)}; ${chaining ? 'solo se pueden juntar en una entrada los segundos CONSECUTIVOS sin ningún cambio (sin_cambios=true); un segundo con cualquier cambio, aunque sea una frase nueva de la transcripción, es su propia entrada' : 'el video dura menos de un minuto: una entrada por segundo, sin encadenar'}. Una entrada de varios segundos con cambios dentro se rechaza.`
}

const windowKey = (w: V6Window) => `v6-${w.start.toFixed(3)}-${w.end.toFixed(3)}-${w.frames.length}`

/** Measured facts win over the model: shot times and counts, the technical sheet. */
function fixPhase1(p1: V6Phase1, shots: Shot[], meta: VideoMeta, frames: Frame[]): V6Phase1 {
  const byId = new Map((p1.planos ?? []).map((p) => [p.id, p]))
  const planos = shots.map((s) => {
    const p = byId.get(s.id)
    const nd = '[ND]'
    return {
      id: s.id,
      inicio: mmss(s.start),
      fin: mmss(s.end),
      duracion: `${(s.end - s.start).toFixed(2)} s [META]`,
      escala: p?.escala ?? nd,
      angulo: p?.angulo ?? nd,
      altura: p?.altura ?? nd,
      movimiento: p?.movimiento ?? nd,
      composicion: p?.composicion ?? nd,
      fondo_superficie: p?.fondo_superficie ?? nd,
      iluminacion: p?.iluminacion ?? nd,
      entrada_salida: p?.entrada_salida ?? (s.start === 0 ? 'inicio del archivo' : 'corte seco [META]'),
    }
  })
  const lengths = shots.map((s) => ({ id: s.id, d: s.end - s.start }))
  const longest = lengths.reduce((a, b) => (b.d > a.d ? b : a), lengths[0]!)
  const shortest = lengths.reduce((a, b) => (b.d < a.d ? b : a), lengths[0]!)
  const last = frames.length ? frames[frames.length - 1]!.time : meta.durationSeconds
  return {
    ...p1,
    ficha: { ...p1.ficha, duracion: `${mmss(meta.durationSeconds)} [META]`, duracion_origen: 'metadata', planos: shots.length },
    ficha_tecnica: {
      duracion_archivo: `${meta.durationSeconds} s (${mmss(meta.durationSeconds)}) [META]`,
      ultimo_contenido_observable: `${mmss(last)} (último fotograma muestreado)`,
      numero_planos: shots.length,
      duracion_media_plano: `${(meta.durationSeconds / shots.length).toFixed(2)} s [META]`,
      plano_mas_largo: `${longest.id} (${longest.d.toFixed(2)} s) [META]`,
      plano_mas_corto: `${shortest.id} (${shortest.d.toFixed(2)} s) [META]`,
    },
    planos,
    textos_pantalla: [],
  }
}

/** TX ids of each window (TX1-t3, or a bare TX1) become TX1, TX2... in order of appearance; references follow, window by window. */
export function renumberTexts(outs: Array<Pick<WindowOut, 'textos_pantalla'>>): {
  list: V6Phase1['textos_pantalla']
  rename: (window: number, s: string) => string
} {
  const all = outs.flatMap((o, i) => (o.textos_pantalla ?? []).map((t) => ({ ...t, window: i })))
  const seconds = (s: string) => {
    const m = /(\d+):(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?/.exec(s)
    if (!m) return Number.POSITIVE_INFINITY
    return m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2])
  }
  all.sort((a, b) => seconds(a.aparece) - seconds(b.aparece) || a.window - b.window)
  const map = new Map<string, string>()
  const list = all.map((t, i) => {
    const id = `TX${i + 1}`
    map.set(`${t.window}:${t.id}`, id)
    return { ...t, id }
  })
  // One pass with a callback, so TX1 -> TX5 never chains into TX5 -> TX9.
  const rename = (window: number, s: string) =>
    s ? s.replace(/\bTX\d+(?:-t\d+)?\b/g, (old) => map.get(`${window}:${old}`) ?? old) : s
  return { list: list.map(({ window: _w, ...t }) => t), rename }
}

export { PROTOCOL_VERSION }
