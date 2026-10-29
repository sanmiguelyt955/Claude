import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { deleteMusicTrack } from '@cva/memory-engine'
import { MUSIC_DIR } from '../../../../lib/music'

export const runtime = 'nodejs'

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await context.params
  const row = deleteMusicTrack(id)
  if (!row) return NextResponse.json({ error: 'No existe esa pieza.' }, { status: 404 })
  // The folder is named by the row's own id, never by anything the request sent.
  fs.rmSync(path.join(MUSIC_DIR, row.id), { recursive: true, force: true })
  return NextResponse.json({ ok: true })
}
