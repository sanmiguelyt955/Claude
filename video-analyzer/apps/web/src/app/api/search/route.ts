import { NextResponse } from 'next/server'
import { searchLibrary, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@cva/memory-engine'
import { embedTexts } from '@cva/ai-router'

export const runtime = 'nodejs'

/**
 * Library-wide search (PROJECT.md §28 bloque 8) — every video's memory in
 * one query, not scoped to a single video like /api/videos/[id]/search.
 * Uses the embeddings model's own generous quota (100 RPM / 1000 RPD),
 * entirely separate from the 20 RPD video/skill budget, so this is safe to
 * use freely.
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

export async function GET(request: Request): Promise<NextResponse> {
  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Falta el parametro "q".' }, { status: 400 })

  const { embedding, notice } = await embedQuery(q)
  const results = searchLibrary(embedding, q, 15)

  return NextResponse.json({ query: q, results, semantic: embedding !== null, notice })
}
