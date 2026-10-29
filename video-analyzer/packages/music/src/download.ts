import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { creditText, verdict } from './license.js'
import type { Fetch, Track } from './types.js'

export const MAX_AUDIO_BYTES = 80 * 1024 * 1024

/** Kind of audio file by its first bytes, or null. The extension and Content-Type are not trusted. */
export function sniffAudio(head: Uint8Array): { ext: string; type: string } | null {
  const at = (i: number, s: string) => s.split('').every((c, k) => head[i + k] === c.charCodeAt(0))
  if (at(0, 'ID3') || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) return { ext: '.mp3', type: 'audio/mpeg' }
  if (at(0, 'OggS')) return { ext: '.ogg', type: 'audio/ogg' }
  if (at(0, 'fLaC')) return { ext: '.flac', type: 'audio/flac' }
  if (at(0, 'RIFF') && at(8, 'WAVE')) return { ext: '.wav', type: 'audio/wav' }
  if (at(4, 'ftyp')) return { ext: '.m4a', type: 'audio/mp4' }
  return null
}

/** Only plain https to a named host: no addresses, no local or internal names. */
export function assertPublicHttps(raw: string): URL {
  const u = new URL(raw)
  const host = u.hostname.toLowerCase()
  if (u.protocol !== 'https:') throw new Error('Solo se aceptan enlaces https.')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':')) {
    throw new Error('Dirección no permitida.')
  }
  return u
}

export type Downloaded = { file: string; bytes: number; mime: string }

/**
 * Downloads one track into `dir` as `<name>.<ext>` plus `<name>.license.json`.
 * Refuses a licence that does not allow commercial use, a non-audio body, and
 * anything over the size cap; a half-written file is never left behind.
 */
export async function downloadTrack(track: Track, dir: string, name: string, f: Fetch = fetch): Promise<Downloaded> {
  if (verdict(track.license) === 'refused') throw new Error('La licencia de esta pieza no permite uso comercial.')
  const url = assertPublicHttps(track.audioUrl)
  fs.mkdirSync(dir, { recursive: true })
  const res = await f(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000), headers: { 'user-agent': 'VideoAnalyzer-Music/0.1' } })
  if (!res.ok || !res.body) throw new Error(`La fuente respondió HTTP ${res.status}.`)
  // The final address after redirects is checked too.
  if (res.url) assertPublicHttps(res.url)
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_AUDIO_BYTES) throw new Error('El archivo es demasiado grande.')

  const tmp = path.join(dir, `${name}.part`)
  let bytes = 0
  let head = new Uint8Array(0)
  const out = fs.createWriteStream(tmp)
  try {
    const body = Readable.fromWeb(res.body as never)
    body.on('data', (chunk: Buffer) => {
      if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16)
      bytes += chunk.length
      if (bytes > MAX_AUDIO_BYTES) body.destroy(new Error('El archivo es demasiado grande.'))
    })
    await pipeline(body, out)
    const kind = sniffAudio(head)
    if (!kind) throw new Error('El archivo descargado no es audio.')
    const file = path.join(dir, `${name}${kind.ext}`)
    fs.renameSync(tmp, file)
    fs.writeFileSync(
      path.join(dir, `${name}.license.json`),
      JSON.stringify({ title: track.title, artist: track.artist, source: track.source, sourceId: track.sourceId, pageUrl: track.pageUrl, license: track.license, credit: creditText(track) }, null, 2),
    )
    return { file, bytes, mime: kind.type }
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
}

