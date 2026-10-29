import { NextResponse } from 'next/server'
import { listMusicTracks } from '@cva/memory-engine'
import { readJsonObject, stringField } from '../../../lib/json-body'
import { MusicError, saveTrackFromSource, savedJson } from '../../../lib/music'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The saved music library. */
export function GET(): NextResponse {
  return NextResponse.json({ tracks: listMusicTracks().map(savedJson) })
}

/** Saves one found track: { source, sourceId }. Downloads it and keeps its licence. */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonObject(request)
  const source = stringField(body, 'source')
  const sourceId = stringField(body, 'sourceId')
  if (!source || !sourceId) return NextResponse.json({ error: 'Faltan "source" y "sourceId".' }, { status: 400 })
  try {
    return NextResponse.json({ track: savedJson(await saveTrackFromSource(source, sourceId)) }, { status: 201 })
  } catch (e) {
    if (e instanceof MusicError) return NextResponse.json({ error: e.message }, { status: e.status })
    throw e
  }
}
