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
import { maxFramesPerRequest } from '../providers/gemini.js'
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
const windowSeconds = () => Math.max(30, Number(process.env.V6_WINDOW_SECONDS ?? 120) || 120)
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
  voces: arr(obj({ id: STR, descripcion_acustica: STR })),
  // 9.4 and 9.13 for the shots that start in the window: written here, with
  // every frame of the shot in view and in parallel, instead of in one reply
  // for the whole video (a 201-shot documentary on 19 Oct 2026 kept phase 1
  // writing for six minutes until the stream broke, and the synthesis six more).
  planos: arr(
    obj({ id: STR, escala: STR, angulo: STR, altura: STR, movimiento: STR, composicion: STR, fondo_superficie: STR, iluminacion: STR, entrada_salida: STR }),
  ),
  recreacion: arr(
    obj({ plano: STR, sujetos_estado_inicial: STR, accion: STR, camara: STR, luz_entorno: STR, audio: STR, texto: STR, estado_final: STR }),
  ),
  // 9.2 asks for the sound's quality when there is a track; phase 1 does not hear.
  procedencia_audio: arr(STR),
  limites: arr(STR),
})

/** Phase 1 without the shots: the windows describe them. */
export const V6_PERCEPTION_PHASE1_SCHEMA = (() => {
  const base = V6_PHASE1_SCHEMA as { type: string; properties: Record<string, unknown>; required: string[] }
  const properties = { ...base.properties }
  delete (properties as Record<string, unknown>).planos
  return { type: 'object', properties, required: Object.keys(properties) }
})()

/** Phase 3 without 9.8 and the per-shot 9.13 (the windows wrote them, with the frames in view) and with the library summary. */
export const V6_PERCEPTION_PHASE3_SCHEMA = (() => {
  const base = V6_PHASE3_SCHEMA as { type: string; properties: Record<string, unknown>; required: string[] }
  const properties = { ...base.properties, resumen_completo: STR, idioma: STR }
  delete (properties as Record<string, unknown>).cambios_estado
  delete (properties as Record<string, unknown>).recreacion
  return { type: 'object', properties, required: Object.keys(properties) }
})()

type WindowOut = {
  timeline: Array<{ start_seconds: number; end_seconds: number; sin_cambios: boolean; vis: string; aud: string; txt: string; cam: string; cortes: string[] }>
  textos_pantalla: V6Phase1['textos_pantalla']
  cambios_estado: V6Phase3['cambios_estado']
  escenas: Array<{ start_seconds: number; end_seconds: number; title: string; description: string; audio_description: string }>
  elementos: Array<{ kind: string; label: string; detail: string; start_seconds: number; end_seconds: number }>
  entidades_nuevas: Array<{ id: string; primera_aparicion_segundo: number; descripcion_fisica: string; identificacion: string }>
  /** Acoustic description of each voice heard in the window (phase 1 does not hear). */
  voces?: Array<{ id: string; descripcion_acustica: string }>
  /** 9.4 of the shots that start in the window (absent in checkpoints from before 19 Oct 2026). */
  planos?: Array<Omit<V6Phase1['planos'][number], 'inicio' | 'fin' | 'duracion'>>
  /** 9.13 of the same shots. */
  recreacion?: Array<Omit<V6Phase3['recreacion'][number], 'duracion'>>
  /** 9.2 of the window's sound (absent in checkpoints from before 20 Oct 2026). */
  procedencia_audio?: string[]
  limites: string[]
}

type Phase3Out = Omit<V6Phase3, 'cambios_estado' | 'recreacion'> & { resumen_completo: string; idioma: string; recreacion?: V6Phase3['recreacion'] }

