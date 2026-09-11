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
export async function GET(request: Request): Promise<NextResponse> {
  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Falta el parametro "q".' }, { status: 400 })

  const [{ embedding }] = await embedTexts([q], EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, 'RETRIEVAL_QUERY')
  const results = searchLibrary(embedding, q, 15)

  return NextResponse.json({ query: q, results })
}
