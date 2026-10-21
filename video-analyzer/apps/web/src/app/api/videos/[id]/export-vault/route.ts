import { NextResponse } from 'next/server'
import { getVideo } from '@cva/memory-engine'
import { exportVideoToVault } from '@cva/vault-export'

export const runtime = 'nodejs'

/**
 * Writes the video's complete analysis into the Obsidian vault as one
 * self-contained note. Synchronous (no job queue): it is a local file write
 * with no Gemini call behind it, so it finishes in milliseconds.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  if (!getVideo(id)) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  try {
    const result = await exportVideoToVault(id)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