/** What the V6 record keeps between attempts (inside the perception checkpoint). */
export type V6Checkpoint = {
  phase1?: V6Phase1
  windows: Record<string, WindowOut>
  /** Windows answered in two halves (their keys), so a resumed job goes straight to the halves. */
  split?: string[]
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

export type V6Window = {
  index: number
  start: number
  end: number
  frames: Frame[]
  /** "3", or "3a"/"3b" for the halves of window 3 when it had to be split. */
  label?: string
}

/** A window shorter than this is not split again. */
const MIN_SPLIT_SECONDS = 20

/** The two halves of a window, each with its own frames and label. */
export function splitWindow(w: V6Window): [V6Window, V6Window] {
  const mid = (w.start + w.end) / 2
  const label = w.label ?? String(w.index + 1)
  return [
    { index: w.index, start: w.start, end: mid, frames: w.frames.filter((f) => f.time < mid), label: `${label}a` },
    { index: w.index, start: mid, end: w.end, frames: w.frames.filter((f) => f.time >= mid), label: `${label}b` },
  ]
}

/**
 * Contiguous windows over the whole video, each at most WINDOW_FRAMES frames
 * and windowSeconds() long. The last window may take a short tail (up to 15 %
 * more frames and seconds) instead of leaving it to a window of its own: a
 * 60-s clip of 312 frames cost two requests, one of them for 12 frames.
 */
export function v6Windows(frames: Frame[], duration: number): V6Window[] {
  const maxSeconds = windowSeconds()
  // At Google's default resolution 300 frames do not fit the per-minute token
  // limit and are refused every time; carry only what fits.
  const maxFrames = Math.min(WINDOW_FRAMES, maxFramesPerRequest())
  const out: V6Window[] = []
  let start = 0
  let current: Frame[] = []
  for (const [i, f] of frames.entries()) {
    const tail = frames.length - i <= maxFrames * 0.15 && Math.max(duration, frames[frames.length - 1]!.time) - start <= maxSeconds * 1.15
    if (!tail && (current.length >= maxFrames || f.time - start >= maxSeconds)) {
      const end = current.length >= maxFrames ? f.time : Math.min(start + maxSeconds, f.time)
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

/** Resolution as displayed and frame rate, from FFprobe [META]. */
export async function probeVideo(file: string): Promise<{ width: number | null; height: number | null; fps: number | null }> {
  try {
    const bin = process.env.FFPROBE_PATH || 'ffprobe'
    const { stdout } = await run(bin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate:stream_side_data=rotation:stream_tags=rotate', '-of', 'json', file])
    type Stream = { width?: number; height?: number; avg_frame_rate?: string; side_data_list?: Array<{ rotation?: number }>; tags?: { rotate?: string } }
    const s = (JSON.parse(String(stdout)) as { streams?: Stream[] }).streams?.[0]
    const [num, den] = String(s?.avg_frame_rate ?? '').split('/').map(Number)
    const fps = num && den ? num / den : null
    // A phone video is often stored landscape with a rotation flag; FFmpeg
    // turns its frames upright, so the size is given as they are seen.
    const rotation = Number(s?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? s?.tags?.rotate ?? 0)
    const turned = Math.abs(rotation) % 180 === 90
    const width = (turned ? s?.height : s?.width) ?? null
    const height = (turned ? s?.width : s?.height) ?? null
    return { width, height, fps: fps && Number.isFinite(fps) ? Math.round(fps * 1000) / 1000 : null }
  } catch {
    return { width: null, height: null, fps: null }
  }
}

/** The window's sound as a small Opus file the model can hear. */
async function audioClip(wavPath: string, dir: string, w: V6Window): Promise<{ path: string; mimeType: string; seconds: number }> {
  await mkdir(dir, { recursive: true })
  const out = path.join(dir, `tramo-${w.label ?? w.index + 1}.ogg`)
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
  const ent = (p1.entidades ?? []).map((e) => `${e.id} — ${e.descripcion_fisica}`).join('\n')
  return `REGISTRO DE ENTIDADES (9.3, fijado para todo el video):\n${ent || '(ninguna)'}`
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

/** How a filled hole reads in VIS. */
const ND_HOLE = '[ND] — registro no producido'

/** The chain's error when every model is out of its daily quota: waiting or splitting cannot help, the run stops. */
const isDailyQuota = (err: unknown) => (err as Error | undefined)?.name === 'DailyQuotaExhaustedError'
/** Errors about the moment, not the request: two halves would meet the same quota or the same busy models. */
const notTheRequest = (err: unknown) => isDailyQuota(err) || (err as Error | undefined)?.name === 'AllProvidersBusyError'

/**
 * The window's timeline must run from its start to its end without holes: the
 * protocol's continuous coverage. Holes up to a quarter of the window are
 * filled with an entry that says the record of that interval was not produced
 * (it is not "SIN DATOS": the frames and audio were there); a bigger hole
 * means the model skipped part of the window and the reply is asked again.
 */
export function coverTimeline(
  w: WindowOut,
  range: { start: number; end: number },
  opts: { lenient?: boolean; marks?: Array<{ time: number; what: string; cut?: boolean }> } = {},
): { timeline: WindowOut['timeline']; filled: string[] } {
  const entries = [...(w.timeline ?? [])]
    .filter((e) => Number.isFinite(e.start_seconds) && Number.isFinite(e.end_seconds) && e.end_seconds > e.start_seconds)
    .sort((a, b) => a.start_seconds - b.start_seconds)
  if (!entries.length) throw new Error('El tramo no trae ninguna entrada de línea de tiempo.')
  const out: WindowOut['timeline'] = []
  const filled: string[] = []
  let at = range.start
  const hole = (a: number, b: number) => {
    filled.push(`[${mmss(a)}–${mmss(b)}] la línea de tiempo de este intervalo no se produjo; ver los fotogramas y el audio del tramo [ND].`)
    out.push({ start_seconds: a, end_seconds: b, sin_cambios: false, vis: `${ND_HOLE} para este intervalo.`, aud: '[ND]', txt: '[ND]', cam: '[ND]', cortes: [] })
  }
  // All the holes add up: five 25 s holes in 120 s used to pass because each
  // one alone was under the limit.
  let missing = 0
  for (const e of entries) {
    const s = Math.max(e.start_seconds, range.start)
    const t = Math.min(e.end_seconds, range.end)
    if (s >= range.end) continue
    if (t <= at) {
      // Finer entries inside one already kept (the whole second, then its
      // halves) were dropped without a trace: their text joins the entry.
      const into = out[out.length - 1]
      if (into && !into.vis.startsWith('[ND]') && e.start_seconds >= into.start_seconds - 0.05 && e.end_seconds <= into.end_seconds + 0.05) absorb(into, e)
      continue
    }
    if (s > at + 0.05) {
      missing += s - at
      hole(at, s)
    }
    // A start within 0.05 s of the previous end continues it (a window that
    // starts at 709.68 was answered from 709.7 and the chain broke there).
    out.push({ ...e, start_seconds: s > at + 0.05 ? s : at, end_seconds: t })
    at = t
  }
  if (range.end > at + 0.05) {
    missing += range.end - at
    hole(at, range.end)
  } else if (at < range.end && out.length) out[out.length - 1]!.end_seconds = range.end
  if (missing > (range.end - range.start) / 4) throw new Error(`La línea de tiempo deja ${Math.round(missing)} s del tramo sin registrar.`)
  filled.push(...flagHiddenChanges(out, opts.marks ?? []))
  // A timeline running ahead of or behind the video puts every description
  // in the wrong second. The CORTE lines show it: the model copies the
  // measured instants into the entry where it thinks they happen (real
  // replies on 19 Oct 2026 put 13 of 30 cuts 1.5-15 s away from their entry).
  const drift = timelineDrift(out)
  if (drift.count > 2) {
    if (!opts.lenient) throw new Error(`La línea de tiempo está desplazada: ${drift.count} cortes citados a más de 1 s de su entrada (hasta ${drift.worst.toFixed(1)} s).`)
    filled.push(drift.line)
  }
  // One entry per second: only stable stretches (sin_cambios) may span more.
  // A real reply on 18 Oct 2026 put ten seconds of changing speech in one
  // entry; past a fifth of the window that is a summary, not the timeline.
  const coarse = out.filter((e) => !e.sin_cambios && !e.vis.startsWith('[ND]') && e.end_seconds - e.start_seconds > 1.5)
  const coarseSeconds = coarse.reduce((sum, e) => sum + (e.end_seconds - e.start_seconds), 0)
  if (!opts.lenient && coarseSeconds > (range.end - range.start) / 5) {
    throw new Error(`La línea de tiempo agrupa ${Math.round(coarseSeconds)} s con cambios en entradas de varios segundos; el protocolo pide una entrada por segundo.`)
  }
  for (const e of coarse) filled.push(`[${mmss(e.start_seconds)}–${mmss(e.end_seconds)}] granularidad reducida: una sola entrada para ${(e.end_seconds - e.start_seconds).toFixed(1)} s con cambios [BAJA].`)
  return { timeline: out, filled }
}

type Entry = WindowOut['timeline'][number]

/** A finer entry's channels, with its own interval, inside the entry that covers it. */
function absorb(into: Entry, e: Entry): void {
  const at = `[${mmss(e.start_seconds)}–${mmss(e.end_seconds)}]`
  for (const k of ['vis', 'aud', 'txt', 'cam'] as const) {
    const extra = (e[k] ?? '').trim()
    if (extra && extra !== (into[k] ?? '').trim() && !/^sin cambios\.?$/i.test(extra)) into[k] = `${into[k]} ${at} ${extra}`
  }
  into.cortes = [...(into.cortes ?? []), ...(e.cortes ?? [])]
  if (!e.sin_cambios) into.sin_cambios = false
}

/**
 * A "no changes" entry that spans a measured cut, or a longer one that spans
 * the start of a new transcript line, hides that change (real replies on 19
 * Oct 2026 covered 16 s with two cuts and three lines of speech that way). It
 * becomes an entry with changes and its text no longer claims there were
 * none. Returns the lines for 9.14; entries already flagged are left alone.
 */
export function flagHiddenChanges(timeline: Entry[], marks: Array<{ time: number; what: string; cut?: boolean }>): string[] {
  const lines: string[] = []
  for (const e of timeline) {
    if (!e.sin_cambios && !e.vis.startsWith('SIN CAMBIOS OBSERVABLES')) continue
    const long = e.end_seconds - e.start_seconds > 1.5
    const hidden = marks.filter((m) => (long || m.cut) && m.time > e.start_seconds + 0.05 && m.time < e.end_seconds - 0.05)
    if (!hidden.length) continue
    const what = hidden.map((m) => `${m.what} en ${mmss(m.time)}`).join(', ')
    e.sin_cambios = false
    if (e.vis.startsWith('SIN CAMBIOS OBSERVABLES')) e.vis = `[BAJA] El tramo la dio como «${e.vis.trim()}», pero en ella hay ${what}: lo que cambia no quedó descrito [ND].`
    lines.push(`[${mmss(e.start_seconds)}–${mmss(e.end_seconds)}] marcada sin cambios pero contiene ${what} [BAJA].`)
  }
  return lines
}

/** The model's CORTE citations that fall more than 1 s outside the entry that carries them. */
export function timelineDrift(timeline: Entry[]): { count: number; worst: number; line: string } {
  const off: Array<{ a: number; b: number; d: number }> = []
  for (const e of timeline) {
    for (const c of e.cortes ?? []) {
      const t = clockSeconds(c)
      if (!Number.isFinite(t)) continue
      const d = t < e.start_seconds ? e.start_seconds - t : t - e.end_seconds
      if (d > 1) off.push({ a: e.start_seconds, b: e.end_seconds, d })
    }
  }
  if (!off.length) return { count: 0, worst: 0, line: '' }
  const worst = Math.max(...off.map((o) => o.d))
  const from = Math.min(...off.map((o) => o.a))
  const to = Math.max(...off.map((o) => o.b))
  return {
    count: off.length,
    worst,
    line: `[${mmss(from)}–${mmss(to)}] ${off.length} cortes citados a más de 1 s de su entrada (hasta ${worst.toFixed(1)} s): los tiempos de este intervalo pueden estar desplazados [BAJA].`,
  }
}

/**
 * A follow-up reply put in place of the [ND] holes it covers. Its texts keep
 * the window's id when the content is the same and otherwise get the
 * follow-up's suffix (two replies both number from TX1); its shots, entities
 * and limits join the window's.
 */
export function mergeFill(out: WindowOut, extra: WindowOut, label: string): WindowOut {
  const from = extra.timeline[0]?.start_seconds ?? Number.POSITIVE_INFINITY
  const to = extra.timeline[extra.timeline.length - 1]?.end_seconds ?? Number.NEGATIVE_INFINITY
  const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const ids = new Map<string, string>()
  const texts: WindowOut['textos_pantalla'] = []
  for (const t of extra.textos_pantalla ?? []) {
    const same = (out.textos_pantalla ?? []).find((x) => norm(x.contenido) === norm(t.contenido))
    const id = same?.id ?? `TX${texts.length + 1}-t${label}`
    ids.set(t.id, id)
    if (!same) texts.push({ ...t, id })
  }
  const rename = (s: string) => (s ? s.replace(/\bTX\d+(?:-t\d+[a-z]*)?\b/g, (old) => ids.get(old) ?? old) : s)
  const timeline: WindowOut['timeline'] = []
  const limites = [...(out.limites ?? [])]
  for (const e of out.timeline) {
    if (!e.vis.startsWith(ND_HOLE) || e.start_seconds < from - 0.05 || e.end_seconds > to + 0.05) {
      timeline.push(e)
      continue
    }
    let part: WindowOut['timeline']
    try {
      part = coverTimeline(extra, { start: e.start_seconds, end: e.end_seconds }, { lenient: true }).timeline
    } catch {
      timeline.push(e)
      continue
    }
    timeline.push(...part.map((x) => renameAll(x, rename)))
    const hole = `[${mmss(e.start_seconds)}–${mmss(e.end_seconds)}]`
    const declared = limites.findIndex((l) => l.startsWith(`${hole} la línea de tiempo de este intervalo no se produjo`))
    if (declared >= 0) limites.splice(declared, 1)
    limites.push(`${hole} registrado en una segunda petición (tramo ${label}), solo para este intervalo, porque la primera respuesta lo dejó sin registrar.`)
  }
  const planned = new Set((out.planos ?? []).map((p) => shotId(p.id)))
  const recreated = new Set((out.recreacion ?? []).map((r) => shotId(r.plano)))
  const lastScene = Math.max(Number.NEGATIVE_INFINITY, ...(out.escenas ?? []).map((x) => x.end_seconds))
  return {
    ...out,
    timeline,
    textos_pantalla: [...(out.textos_pantalla ?? []), ...texts],
    cambios_estado: [...(out.cambios_estado ?? []), ...(extra.cambios_estado ?? []).map((c) => renameAll(c, rename))],
    escenas: [...(out.escenas ?? []), ...(extra.escenas ?? []).filter((x) => x.start_seconds >= lastScene - 0.5)],
    elementos: [...(out.elementos ?? []), ...(extra.elementos ?? [])],
    entidades_nuevas: [...(out.entidades_nuevas ?? []), ...(extra.entidades_nuevas ?? []).map((x) => renameAll(x, rename))],
    voces: [...(out.voces ?? []), ...(extra.voces ?? [])],
    planos: [...(out.planos ?? []), ...(extra.planos ?? []).filter((p) => !planned.has(shotId(p.id))).map((p) => renameAll(p, rename))],
    recreacion: [...(out.recreacion ?? []), ...(extra.recreacion ?? []).filter((r) => !recreated.has(shotId(r.plano))).map((r) => renameAll(r, rename))],
    procedencia_audio: [...(out.procedencia_audio ?? []), ...(extra.procedencia_audio ?? [])],
    limites: [...new Set([...limites, ...(extra.limites ?? []).map(rename)])],
  }
}

/** "01:14.92", "CORTE en 1:02:03.5 → PL9" → seconds; NaN without a time. */
function clockSeconds(s: string): number {
  const m = /(\d+):(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?/.exec(s ?? '')
  if (!m) return Number.NaN
  return m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2])
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
  // The requests the timeline takes: a window answered in two halves is two.
  const leavesOf = (w: V6Window): V6Window[] => (checkpoint.split?.includes(windowKey(w)) ? splitWindow(w).flatMap(leavesOf) : [w])
  let total = windows.flatMap(leavesOf).length
  // Aborted once a window fails for good: the other windows stop retrying
  // instead of spending requests on a job that will be retried anyway.
  const halt = new AbortController()
  const chain = <T>(req: Parameters<typeof describeWithFallback>[1], parse: (t: string) => T) =>
    describeWithFallback(providers, req, { log, parse, onAttempt: input.onAttempt, signal: halt.signal })

  // ── Phase 1 ─────────────────────────────────────────────────────────────
  progress({ label: 'Registro V6.5: entidades y planos...', current: 0, total: total + 2 })
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
        schema: V6_PERCEPTION_PHASE1_SCHEMA,
        maxOutputTokens: MAX_REPLY_TOKENS,
        // Describing, not reasoning: low thinking answers sooner (59 s with the default).
        thinking: 'low',
      },
      (t) => parseJson<V6Phase1>(t),
    )
    checkpoint.phase1 = value
    input.save()
  }
  // ── Phase 2 ─────────────────────────────────────────────────────────────
  // Progress counts the requests the timeline really takes (it read "2 de 1
  // tramos" after a split).
  let done = windows.flatMap(leavesOf).filter((w) => checkpoint.windows[windowKey(w)]).length
  const report = () => progress({ label: `Registro V6.5: ${done} de ${total} tramos de la línea de tiempo...`, current: 1 + done, total: total + 2 })
  report()
  const reference = phase1Reference(checkpoint.phase1)
  const concurrency = Math.max(1, Number(process.env.VISION_CONCURRENCY ?? 8) || 1)
  let next = 0
  // The measured changes a "no changes" entry must not hide.
  const marksOf = (w: { start: number; end: number }) => [
    ...input.cuts.filter((c) => c.time >= w.start && c.time < w.end).map((c) => ({ time: c.time, what: 'un corte medido', cut: true })),
    ...speech.segments.map((s, n) => ({ time: s.start, what: `el inicio de T${n + 1}` })).filter((m) => m.time > w.start && m.time < w.end),
  ]
  /** One request for a window, a half, or the hole a reply left (`fill` says which hole): its frames, its sound, its measurements. */
  const askWindow = async (w: V6Window, fill?: string): Promise<WindowOut> => {
    const range = { start: w.start, end: w.end }
    const label = w.label ?? String(w.index + 1)
    const tag = `t${label}`
    const lines = speech.segments
      .map((s, i) => ({ s, n: i + 1 }))
      .filter(({ s }) => s.end > w.start && s.start < w.end)
      .map(({ s, n }) => tLine(n, s))
    const cutsHere = input.cuts.filter((c) => c.time >= w.start && c.time < w.end)
    const shotsHere = shots.filter((s) => s.end > w.start && s.start < w.end).map((s) => s.id)
    // Each shot is described by the window it starts in.
    const ownShots = shots.filter((s) => s.start >= w.start && (s.start < w.end || (w.end >= duration - 1e-6 && s.start <= w.end)))
    const silencesHere = silences.filter((s) => s.end > w.start && s.start < w.end)
    log(`V6 tramo ${label}/${windows.length} (${mmss(w.start)}–${mmss(w.end)}, ${w.frames.length} fotogramas)`)
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
          // Two decimals: told 709.7 for a window that starts at 709.68, the model started there and the chain broke.
          `ESTE TRAMO: ${label} de ${windows.length}, del segundo ${w.start.toFixed(2)} (${mmss(w.start)}) al ${w.end.toFixed(2)} (${mmss(w.end)}). ${secondsPlan(w)} Sufijo para entidades y textos nuevos de este tramo: "-${tag}" (ej. O9-${tag}, TX1-${tag}; la app renumera los TX al unir los tramos). Planos en este tramo: ${shotsHere.join(', ') || '[ND]'}.${w.frames.length ? '' : ' Este tramo NO tiene fotogramas: VIS es [ND] en todo él; registra AUD y declara el hueco de imagen.'}`,
          ...(fill ? [fill] : []),
          `PLANOS QUE EMPIEZAN EN ESTE TRAMO [META] (descríbelos en planos y recreacion, uno por uno, con estos IDs):\n${ownShots.map((s) => `${s.id} — ${mmss(s.start)}–${mmss(s.end)} (${(s.end - s.start).toFixed(2)} s)${s.end > w.end + 0.05 ? ' — sigue en el tramo siguiente: describe lo que ves aquí' : ''}`).join('\n') || '(ninguno)'}`,
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
        // A half too short to split again, or the second look at a hole: its
        // grouped seconds are kept, each declared in 9.14, rather than the
        // whole analysis failing.
        const lastResort = fill !== undefined || (Boolean(w.label && /[ab]$/.test(w.label)) && w.end - w.start < MIN_SPLIT_SECONDS)
        const { timeline, filled } = coverTimeline(raw, range, { lenient: lastResort, marks: marksOf(w) })
        // A real reply on 19 Oct 2026 described 33 shots and wrote the
        // recreation sheet of 7: both lists are checked.
        for (const [list, what] of [[(raw.planos ?? []).map((p) => p.id), 'describe'], [(raw.recreacion ?? []).map((r) => r.plano), 'da ficha de recreación a']] as const) {
          const done = new Set(list.map(shotId))
          const missing = ownShots.filter((s) => !done.has(s.id))
          if (!fill && ownShots.length >= 2 && missing.length > ownShots.length / 2) {
            throw new Error(`El tramo ${what} ${ownShots.length - missing.length} de sus ${ownShots.length} planos.`)
          }
        }
        return { ...raw, timeline, limites: [...(raw.limites ?? []), ...filled] }
      },
    )
    return value
  }
  /**
   * Seconds a reply left unrecorded are asked once more, on their own (the
   * frames and sound of just that stretch), before they go to the record as
   * [ND]: a reply on 19 Oct 2026 stopped 19.7 s before the end of its window.
   * One request per window at most. `stop` is a spent daily quota, which ends
   * the run once the window is saved.
   */
  const fillHoles = async (w: V6Window, out: WindowOut): Promise<{ value: WindowOut; stop?: unknown }> => {
    const holes = out.timeline.filter((e) => e.vis.startsWith(ND_HOLE))
    const big = holes.filter((e) => e.end_seconds - e.start_seconds >= 1)
    if (holes.reduce((sum, e) => sum + e.end_seconds - e.start_seconds, 0) <= 2 || !big.length) return { value: out }
    // The stretch from the first to the last hole, or the largest hole alone when that stretch is most of the window.
    const largest = big.reduce((a, b) => (b.end_seconds - b.start_seconds > a.end_seconds - a.start_seconds ? b : a))
    const whole = { start: big[0]!.start_seconds, end: big[big.length - 1]!.end_seconds }
    const span = whole.end - whole.start > (w.end - w.start) / 2 ? { start: largest.start_seconds, end: largest.end_seconds } : whole
    const label = `${w.label ?? w.index + 1}r`
    const sub: V6Window = { index: w.index, start: span.start, end: span.end, frames: w.frames.filter((f) => f.time >= span.start && f.time < span.end), label }
    try {
      const extra = await askWindow(sub, `ESTA PETICIÓN COMPLETA UN HUECO: la respuesta del tramo ${w.label ?? w.index + 1} dejó este intervalo sin registrar. Regístralo con el mismo detalle; en las demás listas, solo lo que empiece en él.`)
      return { value: mergeFill(out, extra, label) }
    } catch (err) {
      log(`tramo ${w.label ?? w.index + 1}: no se pudo completar el hueco ${mmss(span.start)}–${mmss(span.end)}; queda como [ND]`)
      return { value: out, stop: isDailyQuota(err) ? err : undefined }
    }
  }
  // The windows actually answered: the planned ones, or the halves of one that failed.
  const leaves: V6Window[] = []
  const runWindow = async (w: V6Window): Promise<void> => {
    const key = windowKey(w)
    if (checkpoint.windows[key]) {
      leaves.push(w)
      return
    }
    if (checkpoint.split?.includes(key)) {
      await Promise.all(splitWindow(w).map(runWindow))
      return
    }
    let answered: WindowOut
    try {
      answered = await askWindow(w)
    } catch (err) {
      if (halt.signal.aborted) throw err
      // No model gave a valid answer for the whole window (most often:
      // seconds grouped in a long window). Two halves, in parallel, each
      // with half the timeline to write, instead of the same request again.
      // A spent daily quota, models all busy, or a too-short window cannot
      // be helped by this.
      const msg = String(err)
      if (notTheRequest(err) || !/Ningún proveedor/.test(msg) || /cuota del día/.test(msg) || w.end - w.start < MIN_SPLIT_SECONDS) throw err
      log(`tramo ${w.label ?? w.index + 1}: ningún modelo lo resolvió entero; se parte en dos mitades en paralelo`)
      checkpoint.split = [...(checkpoint.split ?? []), key]
      total++
      input.save()
      await Promise.all(splitWindow(w).map(runWindow))
      return
    }
    const { value, stop } = await fillHoles(w, answered)
    checkpoint.windows[key] = value
    leaves.push(w)
    input.save()
    done++
    report()
    if (stop) throw stop
  }
  // Once a window fails for good the job will be retried, so no new window
  // is asked (they kept spending quota after the failure), and the job only
  // fails after those already in flight are answered and checkpointed, so
  // the retry reuses them instead of asking them again in parallel.
  let failure: { error: unknown } | null = null
  const worker = async () => {
    while (next < windows.length && !failure) {
      try {
        await runWindow(windows[next++]!)
      } catch (error) {
        failure ??= { error }
        halt.abort(error)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, windows.length) }, worker))
  if (failure) throw (failure as { error: unknown }).error
  leaves.sort((a, b) => a.start - b.start)
  const outs = leaves.map((w) => checkpoint.windows[windowKey(w)]!)
  // Each window keeps its own label ("3", or "3a"/"3b" after a split) in 9.14, 9.3 and the voices.
  const labels = leaves.map((w) => w.label ?? String(w.index + 1))

  // TX numbering across windows: by first appearance.
  const tx = renumberTexts(outs, leaves.map((w) => w.end))
  // The checks on "no changes" entries and on a drifting timeline also apply
  // to windows saved before them: what they find is declared, not asked again.
  const checked = outs.map((o, i) => {
    const entries = o.timeline.map((e) => ({ ...e }))
    const [first, last] = [entries[0], entries[entries.length - 1]]
    if (first && Math.abs(first.start_seconds - leaves[i]!.start) <= 0.05) first.start_seconds = leaves[i]!.start
    if (last && Math.abs(last.end_seconds - leaves[i]!.end) <= 0.05) last.end_seconds = leaves[i]!.end
    const found = flagHiddenChanges(entries, marksOf(leaves[i]!))
    const drift = timelineDrift(entries)
    if (drift.count > 2) found.push(drift.line)
    return { entries, limits: found.filter((l) => !(o.limites ?? []).includes(l)) }
  })
  // CORTE lines come from the measured cuts [META], not from the model, which
  // placed some in the wrong second, named the wrong shot or skipped them.
  const shotAtCut = (time: number) => shots.find((s) => Math.abs(s.start - time) < 0.06) ?? shots.find((s) => time >= s.start && time < s.end)
  const measuredCuts = (a: number, b: number) =>
    input.cuts.filter((c) => c.time >= a && c.time < b).map((c) => `CORTE en ${mmss(c.time)} → ${shotAtCut(c.time)?.id ?? '[ND]'}`)
  const plain = (s: string) => (s ?? '').replace(/\bsin_cambios\b/g, 'sin cambios')
  const timeline = checked.flatMap(({ entries }, i) =>
    entries.map((e) => {
      const txt = plain(tx.rename(i, e.txt))
      const cam = plain(e.cam).replace(/CORTE en [^;,\n]*?(?:→|->)\s*PL\d+[;,.]?\s*/g, '').trim() || 'sin cambios'
      const cortes = measuredCuts(e.start_seconds, e.end_seconds)
      // A text that appears or goes, or a cut, is a change: never "no changes".
      const changes = cortes.length > 0 || /\b(aparece|desaparece)/i.test(txt) || /\b(aparece|desaparece)/i.test(cam)
      return { ...e, sin_cambios: e.sin_cambios && !changes, vis: plain(tx.rename(i, e.vis)), aud: plain(e.aud), txt, cam, cortes }
    }),
  )
  const cambios = outs.flatMap((o, i) => (o.cambios_estado ?? []).map((c) => ({ ...c, antes: tx.rename(i, c.antes), despues: tx.rename(i, c.despues) })))
  const windowLimits = outs.flatMap((o, i) => [...(o.limites ?? []), ...checked[i]!.limits].map((l) => `[tramo ${labels[i]}] ${tx.rename(i, l)}`))
  const escenas = outs.flatMap((o) => o.escenas ?? [])
  const windowShots = outs.flatMap((o, i) => (o.planos ?? []).map((p) => renameAll(p, (s) => tx.rename(i, s))))
  const p1 = fixPhase1({ ...checkpoint.phase1, planos: [...(checkpoint.phase1.planos ?? []), ...windowShots] as V6Phase1['planos'] }, shots, meta, frames, input.hasAudio)
  const describedShots = new Set([...(checkpoint.phase1.planos ?? []), ...windowShots].map((p) => shotId(p.id)))
  for (const s of shots) if (!describedShots.has(s.id)) windowLimits.push(`[${mmss(s.start)}–${mmss(s.end)}] ${s.id}: ningún tramo describió el plano (9.4) [ND].`)
  withVoices(p1, outs, labels)
  // 9.2 of the sound: phase 1 sees one frame per shot and hears nothing.
  p1.procedencia = [...p1.procedencia, ...outs.flatMap((o, i) => (o.procedencia_audio ?? []).map((a) => `AUDIO [tramo ${labels[i]}]: ${a}`))]
  // New entities in the 9.3 format, with the window's TX numbering applied to their ids.
  const windowEntities = outs.flatMap((o, i) =>
    (o.entidades_nuevas ?? []).map((e) => {
      const first = Number.isFinite(e.primera_aparicion_segundo) ? mmss(e.primera_aparicion_segundo) : '[ND]'
      return {
        id: tx.rename(i, e.id),
        primera_aparicion: first,
        descripcion_fisica: tx.rename(i, e.descripcion_fisica),
        identificacion: tx.rename(i, e.identificacion),
        apariciones: first === '[ND]' ? '[ND]' : `desde ${first} (tramo ${labels[i]}); las siguientes, en 9.5`,
      }
    }),
  )

  // ── Phase 3 ─────────────────────────────────────────────────────────────
  progress({ label: 'Registro V6.5: síntesis...', current: total + 1, total: total + 2 })
  // A synthesis saved before this check could lack a section and fail every retry.
  if (!checkpoint.phase3 || phase3Problem(checkpoint.phase3)) {
    // Screen time, the opening and the close from the timeline itself: without
    // 9.5 the synthesis estimated them (P1 "~6.8 %" against 4.3 % in 9.5).
    const lastShot = shots[shots.length - 1]!
    const entryLine = (e: (typeof timeline)[number]) =>
      `[${mmss(e.start_seconds)}–${mmss(e.end_seconds)}] VIS: ${e.vis} | AUD: ${e.aud} | TXT: ${e.txt} | CAM: ${e.cam}${e.cortes.length ? ` | ${e.cortes.join('; ')}` : ''}`
    const closing = timeline.filter((e) => e.end_seconds > Math.max(lastShot.start, duration - 6))
    const record = [
      `FASE 1:\n${JSON.stringify({ ficha: p1.ficha, triaje: p1.triaje, procedencia: p1.procedencia, entidades: p1.entidades })}`,
      `MAPA DE PLANOS (9.4, escrito por los tramos):\n${p1.planos.map((p) => `${p.id} ${p.inicio}–${p.fin} (${p.duracion}): ${p.escala} · ${p.angulo} · ${p.movimiento} · ${p.entrada_salida}`).join('\n')}`,
      `ESCENAS (resumen observacional por tramos, ≤120 s):\n${escenas.map((s) => `${mmss(s.start_seconds)}–${mmss(s.end_seconds)} ${s.title}: ${s.description} | AUD: ${s.audio_description}`).join('\n')}`,
      `CAMBIOS DE ESTADO (9.8):\n${cambios.map((c) => `${c.timestamp} ANTES: ${c.antes} / TRANSICIÓN: ${c.transicion} / DESPUÉS: ${c.despues} / ND: ${c.no_determinable}`).join('\n') || '(ninguno)'}`,
      `TEXTOS EN PANTALLA (9.7):\n${tx.list.map((t) => `${t.id} ${t.aparece}–${t.desaparece} [${t.tipo}] "${t.contenido}"`).join('\n') || 'No aparece texto en pantalla.'}`,
      `CORTES MEDIDOS [META]: ${input.cuts.map((c) => mmss(c.time)).join(', ') || 'ninguno'}`,
      `SILENCIOS MEDIDOS [META]: ${silences.map((s) => `${mmss(s.start)}–${mmss(s.end)}`).join(', ') || 'ninguno'}`,
      `TRANSCRIPCIÓN (9.6) [META]:\n${transcriptText}`,
      `SEGUNDOS EN 9.5 POR ENTIDAD (contados por la app: duración de las entradas cuyo VIS la nombra; base de los % de tiempo visible):\n${entitySeconds(timeline, meta.durationSeconds) || '(ninguna)'}`,
      `9.5 DE LA APERTURA (00:00–00:04):\n${timeline.filter((e) => e.start_seconds < 4).map(entryLine).join('\n')}`,
      `9.5 DEL CIERRE (último plano, ${lastShot.id}, ${mmss(lastShot.start)}–${mmss(lastShot.end)}${closing[0] && closing[0].start_seconds > lastShot.start + 0.05 ? `; sus últimos segundos` : ''}):\n${closing.map(entryLine).join('\n')}`,
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
      (t) => {
        const value = parseJson<Phase3Out>(t)
        const problem = phase3Problem(value)
        if (problem) throw new Error(`síntesis incompleta: ${problem}`)
        return value
      },
    )
    checkpoint.phase3 = value
    input.save()
  }
  const recreation = recreationByShot(shots, outs, tx.rename)
  const p3 = { ...checkpoint.phase3, recreacion: checkpoint.phase3.recreacion?.length ? checkpoint.phase3.recreacion : recreation.list }
  windowLimits.push(...recreation.missing)

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
      elements: [],
    },
    windowEntities,
    bloques: leaves.map((w, i) => `tramo ${labels[i]}: ${mmss(w.start)}–${mmss(w.end)}`).join(' / '),
    measuredTranscript: true,
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
 * Seconds of 9.5 whose VIS names each entity, most first, as "P1: 38.5 s
 * (4.3 %)". A starred mention (P1*, identity not confirmed after a cut) is
 * counted with its entity and also given apart.
 */
