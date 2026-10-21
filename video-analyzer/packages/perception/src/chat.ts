import { describeWithFallback, type Attempt } from './chain.js'
import { claude } from './providers/claude.js'
import { geminiProviders } from './providers/gemini.js'
import type { VisionProvider } from './providers/types.js'

/** What the chat knows about a video: its stored analysis, nothing re-processed. */
export type ChatVideo = {
  title: string
  durationSeconds: number | null
  summary: { short: string; full: string; topics: string[] } | null
  scenes: Array<{ start: number; end: number; title: string | null; description: string; audio: string | null }>
  transcript: Array<{ start: number; end: number; speaker: string | null; text: string }>
  elements: Array<{ kind: string; label: string; detail: string | null; start: number; end: number | null }>
  /**
   * The Protocolo V6.5 record (Markdown), when the analysis wrote one. Its
   * second-by-second timeline (9.5) and its list of on-screen texts (9.7)
   * hold what the scenes summarize away: a number on a train, a name on a
   * monitor.
   */
  record?: string | null
}

export type ChatTurn = { role: 'user' | 'assistant'; text: string }

/** Roughly 25-30k tokens: room for long videos while keeping requests cheap. */
export const MAX_CONTEXT_CHARS = 100_000
const HISTORY_TURNS = 10

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const ELEMENT_LABELS: Record<string, string> = {
  object: 'OBJETO',
  on_screen_text: 'TEXTO EN PANTALLA',
  action: 'ACCIÓN',
  person: 'PERSONA',
  relation: 'RELACIÓN',
}

/** `pinned` lines are kept even when the timeline must be cut. */
type Line = { start: number; text: string; pinned?: boolean }

