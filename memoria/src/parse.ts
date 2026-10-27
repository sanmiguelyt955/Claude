// Markdown the way Obsidian reads it: frontmatter, [[links]], ![[embeds]],
// #tags and headings. Pure functions, shared by the API and the MCP tools.

export type Link = {
  /** The note or file named, without #heading or ^block: "Carpeta/Nota" or "Nota". */
  target: string
  /** "#Título" or "#^bloque" when the link points inside the note. */
  subpath: string | null
  /** The text after "|", when the link shows something other than its target. */
  alias: string | null
  embed: boolean
}

export type Heading = { level: number; text: string; line: number }

export type Frontmatter = { data: Record<string, unknown>; body: string; raw: string | null }

/** A vault path made safe: forward slashes, no leading slash, no "." or ".." parts, no hidden folders. */
export function cleanPath(input: string): string {
  const parts = input
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p && p !== '.')
  if (parts.some((p) => p === '..' || p.startsWith('.'))) throw new Error(`Ruta no válida: ${input}`)
  if (!parts.length) throw new Error('La ruta está vacía.')
  if (parts.some((p) => /[\u0000-\u001f<>:"|?*]/.test(p))) throw new Error(`La ruta tiene caracteres no permitidos: ${input}`)
  return parts.join('/')
}

/** A note path: cleaned and ending in ".md". */
export function notePath(input: string): string {
  const p = cleanPath(input)
  return /\.md$/i.test(p) ? p : `${p}.md`
}

/** "Carpeta/Mi nota.md" → "Mi nota". */
export function titleOf(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.replace(/\.md$/i, '')
}

export function folderOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/**
 * The YAML block between the first two "---" lines. Only what notes use:
 * "key: value", inline lists "[a, b]" and "- item" lists; anything else is
 * kept as its raw string.
 */
export function splitFrontmatter(content: string): Frontmatter {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(content)
  if (!m) return { data: {}, body: content, raw: null }
  const data: Record<string, unknown> = {}
  let listKey: string | null = null
  for (const line of m[1]!.split(/\r?\n/)) {
    const item = /^\s+-\s*(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line)
    if (item && listKey) {
      ;(data[listKey] as unknown[]).push(scalar(item[1]!))
      continue
    }
    const kv = /^([^:#\s][^:]*):\s*(.*)$/.exec(line)
    if (!kv) continue
    const key = kv[1]!.trim()
    const value = kv[2]!.trim()
    if (value === '') {
      data[key] = []
      listKey = key
      continue
    }
    listKey = null
    data[key] = value.startsWith('[') && value.endsWith(']') ? splitInline(value.slice(1, -1)).map(scalar) : scalar(value)
  }
  // An empty list key that never got items is an empty value, as YAML reads it.
  for (const [k, v] of Object.entries(data)) if (Array.isArray(v) && v.length === 0) data[k] = null
  return { data, body: content.slice(m[0].length), raw: m[1]! }
}

function splitInline(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null
      cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}

function scalar(raw: string): unknown {
  const v = raw.trim()
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1)
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null' || v === '~') return null
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v
}

/** The text with fenced code, inline code and HTML comments blanked out (same length), so links and tags inside them are not read. */
export function maskCode(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ')
  return text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/^%%[\s\S]*?%%/gm, blank)
}

const LINK_RE = /(!?)\[\[([^\[\]\n]+?)\]\]/g

/** Every [[link]] and ![[embed]] outside code, in order. */
export function extractLinks(content: string): Link[] {
  const text = maskCode(content)
  const out: Link[] = []
  for (const m of text.matchAll(LINK_RE)) {
    const parsed = parseLinkInner(m[2]!)
    if (parsed.target || parsed.subpath) out.push({ ...parsed, embed: m[1] === '!' })
  }
  return out
}

/** "Nota#Título|texto" → its parts. A link to a heading of the same note has an empty target. */
export function parseLinkInner(inner: string): Omit<Link, 'embed'> {
  const pipe = inner.indexOf('|')
  const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() || null : null
  const ref = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim()
  const hash = ref.indexOf('#')
  const target = (hash >= 0 ? ref.slice(0, hash) : ref).trim().replace(/\.md$/i, '')
  const subpath = hash >= 0 ? ref.slice(hash).trim() || null : null
  return { target, subpath, alias }
}

/** Tags from the frontmatter ("tags"/"tag", list or comma separated) and #tags in the text, lower-cased, without "#". Nested tags keep their "/". */
export function extractTags(content: string): string[] {
  const { data, body } = splitFrontmatter(content)
  const tags = new Set<string>()
  for (const key of ['tags', 'tag']) {
    const v = data[key]
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\s]+/) : []
    for (const t of list) {
      const clean = String(t ?? '').replace(/^#/, '').trim()
      if (clean) tags.add(clean.toLowerCase())
    }
  }
  const text = maskCode(body)
  for (const m of text.matchAll(/(^|[\s(,;])#([\p{L}\p{N}_\-/]+)/gu)) {
    const tag = m[2]!.replace(/\/+$/, '')
    // "#123" is not a tag in Obsidian; an issue number or a heading anchor is not either.
    if (!tag || /^[\d/]+$/.test(tag)) continue
    tags.add(tag.toLowerCase())
  }
  return [...tags]
}

export function extractHeadings(content: string): Heading[] {
  const { body, raw } = splitFrontmatter(content)
  const offset = raw === null ? 0 : raw.split('\n').length + 2
  const text = maskCode(body)
  const out: Heading[] = []
  text.split('\n').forEach((line, i) => {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) out.push({ level: m[1]!.length, text: body.split('\n')[i]!.replace(/^#{1,6}\s+/, '').replace(/\s*#*\s*$/, ''), line: i + offset })
  })
  return out
}

/**
 * Which note a link target names, the way Obsidian resolves it: a path
 * ("Carpeta/Nota") matches that path, or the end of one; a bare name matches
 * a note with that title anywhere, the shortest path first. Case-insensitive.
 */
export function resolveLink(target: string, paths: readonly string[]): string | null {
  const t = target.trim().replace(/\.md$/i, '').toLowerCase()
  if (!t) return null
  const candidates = paths.filter((p) => {
    const bare = p.replace(/\.md$/i, '').toLowerCase()
    return bare === t || bare.endsWith(`/${t}`)
  })
  if (!candidates.length) return null
  return candidates.sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length)[0]!
}

/**
 * The content with every link that resolves to `from` pointing at `to`
 * instead, keeping its #heading and |alias. Links are written by title when
 * that title is unique, otherwise by path. Code is left alone.
 */
export function rewriteLinks(content: string, from: string, to: string, pathsAfter: readonly string[]): string {
  const masked = maskCode(content)
  const toTitle = titleOf(to)
  const unique = pathsAfter.filter((p) => titleOf(p).toLowerCase() === toTitle.toLowerCase()).length <= 1
  const newTarget = unique ? toTitle : to.replace(/\.md$/i, '')
  const before = pathsAfter.filter((p) => p !== to).concat(from)
  let out = ''
  let last = 0
  for (const m of masked.matchAll(LINK_RE)) {
    const inner = content.slice(m.index! + m[1]!.length + 2, m.index! + m[0].length - 2)
    const parsed = parseLinkInner(inner)
    if (!parsed.target || resolveLink(parsed.target, before) !== from) continue
    out += content.slice(last, m.index!) + `${m[1]}[[${newTarget}${parsed.subpath ?? ''}${parsed.alias ? `|${parsed.alias}` : ''}]]`
    last = m.index! + m[0].length
  }
  return out + content.slice(last)
}

/** Words of the text, for a snippet around a search hit. */
export function snippet(content: string, query: string, size = 160): string {
  const { body } = splitFrontmatter(content)
  const flat = body.replace(/\s+/g, ' ').trim()
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const words = fold(query).split(/\s+/).filter((w) => w.length > 1)
  const hay = fold(flat)
  const at = words.map((w) => hay.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, at - Math.floor(size / 3))
  return (start > 0 ? '…' : '') + flat.slice(start, start + size) + (start + size < flat.length ? '…' : '')
}
