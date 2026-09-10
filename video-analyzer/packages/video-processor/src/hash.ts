import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

/**
 * Streams the file through sha256 rather than reading it into memory —
 * matters here because source videos can be gigabytes (PROJECT.md §17).
 * Used to detect re-uploads of the same video (videos.content_hash).
 */
export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}
