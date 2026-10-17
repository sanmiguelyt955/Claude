import { NextResponse } from 'next/server'
import {
  getVideo,
  getVideoSummary,
  listScenes,
  listTranscriptChunks,
  listVideoElements,
  listChatMessages,
  addChatMessage,
  clearChatMessages,
} from '@cva/memory-engine'
import { askVideo, type ChatVideo } from '@cva/perception/chat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_QUESTION_CHARS = 2000

type Params = { params: Promise<{ id: string }> }

function chatVideo(id: string, title: string, durationSeconds: number | null): ChatVideo {
  const summary = getVideoSummary(id)
  let topics: string[] = []
  try {
    topics = summary ? (JSON.parse(summary.topics_json) as string[]) : []
  } catch {
    topics = []
  }
  return {
    title,
    durationSeconds,
    summary: summary ? { short: summary.short_summary, full: summary.full_summary, topics } : null,
    scenes: listScenes(id).map((s) => ({
      start: s.start_seconds,
      end: s.end_seconds,
      title: s.title,
      description: s.description,
      audio: s.audio_description,
    })),
    transcript: listTranscriptChunks(id).map((t) => ({
      start: t.start_seconds,
      end: t.end_seconds,
      speaker: t.speaker,
      text: t.text,
    })),
    elements: listVideoElements(id).map((e) => ({
      kind: e.kind,
      label: e.label,
      detail: e.detail,
      start: e.start_seconds,
      end: e.end_seconds,
    })),
  }
}

/** The conversation so far. */
export async function GET(_request: Request, context: Params): Promise<NextResponse> {
  const { id } = await context.params
  if (!getVideo(id)) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  return NextResponse.json({ messages: listChatMessages(id) })
}

/**
 * Asks a question about the video. Answers come from the stored analysis
 * (scenes, transcript, elements), so the video is not re-processed and the
 * daily video quota is not spent. Only a successful answer is saved, so a
 * failed attempt leaves the conversation as it was.
 */
export async function POST(request: Request, context: Params): Promise<NextResponse> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  if (video.status !== 'ready') {
    return NextResponse.json({ error: 'El chat está disponible cuando el video termina de analizarse.' }, { status: 409 })
  }

  const body = (await request.json().catch(() => ({}))) as { question?: unknown }
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question) return NextResponse.json({ error: 'Escribe una pregunta.' }, { status: 400 })
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: `La pregunta es muy larga (máx. ${MAX_QUESTION_CHARS} caracteres).` }, { status: 400 })
  }

  const history = listChatMessages(id).map((m) => ({ role: m.role, text: m.text }))
  try {
    const { answer, provider } = await askVideo({
      video: chatVideo(id, video.title, video.duration_seconds),
      question,
      history,
      log: (msg) => console.log(`[chat] ${id}: ${msg}`),
    })
    addChatMessage({ videoId: id, role: 'user', text: question })
    addChatMessage({ videoId: id, role: 'assistant', text: answer, provider })
    return NextResponse.json({ messages: listChatMessages(id) })
  } catch (error) {
    const message = (error as Error).message
    console.error(`[chat] ${id}: ${message}`)
    if (/Ningún proveedor de visión tiene clave/.test(message)) {
      return NextResponse.json(
        { error: 'El chat necesita una clave de IA: configura GEMINI_API_KEY o ANTHROPIC_API_KEY en .env.local.' },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { error: `No se pudo responder ahora (${message.slice(0, 200)}). Inténtalo de nuevo en un momento.` },
      { status: 503 },
    )
  }
}

/** Starts the conversation over. */
export async function DELETE(_request: Request, context: Params): Promise<NextResponse> {
  const { id } = await context.params
  if (!getVideo(id)) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  return NextResponse.json({ deleted: clearChatMessages(id) })
}