/** One section of the record ("9.5", "9.7"), without its heading; '' when absent. */
function recordSection(record: string, id: string): string {
  const at = record.search(new RegExp(`^## ${id.replace('.', '\\.')}\\b`, 'm'))
  if (at < 0) return ''
  const body = record.slice(record.indexOf('\n', at) + 1)
  const end = body.search(/^## /m)
  return end < 0 ? body : body.slice(0, end)
}

/** "01:42.50" (the record's mm:ss, minutes past 59 included) in seconds. */
const recordSeconds = (t: string) => {
  const [m, s] = t.split(':')
  return Number(m) * 60 + Number(s)
}
const RECORD_TIME = '(\\d+:\\d{2}(?:\\.\\d+)?)'

/**
 * The record's lines for the chat: each second of 9.5 as one DETALLE line
 * (VIS, AUD, TXT, CAM joined), and each text of 9.7 as one pinned TEXTO EN
 * PANTALLA line, since a question about a sign or a caption cannot be found
 * by its words (the answer is the text itself).
 */
function recordLines(record: string): Line[] {
  const lines: Line[] = []
  const second = new RegExp(`^\\[${RECORD_TIME}\\s*[–-]\\s*${RECORD_TIME}\\]\\s*`)
  for (const block of recordSection(record, '9.5').split(/\n\s*\n/)) {
    const m = second.exec(block.trim())
    if (!m) continue
    const [start, end] = [recordSeconds(m[1]!), recordSeconds(m[2]!)]
    const body = block.trim().slice(m[0].length).split('\n').map((l) => l.trim()).filter(Boolean).join(' · ')
    lines.push({ start, text: `[${formatTimestamp(start)}–${formatTimestamp(end)}] DETALLE: ${body}` })
  }
  for (const block of recordSection(record, '9.7').split(/\n(?=\*\*TX)/)) {
    const [head = '', ...rest] = block.trim().split('\n')
    const id = /^\*\*(TX[\w-]*)\*\*/.exec(head)?.[1]
    if (!id) continue
    const from = new RegExp(`aparece ${RECORD_TIME}`).exec(head)?.[1]
    const to = new RegExp(`desaparece ${RECORD_TIME}`).exec(head)?.[1]
    const start = from ? recordSeconds(from) : 0
    const range = !from ? 'sin hora' : to ? `${formatTimestamp(start)}–${formatTimestamp(recordSeconds(to))}` : formatTimestamp(start)
    const body = rest.map((l) => l.trim()).filter(Boolean).join(' · ')
    lines.push({ start, text: `[${range}] TEXTO EN PANTALLA ${id}: ${body}`, pinned: true })
  }
  return lines
}

function timelineLines(video: ChatVideo): Line[] {
  const lines: Line[] = []
  for (const s of video.scenes) {
    const audio = s.audio ? ` (audio: ${s.audio})` : ''
    lines.push({
      start: s.start,
      text: `[${formatTimestamp(s.start)}–${formatTimestamp(s.end)}] ESCENA${s.title ? ` "${s.title}"` : ''}: ${s.description}${audio}`,
    })
  }
  for (const t of video.transcript) {
    lines.push({
      start: t.start,
      text: `[${formatTimestamp(t.start)}–${formatTimestamp(t.end)}] VOZ${t.speaker ? ` (${t.speaker})` : ''}: ${t.text}`,
    })
  }
  for (const e of video.elements) {
    const range = e.end !== null ? `${formatTimestamp(e.start)}–${formatTimestamp(e.end)}` : formatTimestamp(e.start)
    lines.push({
      start: e.start,
      text: `[${range}] ${ELEMENT_LABELS[e.kind] ?? e.kind.toUpperCase()}: ${e.label}${e.detail ? ` — ${e.detail}` : ''}`,
    })
  }
  if (video.record) lines.push(...recordLines(video.record))
  // Stable sort: at the same second, scene before speech before elements before the record.
  return lines.sort((a, b) => a.start - b.start)
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Words of 3+ letters, accents folded, so "¿Cuánto cuesta?" matches "cuesta". */
function keywords(text: string): Set<string> {
  return new Set(normalize(text).match(/[a-z0-9ñ]{3,}/g) ?? [])
}

/**
 * The video as one timestamped timeline (scenes, speech, elements and the
 * record's lines merged in time order) under a header with title, duration and summary. When the
 * timeline does not fit in `maxChars`, it keeps the lines that share words
 * with the question plus their neighbours (the answer is usually around
 * them), then fills the rest of the budget with lines spread evenly over the
 * video, always in time order so the model still reads a coherent timeline.
 * Pinned lines (the record's on-screen texts) go in first, up to half the room.
 */
export function buildChatContext(video: ChatVideo, question: string, maxChars = MAX_CONTEXT_CHARS): string {
  const header = [
    `VIDEO: ${video.title}`,
    video.durationSeconds ? `DURACIÓN: ${formatTimestamp(video.durationSeconds)}` : null,
    video.summary ? `RESUMEN: ${video.summary.full || video.summary.short}` : null,
    video.summary?.topics.length ? `TEMAS: ${video.summary.topics.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const lines = timelineLines(video)
  const full = lines.map((l) => l.text).join('\n')
  if (header.length + full.length + 40 <= maxChars) {
    return `${header}\n\nLÍNEA DE TIEMPO:\n${full}`
  }

  const budget = Math.max(0, maxChars - header.length - 120)
  const keep = new Set<number>()
  let used = 0
  const take = (i: number) => {
    if (i < 0 || i >= lines.length || keep.has(i)) return true
    const cost = lines[i]!.text.length + 1
    if (used + cost > budget) return false
    keep.add(i)
    used += cost
    return true
  }

  for (let i = 0; i < lines.length; i++) if (lines[i]!.pinned && used + lines[i]!.text.length + 1 <= budget / 2) take(i)

  const wanted = keywords(question)
  const scored = lines
    .map((l, i) => ({ i, score: [...keywords(l.text)].filter((w) => wanted.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
  for (const { i } of scored) {
    if (!take(i)) break
    take(i - 1)
    take(i + 1)
  }

  // Spread the remaining budget evenly so the rest of the video is still seen.
  const remaining = lines.length - keep.size
  if (remaining > 0 && used < budget) {
    const avg = Math.max(1, Math.round(full.length / lines.length))
    const slots = Math.max(1, Math.floor((budget - used) / avg))
    const step = Math.max(1, Math.floor(lines.length / slots))
    for (let i = 0; i < lines.length; i += step) take(i)
  }

  const kept = [...keep].sort((a, b) => a - b).map((i) => lines[i]!.text)
  return `${header}\n\nLÍNEA DE TIEMPO (extracto: el video completo no cabe; se priorizó lo relacionado con la pregunta):\n${kept.join('\n')}`
}

function buildInstruction(video: ChatVideo, history: ChatTurn[], question: string): string {
  const past = history
    .slice(-HISTORY_TURNS)
    .map((t) => `${t.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${t.text}`)
    .join('\n')
  return [
    'Eres un asistente que responde preguntas sobre un video. Solo sabes lo que dice el análisis de abajo:',
    'lo que se ve (escenas, elementos, texto en pantalla) y lo que se escucha (VOZ), cada cosa con su marca de tiempo.',
    ...(video.record ? ['Las líneas DETALLE describen el video segundo a segundo: VIS es lo que se ve, AUD lo que se oye, TXT el texto en pantalla y CAM la cámara.'] : []),
    'Reglas:',
    '- Responde en español, claro y breve.',
    '- Cita el momento de cada dato entre corchetes, por ejemplo [0:14] o [1:02–1:10].',
    '- Si la respuesta no está en el análisis, dilo ("eso no aparece en el video"); no inventes.',
    '- Distingue lo que se dice (VOZ) de lo que se ve (ESCENA, OBJETO, TEXTO EN PANTALLA).',
    '',
    buildChatContext(video, question),
    past ? `\nCONVERSACIÓN ANTERIOR:\n${past}` : '',
    `\nPREGUNTA: ${question}`,
  ].join('\n')
}

/**
 * Answers a question about a video from its stored analysis, through the same
 * provider chain as the analysis (Gemini then Claude), so a 503 on one
 * provider falls over to the next instead of failing the chat.
 */
/**
 * A chat answer reads the stored analysis, a text task Flash-Lite does well:
 * it goes first (500 a day) and the two models with 20 a day stay for
 * analyses, which need them. Each question used to spend one of those 20.
 */
export function chatProviders(): VisionProvider[] {
  const all = geminiProviders()
  const lite = all.filter((p) => p.fallbackOnly).map((p) => ({ ...p, fallbackOnly: false }))
  return [...lite, ...all.filter((p) => !p.fallbackOnly), claude]
}

export async function askVideo(input: {
  video: ChatVideo
  question: string
  history?: ChatTurn[]
  providers?: VisionProvider[]
  log?: (msg: string) => void
  /** Every request sent, so the caller can count it in the daily quota. */
  onAttempt?: (attempt: Attempt) => void
}): Promise<{ answer: string; provider: string }> {
  const { value, provider } = await describeWithFallback(
    input.providers ?? chatProviders(),
    { frames: [], instruction: buildInstruction(input.video, input.history ?? [], input.question), json: false },
    {
      log: input.log,
      onAttempt: input.onAttempt,
      parse: (text) => {
        const answer = text.trim()
        if (!answer) throw new Error('respuesta vacía')
        return answer
      },
    },
  )
  return { answer: value, provider }
}