export function entitySeconds(timeline: Array<Pick<Entry, 'start_seconds' | 'end_seconds' | 'vis'>>, duration: number): string {
  const seconds = new Map<string, { all: number; starred: number }>()
  for (const e of timeline) {
    const named = new Map<string, boolean>()
    for (const m of (e.vis ?? '').matchAll(/\b([PAOIECF]\d+(?:-t\d+[a-z]*)?)(\*?)/g)) named.set(m[1]!, (named.get(m[1]!) ?? true) && m[2] === '*')
    for (const [id, starredOnly] of named) {
      const s = seconds.get(id) ?? { all: 0, starred: 0 }
      s.all += e.end_seconds - e.start_seconds
      if (starredOnly) s.starred += e.end_seconds - e.start_seconds
      seconds.set(id, s)
    }
  }
  return [...seconds]
    .sort((a, b) => b[1].all - a[1].all)
    .map(([id, s]) => `${id}: ${s.all.toFixed(1)} s (${((100 * s.all) / duration).toFixed(1)} %)${s.starred ? `, de ellos ${s.starred.toFixed(1)} s solo como ${id}*` : ''}`)
    .join('\n')
}

/**
 * The entries the window must deliver, spelled out: told only "one per
 * second", the model summarised ten-second stretches.
 */
