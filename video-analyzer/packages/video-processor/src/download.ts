import { createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/**
 * Streams a remote URL straight to disk — the response body is a web
 * ReadableStream piped chunk-by-chunk, so a multi-GB video never sits fully
 * in process memory the way a buffered download would.
 *
 * Not used for YouTube URLs: those are handed to Gemini directly in the
 * analysis phase (bloque 3) without a local download (see formats.ts).
 */
export async function downloadToFile(
  url: string,
  destPath: string,
): Promise<{ sizeBytes: number }> {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`No se pudo descargar la URL (HTTP ${response.status}).`)
  }

  await pipeline(Readable.fromWeb(response.body as import('stream/web').ReadableStream), createWriteStream(destPath))

  const { size } = await stat(destPath)
  return { sizeBytes: size }
}
