import { NextResponse } from 'next/server'
import { getVideo, searchMemoryChunks, searchVideo, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@cva/memory-engine'
import { embedTexts } from '@cva/ai-router'

export const runtime = 'nodejs'

/**
 * Semantic search scoped to one video (vector-only) — kept alongside the
 * library-wide, keyword+semantic blended /api/search (bloque 8) since
 * narrowing to "just this video" is still useful from its detail page.
 */
/**
 * Embeds the query for semantic search. Returns null instead of throwing when
 * embeddings are unavailable (no GEMINI_API_KEY, 503 saturation, quota), so
 * the caller can fall back to keyword search instead of failing the request.
 */
async function embedQuery(q: string): Promise<{ embedding: number[] | null; notice: string | null }> {
  try {
    const [{ embedding }] = await embedTexts([q], EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, 'RETRIEVAL_QUERY')
    return { embedding, notice: null }
  } catch (error) {
    console.warn(`[search] búsqueda semántica no disponible: ${(error as Error).message}`)
    return {
      embedding: null,
      notice: 'Búsqueda solo por palabras clave: la búsqueda semántica (Gemini) no está disponible ahora.',
    }
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })

  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Escribe qué buscar.' }, { status: 400 })

  const { embedding, notice } = await embedQuery(q)
  // By meaning and by keyword together: pieces not embedded yet are still found.
  const results = searchVideo(id, embedding ? searchMemoryChunks(id, embedding, 8) : [], q, 8)

  return NextResponse.json({ query: q, results, semantic: embedding !== null, notice })
}