// Always one entry per second. Allowing identical seconds to be chained on
// videos over a minute (as the protocol permits) had every model on a 4-minute
// video on 18 Oct 2026 group changing seconds too, and each rejected reply
// cost a request and a minute.
function secondsPlan(w: V6Window): string {
  const first = Math.floor(w.start)
  const last = Math.ceil(w.end)
  const n = last - first
  return `La línea de tiempo de este tramo son ${n} segundos: entradas ${mmss(Math.max(first, w.start))}–${mmss(Math.min(first + 1, w.end))}, ${mmss(first + 1)}–${mmss(first + 2)}, … hasta la que termina en ${mmss(w.end)}; una entrada por segundo, sin encadenar (un segundo sin cambios es una entrada corta con sin_cambios=true). Una entrada de varios segundos con cambios dentro se rechaza.`
}

/**
 * What is missing from a synthesis, or '' when the renderer can use it. A
 * reply without "gramatica" (Claude ignores the schema; the 400 retry sends
 * none) was checkpointed and then crashed every retry without a request.
 */
export function phase3Problem(v: unknown): string {
  const o = v as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return 'no es un objeto'
  if (typeof o.resumen_corto !== 'string') return 'falta resumen_corto'
  if (!o.gramatica || typeof o.gramatica !== 'object') return 'falta gramatica'
  if (!o.plan_rodaje || typeof o.plan_rodaje !== 'object') return 'falta plan_rodaje'
  for (const k of ['temas', 'funcion', 'interpretacion', 'patrones', 'limites']) if (!Array.isArray(o[k])) return `falta ${k}`
  return ''
}

