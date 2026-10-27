// A ZIP archive without compression ("stored"), enough to download every
// note as an Obsidian vault folder. UTF-8 names (flag bit 11).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((Math.max(1980, d.getUTCFullYear()) - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  }
}

export function zip(entries: Array<{ path: string; data: Uint8Array; modified?: Date }>): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const e of entries) {
    const name = enc.encode(e.path)
    const crc = crc32(e.data)
    const { time, date } = dosTime(e.modified ?? new Date())
    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, e.data.length, true)
    lv.setUint32(22, e.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, e.data.length, true)
    cv.setUint32(24, e.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local, e.data)
    centrals.push(central)
    offset += local.length + e.data.length
  }
  const centralSize = centrals.reduce((s, c) => s + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)
  const out = new Uint8Array(offset + centralSize + 22)
  let at = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at)
    at += part.length
  }
  return out
}

export type ZipEntry = { path: string; data: Uint8Array }

/**
 * Reads a ZIP archive (stored or deflated entries, as GitHub and Obsidian
 * vault exports make them). Directories are skipped. Throws on anything else.
 */
export async function unzip(buf: Uint8Array, opts: { maxEntries?: number; maxBytes?: number } = {}): Promise<ZipEntry[]> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('No es un archivo .zip válido.')
  const count = v.getUint16(eocd + 10, true)
  let at = v.getUint32(eocd + 16, true)
  if (count > (opts.maxEntries ?? 5000)) throw new Error(`El .zip tiene demasiados archivos (${count}).`)
  const dec = new TextDecoder()
  const out: ZipEntry[] = []
  let total = 0
  for (let n = 0; n < count; n++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error('El índice del .zip está dañado.')
    const method = v.getUint16(at + 10, true)
    const compressed = v.getUint32(at + 20, true)
    const size = v.getUint32(at + 24, true)
    const nameLen = v.getUint16(at + 28, true)
    const extraLen = v.getUint16(at + 30, true)
    const commentLen = v.getUint16(at + 32, true)
    const local = v.getUint32(at + 42, true)
    const path = dec.decode(buf.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
    if (path.endsWith('/')) continue
    total += size
    if (total > (opts.maxBytes ?? 200 * 1024 * 1024)) throw new Error('El contenido del .zip pasa del máximo permitido.')
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const raw = buf.subarray(start, start + compressed)
    let data: Uint8Array
    if (method === 0) data = raw
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      data = new Uint8Array(await new Response(stream).arrayBuffer())
    } else throw new Error(`«${path}» usa una compresión que no se puede leer (${method}).`)
    out.push({ path, data })
  }
  return out
}
