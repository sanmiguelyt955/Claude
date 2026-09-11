import { NextResponse } from 'next/server'
import { getVideo, searchMemoryChunks, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@cva/memory-engine'
import { embedTexts } from '@cva/ai-router'

export const runtime = 'nodejs'

/**
 * Minimal proof that bloque 4's index is actually retrievable, not just
 * written — the full biblioteca search UI (multi-video, keyword + semantic
 * blended) is bloque 8. This scopes to one video and vector-only.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })

  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Falta el parametro "q".' }, { status: 400 })

  const [{ embedding }] = await embedTexts([q], EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, 'RETRIEVAL_QUERY')
  const results = searchMemoryChunks(id, embedding, 8)

  return NextResponse.json({ query: q, results })
}