/** "PL12", "pl 12" or "PL12 (00:31–00:33)" → "PL12". */
const shotId = (id: string) => /PL\s*(\d+)/i.exec(id ?? '')?.[1] ? `PL${/PL\s*(\d+)/i.exec(id)![1]}` : (id ?? '').trim()

/** Every string field passed through `f` (the TX renumbering of its window). */
function renameAll<T extends Record<string, unknown>>(o: T, f: (s: string) => string): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? f(v) : v])) as T
}

/** 9.13 in shot order from the windows; a shot no window described gets [ND] and a line in 9.14. */
export function recreationByShot(
  shots: Shot[],
  outs: Array<Pick<WindowOut, 'recreacion'>>,
  rename: (window: number, s: string) => string = (_w, s) => s,
): { list: V6Phase3['recreacion']; missing: string[] } {
  const byId = new Map<string, Omit<V6Phase3['recreacion'][number], 'duracion'>>()
  outs.forEach((o, i) => {
    for (const r of o.recreacion ?? []) {
      const id = shotId(r.plano)
      if (!byId.has(id)) byId.set(id, renameAll({ ...r, plano: id }, (s) => rename(i, s)))
    }
  })
  const missing: string[] = []
  const nd = '[ND]'
  const list = shots.map((s) => {
    const r = byId.get(s.id)
    if (!r) missing.push(`[${mmss(s.start)}–${mmss(s.end)}] ${s.id}: ningún tramo escribió su ficha de recreación [ND].`)
    return {
      plano: s.id,
      duracion: `${(s.end - s.start).toFixed(2)} s [META]`,
      sujetos_estado_inicial: r?.sujetos_estado_inicial ?? nd,
      accion: r?.accion ?? nd,
      camara: r?.camara ?? nd,
      luz_entorno: r?.luz_entorno ?? nd,
      audio: r?.audio ?? nd,
      texto: r?.texto ?? nd,
      estado_final: r?.estado_final ?? nd,
    }
  })
  return { list, missing }
}

