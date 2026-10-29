import { getMusicTrack, resolveDataPath } from '@cva/memory-engine'
import { serveFile } from '../../../../../lib/serve-file'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  const row = getMusicTrack(id)
  if (!row) return new Response('No existe esa pieza.', { status: 404 })
  return serveFile(request, resolveDataPath(row.stored_path), row.mime, 'No se encontró el archivo de audio.')
}

export const HEAD = GET
