import { NextResponse } from 'next/server'
import { searchAll } from '@cva/music'
import type { SourceId } from '@cva/music'
import { musicSources, trackJson } from '../../../../lib/music'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Searches every free-music source at once. A source that fails is listed in `problems`; the rest still answer. */
export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams
  const q = params.get('q')?.trim()
  if (!q) return NextResponse.json({ error: 'Falta el parametro "q".' }, { status: 400 })
  const sources = musicSources()
  const only = params.get('sources')?.split(',').filter((s) => sources.some((x) => x.id === s)) as SourceId[] | undefined
  const result = await searchAll(sources, q, { only: only?.length ? only : undefined, signal: request.signal })
  return NextResponse.json({ query: q, tracks: result.tracks.map(trackJson), problems: result.problems })
}