const windowKey = (w: V6Window) => `v6-${w.start.toFixed(3)}-${w.end.toFixed(3)}-${w.frames.length}`

/**
 * Phase 1 sees one frame per shot and no sound, so each VOZ#/S# gets its
 * acoustic description from the windows that heard it: the first window's
 * description, plus any other window's when it differs (tramo-labelled).
 */
export function withVoices(p1: V6Phase1, outs: Array<Pick<WindowOut, 'voces'>>, labels: string[] = outs.map((_o, i) => String(i + 1))): void {
  const heard = new Map<string, string[]>()
  outs.forEach((o, i) => {
    for (const v of o.voces ?? []) {
      const id = v.id.replace(/^VOZ\s+/i, 'VOZ').trim()
      if (!id || !v.descripcion_acustica?.trim()) continue
      const list = heard.get(id) ?? []
      if (!list.some((d) => d.endsWith(v.descripcion_acustica.trim()))) list.push(list.length ? `[tramo ${labels[i]}] ${v.descripcion_acustica.trim()}` : v.descripcion_acustica.trim())
      heard.set(id, list)
    }
  })
  for (const e of p1.entidades) {
    const d = heard.get(e.id)
    if (d) {
      e.descripcion_fisica = d.join(' / ')
      heard.delete(e.id)
    }
  }
  for (const [id, d] of heard) {
    p1.entidades.push({ id, primera_aparicion: '[ND]', descripcion_fisica: d.join(' / '), identificacion: 'NO DETERMINABLE', apariciones: '[ND]' })
  }
}

