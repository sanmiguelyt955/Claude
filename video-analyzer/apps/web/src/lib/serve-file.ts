import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

/**
 * The file read a chunk at a time, only as the player asks for it.
 * Readable.toWeb kept pushing chunks after the player hung up (seeking, or
 * leaving the page), and Next logged "Controller is already closed" as an
 * uncaught exception each time.
 */
function fileStream(file: string, opts?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const chunks = createReadStream(file, opts)[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await chunks.next()
      if (done) controller.close()
      else controller.enqueue(new Uint8Array(value as Buffer))
    },
    async cancel() {
      // Ends the iterator, which destroys the stream and closes the file.
      await chunks.return?.()
    },
  })
}

/**
 * A local file as an HTTP response that honours Range requests, so players can
 * seek. `type` is the Content-Type; a missing file answers 404.
 */
export async function serveFile(request: Request, file: string, type: string, missing: string): Promise<Response> {
  let size: number
  try {
    size = (await stat(file)).size
  } catch {
    return new Response(missing, { status: 404 })
  }

  // HEAD gets the headers only: a stream opened for it was never read nor
  // closed, leaking one open file per request.
  const head = request.method === 'HEAD'
  const stream = (opts?: { start: number; end: number }) => (head ? null : fileStream(file, opts))
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!range) {
    const body = stream()
    return new Response(body, { headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' } })
  }
  // "bytes=-500" means the last 500 bytes; "bytes=100-" means from 100 to the end.
  let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
  let end = range[1] && range[2] ? Number(range[2]) : size - 1
  end = Math.min(end, size - 1)
  if (!range[1] && !range[2]) start = 0
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
  }
  const body = stream({ start, end })
  return new Response(body, {
    status: 206,
    headers: {
      'content-type': type,
      'content-length': String(end - start + 1),
      'content-range': `bytes ${start}-${end}/${size}`,
      'accept-ranges': 'bytes',
    },
  })
}
