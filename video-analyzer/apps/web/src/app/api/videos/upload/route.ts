import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import Busboy from 'busboy'
import { NextResponse } from 'next/server'
import { createVideo, enqueueJob, toDataRelativePath, VIDEOS_DIR } from '@cva/memory-engine'
import { isSupportedExtension, SUPPORTED_EXTENSIONS } from '@cva/video-processor'

// Busboy needs Node's fs/stream APIs — the Edge runtime does not have them.
export const runtime = 'nodejs'

type ParsedUpload = { fieldTitle?: string; savedPath: string; originalFilename: string }

/**
 * Parses the multipart body with busboy instead of `request.formData()`.
 * formData() would buffer the whole file into memory before we ever see it;
 * busboy streams each chunk straight to disk, which is what makes a
 * multi-hundred-MB (or, per PROJECT.md §17, up to 20GB on a paid Gemini
 * tier) upload survive without blowing up the Node process.
 */
async function parseMultipart(request: Request, videoId: string): Promise<ParsedUpload> {
  const contentType = request.headers.get('content-type')
  if (!contentType) throw new Error('Falta el header Content-Type.')
  if (!request.body) throw new Error('La peticion no tiene cuerpo.')

  const destDir = path.join(VIDEOS_DIR, videoId)
  await mkdir(destDir, { recursive: true })

  return new Promise<ParsedUpload>((resolve, reject) => {
    const busboy = Busboy({ headers: { 'content-type': contentType }, limits: { files: 1 } })

    let fieldTitle: string | undefined
    let savedPath: string | undefined
    let originalFilename: string | undefined
    let fileWritePromise: Promise<void> | undefined
    let rejected = false

    const fail = (error: Error) => {
      if (rejected) return
      rejected = true
      reject(error)
    }

    busboy.on('field', (name, value) => {
      if (name === 'title') fieldTitle = value
    })

    busboy.on('file', (_name, fileStream, info) => {
      const ext = path.extname(info.filename).toLowerCase()
      if (!isSupportedExtension(ext)) {
        fileStream.resume() // drain so busboy can finish instead of hanging
        fail(
          new Error(
            `Formato no soportado (${ext || 'sin extension'}). Formatos aceptados: ` +
              SUPPORTED_EXTENSIONS.join(', '),
          ),
        )
        return
      }
      originalFilename = info.filename
      savedPath = path.join(destDir, `source${ext}`)
      const writeStream = createWriteStream(savedPath)
      fileWritePromise = finished(fileStream.pipe(writeStream)).catch(fail)
    })

    busboy.on('error', fail)

    busboy.on('finish', () => {
      void (async () => {
        try {
          await fileWritePromise
          if (rejected) return
          if (!savedPath || !originalFilename) {
            fail(new Error('No se recibio ningun archivo en el campo "file".'))
            return
          }
          resolve({ fieldTitle, savedPath, originalFilename })
        } catch (error) {
          fail(error as Error)
        }
      })()
    })

    Readable.fromWeb(request.body as import('stream/web').ReadableStream).pipe(busboy)
  })
}

export async function POST(request: Request): Promise<NextResponse> {
  const videoId = randomUUID()

  let parsed: ParsedUpload
  try {
    parsed = await parseMultipart(request, videoId)
  } catch (error) {
    // Best-effort cleanup of whatever partial folder/file got created.
    await rm(path.join(VIDEOS_DIR, videoId), { recursive: true, force: true }).catch(() => {})
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  const video = createVideo({
    id: videoId,
    title: parsed.fieldTitle?.trim() || parsed.originalFilename,
    sourceKind: 'file',
    originalFilename: parsed.originalFilename,
    storedPath: toDataRelativePath(parsed.savedPath),
  })

  const job = enqueueJob({ type: 'probe', videoId: video.id })

  return NextResponse.json({ video, jobId: job.id }, { status: 202 })
}