/** Measured facts win over the model: shot times and counts, the technical sheet, the access, the duration band and the frame shape. */
export function fixPhase1(p1: V6Phase1, shots: Shot[], meta: VideoMeta, frames: Frame[], hasAudio: boolean): V6Phase1 {
  // Later entries win: the windows' descriptions over a phase 1 from an older checkpoint.
  const byId = new Map((p1.planos ?? []).map((p) => [shotId(p.id), p]))
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
  // Phase 1 sees one frame per shot and no sound, so it misdescribed its own
  // access, and wrote "16:9" where the protocol has vertical/horizontal/cuadrado.
  const d = meta.durationSeconds
  const ratio = meta.width && meta.height ? meta.width / meta.height : null
  const shape = ratio === null ? null : ratio > 1.05 ? 'horizontal' : ratio < 0.95 ? 'vertical' : 'cuadrado'
  return {
    ...p1,
    ficha: { ...p1.ficha, duracion: `${mmss(meta.durationSeconds)} [META]`, duracion_origen: 'metadata', planos: shots.length, relacion_aspecto: shape ?? p1.ficha?.relacion_aspecto ?? '[ND]' },
    triaje: {
      ...p1.triaje,
      eje0_fuente: `video; acceso muestreado: imagen muestreada (todos los cambios de escena y al menos un fotograma cada 0,5–1 s)${hasAudio ? ' y sonido directo continuo' : '; sin pista de audio'}; alcance: video completo [META]`,
      eje6_duracion: `${d < 10 ? '<10 s' : d < 60 ? '10–60 s' : d < 600 ? '1–10 min' : '>10 min'} (${mmss(d)}) [META]`,
    },
    ficha_tecnica: {
      duracion_archivo: `${meta.durationSeconds} s (${mmss(meta.durationSeconds)}) [META]`,
      ultimo_contenido_observable: `${mmss(last)} (último fotograma muestreado)`,
      numero_planos: shots.length,
      duracion_media_plano: `${(meta.durationSeconds / shots.length).toFixed(2)} s [META]`,
      plano_mas_largo: `${longest.id} (${longest.d.toFixed(2)} s) [META]`,
      plano_mas_corto: `${shortest.id} (${shortest.d.toFixed(2)} s) [META]`,
    },
    planos,
    // A copy: withVoices fills it in, and the checkpoint keeps phase 1 as answered.
    entidades: (p1.entidades ?? []).map((e) => ({ ...e })),
    textos_pantalla: [],
  }
}

