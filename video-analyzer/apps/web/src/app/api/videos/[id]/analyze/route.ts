import { NextResponse } from 'next/server'
import { getVideo } from '@cva/memory-engine'

export const runtime = 'nodejs'

/**
 * Wired up now so the "Analizar" button in the UI has somewhere real to
 * call, but the Gemini pipeline itself (PROJECT.md §8: first_pass, deep_pass,
 * skill_detection) is bloque 3. Returns 501 with a clear explanation instead
 * of pretending to start an analysis that doesn't exist yet — and instead of
 * leaving the button dead with no backend at all.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const video = getVideo(id)
  if (!video) {
    return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  }
  if (video.status !== 'queued') {
    return NextResponse.json(
      { error: `El video debe estar "listo para analizar" (esta en "${video.status}").` },
      { status: 409 },
    )
  }

  return NextResponse.json(
    { error: 'El motor de analisis con Gemini se conecta en el bloque 3. Este video ya quedo listo para ese paso.' },
    { status: 501 },
  )
}
