/**
 * Search pieces taken from the V6.5 record, which holds most of what an
 * analysis saw: second-by-second detail (9.5) and every on-screen text
 * (9.7). Without them library search only knew the summary, the scenes,
 * the transcript and a few elements, so a price or a name read on screen
 * could not be found.
 */
export type RecordChunk = { source: 'scene' | 'element'; startSeconds: number; endSeconds: number | null; text: string }

/** Seconds of 9.5 put together in one piece: one per second would be too many to embed. */
const GROUP_SECONDS = 15
const MAX_CHARS = 1800

/** "01:42.50", "63:05" or "1:03:05" in seconds. */
export function recordTime(t: string): number | undefined {
  const parts = t.split(':').map(Number)
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p))) return undefined
  return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0) * 100) / 100
}

/** One "## 9.x" section of the record without its heading; '' when absent. */
export function recordSection(md: string, id: string): string {
  const at = md.search(new RegExp(`^## ${id.replace('.', '\\.')}\\b`, 'm'))
  if (at === -1) return ''
  const body = md.slice(md.indexOf('\n', at) + 1)
  const next = body.search(/^## /m)
  return next === -1 ? body : body.slice(0, next)
}

const TIME = String.raw`(\d+(?::\d\d){1,2}(?:\.\d+)?)`

export function recordChunks(md: string | null | undefined): RecordChunk[] {
  if (!md) return []
  const out: RecordChunk[] = []

  // 9.5: "[00:00–00:01]" then VIS:/AUD:/TXT:/CAM: lines.
  const entries: Array<{ start: number; end: number; text: string }> = []
  const head = new RegExp(String.raw`^\[${TIME}\s*[–-]\s*${TIME}\]\s*$`)
  let current: { start: number; end: number; lines: string[] } | undefined
  const close = () => {
    if (current) entries.push({ start: current.start, end: current.end, text: current.lines.join(' ') })
    current = undefined
  }
  for (const line of recordSection(md, '9.5').split('\n')) {
    const m = head.exec(line.trim())
    if (m) {
      close()
      const start = recordTime(m[1]!)
      const end = recordTime(m[2]!)
      if (start !== undefined && end !== undefined) current = { start, end, lines: [] }
      continue
    }
    const kept = /^(VIS|TXT|AUD):\s*(.+)$/.exec(line.trim())
    if (current && kept && !/^SIN CAMBIOS/i.test(kept[2]!)) current.lines.push(`${kept[1]}: ${kept[2]}`)
  }
  close()
  let group: typeof entries = []
  const flush = () => {
    const text = group.map((e) => e.text).filter(Boolean).join(' ')
    if (text) out.push({ source: 'scene', startSeconds: group[0]!.start, endSeconds: group.at(-1)!.end, text: text.slice(0, MAX_CHARS) })
    group = []
  }
  let chars = 0
  for (const e of entries) {
    // A piece ends at 15 s or before it outgrows what one embedding reads well.
    if (group.length && (e.end - group[0]!.start > GROUP_SECONDS || chars + e.text.length > MAX_CHARS)) {
      flush()
      chars = 0
    }
    chars += e.text.length + 1
    group.push(e)
  }
  flush()

  // 9.7: "**TX3** — aparece 01:32.52 / desaparece 01:36.04 (…)" then labelled lines.
  const texts = recordSection(md, '9.7').split(/^(?=\*\*TX)/m)
  for (const block of texts) {
    const m = new RegExp(String.raw`^\*\*(TX[^*]*)\*\*.*?aparece\s+${TIME}(?:.*?desaparece\s+${TIME})?`).exec(block)
    if (!m) continue
    const start = recordTime(m[2]!)
    if (start === undefined) continue
    const field = (name: string) => new RegExp(String.raw`^${name}:\s*([\s\S]*?)(?=^[A-ZÁÉÍÓÚÑ]+:|$(?![\s\S]))`, 'm').exec(block)?.[1]?.trim().replace(/\s+/g, ' ')
    const content = field('CONTENIDO')
    if (!content) continue
    const where = [field('TIPO'), field('POSICIÓN')].filter(Boolean).join(', ')
    out.push({
      source: 'element',
      startSeconds: start,
      endSeconds: m[3] ? (recordTime(m[3]) ?? null) : null,
      text: `Texto en pantalla: ${content}${where ? ` (${where})` : ''}`.slice(0, MAX_CHARS),
    })
  }
  return out
}
