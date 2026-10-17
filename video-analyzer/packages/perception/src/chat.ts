import { describeWithFallback } from './chain.js'
import { claude } from './providers/claude.js'
import { gemini } from './providers/gemini.js'
import type { VisionProvider } from './providers/types.js'

/** What the chat knows about a video: its stored analysis, nothing re-processed. */
export type ChatVideo = {
  title: string
  durationSeconds: number | null
  summary: { short: string; full: string; topics: string[] } | null
  scenes: Array<{ start: number; end: number; title: string | null; description: string; audio: string | null }>
  transcript: Array<{ start: number; end: number; speaker: string | null; text: string }>
  elements: Array<{ kind: string; label: string; detail: string | null; start: number; end: number | null }>
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

type Line = { start: number; text: string }

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
  // Stable sort: at the same second, scene before speech before elements.
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
 * The video as one timestamped timeline (scenes, speech and elements merged
 * in time order) under a header with title, duration and summary. When the
 * timeline does not fit in `maxChars`, it keeps the lines that share words
 * with the question plus their neighbours (the answer is usually around
 * them), then fills the rest of the budget with lines spread evenly over the
 * video, always in time order so the model still reads a coherent timeline.
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
export async function askVideo(input: {
  video: ChatVideo
  question: string
  history?: ChatTurn[]
  providers?: VisionProvider[]
  log?: (msg: string) => void
}): Promise<{ answer: string; provider: string }> {
  const { value, provider } = await describeWithFallback(
    input.providers ?? [gemini, claude],
    { frames: [], instruction: buildInstruction(input.video, input.history ?? [], input.question), json: false },
    {
      log: input.log,
      parse: (text) => {
        const answer = text.trim()
        if (!answer) throw new Error('respuesta vacía')
        return answer
      },
    },
  )
  return { answer: value, provider }
}
