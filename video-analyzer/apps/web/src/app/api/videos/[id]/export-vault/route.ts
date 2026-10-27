import { NextResponse } from 'next/server'
import { getVideo } from '@cva/memory-engine'
import { exportVideoToMemoria, exportVideoToVault, getMemoriaConfig, getVaultPath } from '@cva/vault-export'

export const runtime = 'nodejs'

/**
 * Writes the video's complete analysis as one self-contained note: to Memoria
 * (the cloud notes app) when MEMORIA_URL and MEMORIA_KEY are set, and to the
 * local Obsidian vault when OBSIDIAN_VAULT_PATH is. No job queue: a file write
 * or one request, with no Gemini call behind it.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  if (!getVideo(id)) return NextResponse.json({ error: 'El video no existe.' }, { status: 404 })
  const toMemoria = Boolean(getMemoriaConfig())
  const toVault = Boolean(getVaultPath()) || !toMemoria
  try {
    const memoria = toMemoria ? await exportVideoToMemoria(id) : null
    const vault = toVault ? await exportVideoToVault(id) : null
    return NextResponse.json({ ...(vault ?? {}), noteName: memoria?.noteName ?? vault?.noteName, memoria })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