/** TX ids of each window (TX1-t3, or a bare TX1) become TX1, TX2... in order of appearance; references follow, window by window. */
export function renumberTexts(
  outs: Array<Pick<WindowOut, 'textos_pantalla'>>,
  /** End time of each window: a text still on screen there continues in the next one. */
  borders: number[] = [],
): {
  list: V6Phase1['textos_pantalla']
  rename: (window: number, s: string) => string
} {
  const all = outs.flatMap((o, i) => (o.textos_pantalla ?? []).map((t) => ({ ...t, window: i })))
  const seconds = (s: string) => {
    const t = clockSeconds(s)
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
  }
  all.sort((a, b) => seconds(a.aparece) - seconds(b.aparece) || a.window - b.window)
  // A text on screen across a window border is one text, not two that
  // "appear" and "disappear" at the border (a watermark became one TX per
  // window; a caption was cut in two at 09:49.68).
  const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  const near = (time: number, border: number) => !Number.isFinite(time) || Math.abs(time - border) <= 1
  const root = new Map<(typeof all)[number], (typeof all)[number]>()
  for (const t of all) {
    const border = borders[t.window - 1]
    if (border === undefined || !near(seconds(t.aparece), border)) continue
    const prev = all.find((p) => p.window === t.window - 1 && norm(p.contenido) === norm(t.contenido) && near(seconds(p.desaparece), border))
    if (prev) root.set(t, root.get(prev) ?? prev)
  }
  const map = new Map<string, string>()
  const kept = all.filter((t) => !root.has(t)).map((t, i) => ({ ...t, id: `TX${i + 1}`, source: t }))
  for (const k of kept) map.set(`${k.window}:${k.source.id}`, k.id)
  for (const [t, first] of root) {
    const k = kept.find((x) => x.source === first)!
    map.set(`${t.window}:${t.id}`, k.id)
    k.desaparece = t.desaparece
    const a = seconds(k.aparece)
    const b = seconds(t.desaparece)
    if (Number.isFinite(a) && Number.isFinite(b)) k.duracion = `${(b - a).toFixed(1)} s`
  }
  const list = kept.map(({ source: _s, ...t }) => t)
  // One pass with a callback, so TX1 -> TX5 never chains into TX5 -> TX9.
  const rename = (window: number, s: string) =>
    s ? s.replace(/\bTX\d+(?:-t\d+[a-z]*)?\b/g, (old) => map.get(`${window}:${old}`) ?? old) : s
  return { list: list.map(({ window: _w, ...t }) => t), rename }
}

export { PROTOCOL_VERSION }
