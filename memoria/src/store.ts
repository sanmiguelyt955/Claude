// Notes, folders and files in D1 (text) and R2 (bytes). Nothing is deleted
// outright: a deleted note goes to the trash, and every content a note had is
// kept in note_versions.
import {
  cleanPath,
  extractLinks,
  extractTags,
  folderOf,
  notePath,
  resolveLink,
  rewriteLinks,
  snippet,
  splitFrontmatter,
  titleOf,
} from './parse'

export type Source = 'web' | 'mcp' | 'api' | 'import' | 'rename'

export type NoteRow = { path: string; title: string; content: string; created_at: string; updated_at: string; updated_by: string; deleted_at: string | null }
export type NoteSummary = { path: string; title: string; updated_at: string; created_at: string; size: number }
export type FileRow = { path: string; size: number; content_type: string; uploaded_at: string; deleted_at: string | null }

export class NotFoundError extends Error {
  status = 404
}
export class ConflictError extends Error {
  status = 409
  constructor(
    message: string,
    public current?: NoteRow,
  ) {
    super(message)
  }
}

const now = () => new Date().toISOString()
/** Web autosaves closer than this to the previous one are not each kept as a version… */
const VERSION_COALESCE_MS = 2 * 60_000
/** …but a long writing session still keeps one version at least this often. */
const VERSION_EVERY_MS = 10 * 60_000

// ── Reading ────────────────────────────────────────────────────────────────

export async function listNotes(db: D1Database, opts: { trash?: boolean } = {}): Promise<NoteSummary[]> {
  const { results } = await db
    .prepare(`SELECT path, title, updated_at, created_at, length(content) AS size FROM notes WHERE deleted_at IS ${opts.trash ? 'NOT ' : ''}NULL ORDER BY path COLLATE NOCASE`)
    .all<NoteSummary>()
  return results
}

export async function livePaths(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare('SELECT path FROM notes WHERE deleted_at IS NULL').all<{ path: string }>()
  return results.map((r) => r.path)
}

export async function getNote(db: D1Database, path: string): Promise<NoteRow | null> {
  return db.prepare('SELECT * FROM notes WHERE path = ?').bind(notePath(path)).first<NoteRow>()
}

/** A note by its path, or by a link-style name ("Nota", "Carpeta/Nota"). */
export async function findNote(db: D1Database, nameOrPath: string): Promise<NoteRow | null> {
  const direct = await db.prepare('SELECT * FROM notes WHERE path = ? AND deleted_at IS NULL').bind(notePath(nameOrPath)).first<NoteRow>()
  if (direct) return direct
  const hit = resolveLink(nameOrPath, await livePaths(db))
  return hit ? getNote(db, hit) : null
}

// ── Writing ────────────────────────────────────────────────────────────────

/** Statements that rebuild a note's links, tags and search entry. */
function indexStatements(db: D1Database, path: string, content: string | null): D1PreparedStatement[] {
  const out = [
    db.prepare('DELETE FROM links WHERE src = ?').bind(path),
    db.prepare('DELETE FROM tags WHERE path = ?').bind(path),
    db.prepare('DELETE FROM notes_fts WHERE path = ?').bind(path),
  ]
  if (content === null) return out
  for (const l of extractLinks(content)) if (l.target) out.push(db.prepare('INSERT INTO links (src, target, embed) VALUES (?, ?, ?)').bind(path, l.target, l.embed ? 1 : 0))
  for (const t of extractTags(content)) out.push(db.prepare('INSERT INTO tags (path, tag) VALUES (?, ?)').bind(path, t))
  out.push(db.prepare('INSERT INTO notes_fts (path, title, content) VALUES (?, ?, ?)').bind(path, titleOf(path), splitFrontmatter(content).body))
  return out
}

/**
 * The statement that keeps `previous` as a version. Only one case skips it:
 * the web app autosaving over its own autosave of a moment ago, when a
 * version of that note was kept in the last 10 minutes (so a long writing
 * session still leaves one every 10 minutes). A version is never
 * overwritten: an autosave right after a rename used to replace the version
 * the rename kept.
 */
async function versionStatement(db: D1Database, previous: NoteRow, source: Source): Promise<D1PreparedStatement[]> {
  if (source === 'web' && previous.updated_by === 'web' && Date.now() - Date.parse(previous.updated_at) < VERSION_COALESCE_MS) {
    const last = await db.prepare('SELECT saved_at FROM note_versions WHERE path = ? ORDER BY id DESC LIMIT 1').bind(previous.path).first<{ saved_at: string }>()
    if (last && Date.now() - Date.parse(last.saved_at) < VERSION_EVERY_MS) return []
  }
  return [db.prepare('INSERT INTO note_versions (path, content, saved_at, source) VALUES (?, ?, ?, ?)').bind(previous.path, previous.content, now(), previous.updated_by || source)]
}

/**
 * Creates or replaces a note. With `baseUpdatedAt`, a note changed elsewhere
 * since it was opened is not overwritten: a ConflictError carries the
 * current content so nothing is lost.
 */
export async function saveNote(
  db: D1Database,
  rawPath: string,
  content: string,
  opts: { source: Source; baseUpdatedAt?: string | null; createOnly?: boolean },
): Promise<NoteRow> {
  const path = notePath(rawPath)
  const existing = await getNote(db, path)
  if (existing && !existing.deleted_at) {
    if (opts.createOnly) throw new ConflictError(`Ya existe la nota «${path}».`, existing)
    if (opts.baseUpdatedAt && existing.updated_at !== opts.baseUpdatedAt) {
      throw new ConflictError('La nota cambió en otro sitio desde que la abriste.', existing)
    }
    if (existing.content === content) return existing
  }
  const at = now()
  const stmts: D1PreparedStatement[] = []
  if (existing) stmts.push(...(await versionStatement(db, existing, opts.source)))
  stmts.push(
    existing
      ? db.prepare('UPDATE notes SET content = ?, updated_at = ?, updated_by = ?, deleted_at = NULL WHERE path = ?').bind(content, at, opts.source, path)
      : db.prepare('INSERT INTO notes (path, title, content, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)').bind(path, titleOf(path), content, at, at, opts.source),
    ...indexStatements(db, path, content),
  )
  await db.batch(stmts)
  return (await getNote(db, path))!
}

/** A free name next to `path`: "Nota.md", then "Nota 1.md", "Nota 2.md"… */
export async function freePath(db: D1Database, rawPath: string): Promise<string> {
  const path = notePath(rawPath)
  const base = path.replace(/\.md$/i, '')
  for (let i = 0; ; i++) {
    const candidate = i ? `${base} ${i}.md` : path
    const row = await db.prepare('SELECT 1 FROM notes WHERE path = ? AND deleted_at IS NULL').bind(candidate).first()
    if (!row) return candidate
  }
}

/** Adds text at the end of a note, or under one of its headings; creates the note if it does not exist. */
export async function appendToNote(db: D1Database, rawPath: string, text: string, opts: { source: Source; heading?: string }): Promise<NoteRow> {
  const existing = await findNote(db, rawPath)
  const path = existing?.path ?? notePath(rawPath)
  const current = existing?.content ?? ''
  let next: string
  if (opts.heading) {
    const lines = current.split('\n')
    const h = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#{1,6}\s+/, '').trim().toLowerCase() === opts.heading!.trim().toLowerCase())
    if (h < 0) {
      next = `${current.replace(/\s*$/, '')}${current.trim() ? '\n\n' : ''}## ${opts.heading}\n\n${text}\n`
    } else {
      const level = /^(#+)/.exec(lines[h]!)![1]!.length
      let end = lines.findIndex((l, i) => i > h && /^(#+)\s/.test(l) && /^(#+)/.exec(l)![1]!.length <= level)
      if (end < 0) end = lines.length
      while (end > h + 1 && lines[end - 1]!.trim() === '') end--
      lines.splice(end, 0, text)
      next = lines.join('\n')
    }
  } else {
    next = `${current.replace(/\s*$/, '')}${current.trim() ? '\n\n' : ''}${text}\n`
  }
  return saveNote(db, path, next, { source: opts.source })
}

/** Moves a note to the trash. Its versions stay; restoreNote brings it back. */
export async function trashNote(db: D1Database, rawPath: string): Promise<void> {
  const path = notePath(rawPath)
  const note = await getNote(db, path)
  if (!note || note.deleted_at) throw new NotFoundError(`No existe la nota «${path}».`)
  await db.batch([db.prepare('UPDATE notes SET deleted_at = ? WHERE path = ?').bind(now(), path), ...indexStatements(db, path, null)])
}

export async function restoreNote(db: D1Database, rawPath: string): Promise<NoteRow> {
  const path = notePath(rawPath)
  const note = await getNote(db, path)
  if (!note) throw new NotFoundError(`No existe la nota «${path}».`)
  await db.batch([db.prepare('UPDATE notes SET deleted_at = NULL WHERE path = ?').bind(path), ...indexStatements(db, path, note.content)])
  return (await getNote(db, path))!
}

/**
 * Renames or moves a note, and rewrites every [[link]] to it in the other
 * notes (each of them keeps its previous content as a version).
 */
export async function renameNote(db: D1Database, rawFrom: string, rawTo: string, source: Source): Promise<{ path: string; updatedLinks: string[] }> {
  const from = notePath(rawFrom)
  const to = notePath(rawTo)
  if (from === to) return { path: to, updatedLinks: [] }
  const note = await getNote(db, from)
  if (!note || note.deleted_at) throw new NotFoundError(`No existe la nota «${from}».`)
  const clash = await getNote(db, to)
  if (clash && !clash.deleted_at) throw new ConflictError(`Ya existe la nota «${to}».`, clash)
  const before = await livePaths(db)
  const after = before.filter((p) => p !== from).concat(to)
  const at = now()
  const stmts: D1PreparedStatement[] = []
  // A trashed note with the new name keeps its history under a dated name.
  if (clash) stmts.push(db.prepare('UPDATE notes SET path = ?, title = ? WHERE path = ?').bind(`${to.replace(/\.md$/, '')} (papelera ${at.slice(0, 10)}).md`, `${titleOf(to)} (papelera)`, to))
  stmts.push(
    db.prepare("UPDATE notes SET path = ?, title = ?, updated_at = ?, updated_by = 'rename' WHERE path = ?").bind(to, titleOf(to), at, from),
    db.prepare('UPDATE note_versions SET path = ? WHERE path = ?').bind(to, from),
    ...indexStatements(db, from, null),
  )
  // Its own content may link to itself.
  const ownContent = rewriteLinks(note.content, from, to, after)
  if (ownContent !== note.content) stmts.push(db.prepare('UPDATE notes SET content = ? WHERE path = ?').bind(ownContent, to))
  stmts.push(...indexStatements(db, to, ownContent))
  const updatedLinks: string[] = []
  const { results: linking } = await db
    .prepare('SELECT DISTINCT n.* FROM notes n JOIN links l ON l.src = n.path WHERE n.deleted_at IS NULL AND n.path != ?')
    .bind(from)
    .all<NoteRow>()
  for (const other of linking) {
    const next = rewriteLinks(other.content, from, to, after)
    if (next === other.content) continue
    updatedLinks.push(other.path)
    stmts.push(
      ...(await versionStatement(db, other, 'rename')),
      db.prepare("UPDATE notes SET content = ?, updated_at = ?, updated_by = 'rename' WHERE path = ?").bind(next, at, other.path),
      ...indexStatements(db, other.path, next),
    )
  }
  await db.batch(stmts)
  return { path: to, updatedLinks }
}

// ── Links, tags, graph ─────────────────────────────────────────────────────

export type Backlink = { path: string; title: string; count: number; context: string }

/** Notes that link to `path`, with a line of context each. */
export async function backlinks(db: D1Database, rawPath: string): Promise<Backlink[]> {
  const path = notePath(rawPath)
  const paths = await livePaths(db)
  const { results } = await db
    .prepare('SELECT l.src, l.target, n.content FROM links l JOIN notes n ON n.path = l.src WHERE n.deleted_at IS NULL AND l.target LIKE ? COLLATE NOCASE')
    .bind(`%${titleOf(path)}`)
    .all<{ src: string; target: string; content: string }>()
  const by = new Map<string, Backlink>()
  for (const r of results) {
    if (r.src === path || resolveLink(r.target, paths) !== path) continue
    const entry = by.get(r.src) ?? { path: r.src, title: titleOf(r.src), count: 0, context: '' }
    entry.count++
    if (!entry.context) {
      const line = r.content.split('\n').find((l) => l.toLowerCase().includes(`[[${r.target.toLowerCase()}`))
      entry.context = (line ?? '').trim().slice(0, 240)
    }
    by.set(r.src, entry)
  }
  return [...by.values()].sort((a, b) => a.title.localeCompare(b.title))
}

/** Notes that name this one in their text without linking to it. */
export async function unlinkedMentions(db: D1Database, rawPath: string): Promise<Array<{ path: string; title: string; context: string }>> {
  const path = notePath(rawPath)
  const title = titleOf(path)
  if (title.length < 3) return []
  const linked = new Set((await backlinks(db, path)).map((b) => b.path))
  const { results } = await db
    .prepare('SELECT path, content FROM notes_fts WHERE notes_fts MATCH ? LIMIT 50')
    .bind(`content:${ftsPhrase(title)}`)
    .all<{ path: string; content: string }>()
  return results
    .filter((r) => r.path !== path && !linked.has(r.path))
    .map((r) => ({ path: r.path, title: titleOf(r.path), context: snippet(r.content, title, 200) }))
}

export type OutLink = { target: string; path: string | null; embed: boolean }

export async function outgoingLinks(db: D1Database, rawPath: string): Promise<OutLink[]> {
  const path = notePath(rawPath)
  const paths = await livePaths(db)
  const fileRows = await db.prepare('SELECT path FROM files WHERE deleted_at IS NULL').all<{ path: string }>()
  const files = fileRows.results.map((f) => f.path)
  const { results } = await db.prepare('SELECT target, embed FROM links WHERE src = ?').bind(path).all<{ target: string; embed: number }>()
  const seen = new Set<string>()
  const out: OutLink[] = []
  for (const r of results) {
    const key = r.target.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ target: r.target, path: resolveLink(r.target, paths) ?? resolveFile(r.target, files), embed: Boolean(r.embed) })
  }
  return out
}

/** An attachment named by a link: by full path or by file name. */
export function resolveFile(target: string, files: readonly string[]): string | null {
  const t = target.toLowerCase()
  return files.find((f) => f.toLowerCase() === t) ?? files.find((f) => f.toLowerCase().endsWith(`/${t}`)) ?? null
}

export type Graph = { nodes: Array<{ id: string; title: string; tags: string[]; links: number }>; edges: Array<{ source: string; target: string }>; unresolved: Array<{ target: string; from: string[] }> }

export async function graph(db: D1Database): Promise<Graph> {
  const paths = await livePaths(db)
  const { results: links } = await db
    .prepare('SELECT l.src, l.target FROM links l JOIN notes n ON n.path = l.src WHERE n.deleted_at IS NULL')
    .all<{ src: string; target: string }>()
  const { results: tags } = await db.prepare('SELECT path, tag FROM tags').all<{ path: string; tag: string }>()
  const tagsBy = new Map<string, string[]>()
  for (const t of tags) tagsBy.set(t.path, [...(tagsBy.get(t.path) ?? []), t.tag])
  const edges = new Map<string, { source: string; target: string }>()
  const unresolved = new Map<string, Set<string>>()
  const degree = new Map<string, number>()
  for (const l of links) {
    const to = resolveLink(l.target, paths)
    if (!to) {
      // Attachments ("foto.png") are not missing notes.
      if (/\.[a-z0-9]{2,5}$/i.test(l.target)) continue
      unresolved.set(l.target, (unresolved.get(l.target) ?? new Set()).add(l.src))
      continue
    }
    if (to === l.src) continue
    const key = `${l.src}\u0000${to}`
    if (edges.has(key)) continue
    edges.set(key, { source: l.src, target: to })
    degree.set(l.src, (degree.get(l.src) ?? 0) + 1)
    degree.set(to, (degree.get(to) ?? 0) + 1)
  }
  return {
    nodes: paths.map((p) => ({ id: p, title: titleOf(p), tags: tagsBy.get(p) ?? [], links: degree.get(p) ?? 0 })),
    edges: [...edges.values()],
    unresolved: [...unresolved.entries()].map(([target, from]) => ({ target, from: [...from] })).sort((a, b) => a.target.localeCompare(b.target)),
  }
}

export async function tagCounts(db: D1Database): Promise<Array<{ tag: string; count: number }>> {
  const { results } = await db.prepare('SELECT tag, count(DISTINCT path) AS count FROM tags GROUP BY tag ORDER BY tag').all<{ tag: string; count: number }>()
  return results
}

// ── Search ─────────────────────────────────────────────────────────────────

/** One FTS5 phrase, quotes doubled. */
function ftsPhrase(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

export type SearchHit = { path: string; title: string; snippet: string; score: number }

/**
 * Words anywhere in title or text (accents ignored, word starts match:
 * "impres" finds "impresora"), plus Obsidian's operators: "frase exacta",
 * tag:#etiqueta, path:carpeta, file:nombre, and -palabra to exclude.
 */
export async function search(db: D1Database, query: string, limit = 50): Promise<SearchHit[]> {
  const tags: string[] = []
  const paths: string[] = []
  const files: string[] = []
  const terms: string[] = []
  const excluded: string[] = []
  for (const m of query.matchAll(/(-?)(?:(tag|path|file):)?("([^"]*)"|\S+)/gi)) {
    const value = (m[4] ?? m[3]!).trim()
    if (!value) continue
    const op = m[2]?.toLowerCase()
    if (op === 'tag') tags.push(value.replace(/^#/, '').toLowerCase())
    else if (op === 'path') paths.push(value.toLowerCase())
    else if (op === 'file') files.push(value.toLowerCase())
    else if (m[1]) excluded.push(ftsPhrase(value))
    else terms.push(m[4] !== undefined ? ftsPhrase(value) : `${ftsPhrase(value)}*`)
  }
  let rows: Array<{ path: string; content: string; score: number }>
  if (terms.length) {
    const match = terms.join(' AND ') + (excluded.length ? ` NOT (${excluded.join(' OR ')})` : '')
    const r = await db
      .prepare('SELECT path, content, bm25(notes_fts, 0, 5, 1) AS score FROM notes_fts WHERE notes_fts MATCH ? ORDER BY score LIMIT 500')
      .bind(match)
      .all<{ path: string; content: string; score: number }>()
    rows = r.results
  } else {
    const r = await db.prepare('SELECT path, content, 0 AS score FROM notes_fts LIMIT 5000').all<{ path: string; content: string; score: number }>()
    rows = r.results
  }
  if (tags.length) {
    const { results } = await db
      .prepare(`SELECT path, tag FROM tags WHERE ${tags.map(() => '(tag = ? OR tag LIKE ?)').join(' OR ')}`)
      .bind(...tags.flatMap((t) => [t, `${t}/%`]))
      .all<{ path: string; tag: string }>()
    const hasAll = new Map<string, Set<string>>()
    for (const r of results) for (const t of tags) if (r.tag === t || r.tag.startsWith(`${t}/`)) hasAll.set(r.path, (hasAll.get(r.path) ?? new Set()).add(t))
    rows = rows.filter((r) => (hasAll.get(r.path)?.size ?? 0) === tags.length)
  }
  if (paths.length) rows = rows.filter((r) => paths.every((p) => r.path.toLowerCase().includes(p)))
  if (files.length) rows = rows.filter((r) => files.every((f) => titleOf(r.path).toLowerCase().includes(f)))
  if (!terms.length && !tags.length && !paths.length && !files.length) return []
  const words = terms.map((t) => t.replace(/^"|"\*?$/g, '').replace(/""/g, '"')).join(' ')
  return rows.slice(0, limit).map((r) => ({ path: r.path, title: titleOf(r.path), snippet: snippet(r.content, words), score: r.score }))
}

/** Titles that start with or contain the text, for the quick switcher and link suggestions. */
export async function suggestTitles(db: D1Database, q: string, limit = 20): Promise<NoteSummary[]> {
  const like = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`
  const { results } = await db
    .prepare(
      `SELECT path, title, updated_at, created_at, length(content) AS size FROM notes WHERE deleted_at IS NULL AND (title LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\')
       ORDER BY (title LIKE ? ESCAPE '\\') DESC, updated_at DESC LIMIT ?`,
    )
    .bind(like, like, `${q.replace(/[%_]/g, (c) => `\\${c}`)}%`, limit)
    .all<NoteSummary>()
  return results
}

// ── Versions ───────────────────────────────────────────────────────────────

export async function versions(db: D1Database, rawPath: string): Promise<Array<{ id: number; saved_at: string; source: string; size: number }>> {
  const { results } = await db
    .prepare('SELECT id, saved_at, source, length(content) AS size FROM note_versions WHERE path = ? ORDER BY id DESC LIMIT 200')
    .bind(notePath(rawPath))
    .all<{ id: number; saved_at: string; source: string; size: number }>()
  return results
}

export async function getVersion(db: D1Database, id: number): Promise<{ id: number; path: string; content: string; saved_at: string; source: string } | null> {
  return db.prepare('SELECT * FROM note_versions WHERE id = ?').bind(id).first()
}

// ── Folders ────────────────────────────────────────────────────────────────

export async function listFolders(db: D1Database): Promise<string[]> {
  const set = new Set<string>()
  const add = (p: string) => {
    for (let f = folderOf(p); f; f = folderOf(f)) set.add(f)
  }
  for (const p of await livePaths(db)) add(p)
  const { results: files } = await db.prepare('SELECT path FROM files WHERE deleted_at IS NULL').all<{ path: string }>()
  for (const f of files) add(f.path)
  const { results: empty } = await db.prepare('SELECT path FROM folders').all<{ path: string }>()
  for (const f of empty) {
    set.add(f.path)
    add(`${f.path}/x`)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export async function createFolder(db: D1Database, rawPath: string): Promise<string> {
  const path = cleanPath(rawPath)
  await db.prepare('INSERT OR IGNORE INTO folders (path) VALUES (?)').bind(path).run()
  return path
}

/** Renames a folder: every note and file in it moves, links follow. */
export async function renameFolder(db: D1Database, files: R2Bucket, rawFrom: string, rawTo: string, source: Source): Promise<{ moved: number }> {
  const from = cleanPath(rawFrom)
  const to = cleanPath(rawTo)
  const inside = (await livePaths(db)).filter((p) => p.startsWith(`${from}/`))
  for (const p of inside) await renameNote(db, p, `${to}/${p.slice(from.length + 1)}`, source)
  const { results: attached } = await db.prepare("SELECT path FROM files WHERE deleted_at IS NULL AND path LIKE ? ESCAPE '\\'").bind(`${from.replace(/[%_]/g, (c) => `\\${c}`)}/%`).all<{ path: string }>()
  for (const f of attached) await moveFile(db, files, f.path, `${to}/${f.path.slice(from.length + 1)}`)
  await db.batch([
    db.prepare("UPDATE folders SET path = ? || substr(path, ?) WHERE path = ? OR path LIKE ? ESCAPE '\\'").bind(to, from.length + 1, from, `${from.replace(/[%_]/g, (c) => `\\${c}`)}/%`),
  ])
  return { moved: inside.length + attached.length }
}

/** Sends every note in the folder to the trash and forgets the folder. */
export async function trashFolder(db: D1Database, rawPath: string): Promise<{ trashed: number }> {
  const path = cleanPath(rawPath)
  const inside = (await livePaths(db)).filter((p) => p.startsWith(`${path}/`))
  for (const p of inside) await trashNote(db, p)
  await db.prepare("DELETE FROM folders WHERE path = ? OR path LIKE ? ESCAPE '\\'").bind(path, `${path.replace(/[%_]/g, (c) => `\\${c}`)}/%`).run()
  return { trashed: inside.length }
}

// ── Files (R2) ─────────────────────────────────────────────────────────────

export async function putFile(db: D1Database, files: R2Bucket, rawPath: string, body: ReadableStream | ArrayBuffer, contentType: string, size: number): Promise<FileRow> {
  const path = cleanPath(rawPath)
  if (/\.md$/i.test(path)) throw new Error('Las notas .md se guardan como notas, no como archivos.')
  const existing = await db.prepare('SELECT * FROM files WHERE path = ?').bind(path).first<FileRow>()
  // A replaced file keeps its old bytes under a dated name.
  if (existing && !existing.deleted_at) {
    const old = await files.get(path)
    if (old) await files.put(`.versiones/${now().replace(/[:.]/g, '-')}/${path}`, old.body, { httpMetadata: old.httpMetadata })
  }
  await files.put(path, body, { httpMetadata: { contentType } })
  const at = now()
  await db
    .prepare('INSERT INTO files (path, size, content_type, uploaded_at) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET size = excluded.size, content_type = excluded.content_type, uploaded_at = excluded.uploaded_at, deleted_at = NULL')
    .bind(path, size, contentType, at)
    .run()
  return (await db.prepare('SELECT * FROM files WHERE path = ?').bind(path).first<FileRow>())!
}

export async function listFiles(db: D1Database, opts: { trash?: boolean } = {}): Promise<FileRow[]> {
  const { results } = await db.prepare(`SELECT * FROM files WHERE deleted_at IS ${opts.trash ? 'NOT ' : ''}NULL ORDER BY path COLLATE NOCASE`).all<FileRow>()
  return results
}

export async function trashFile(db: D1Database, rawPath: string): Promise<void> {
  const path = cleanPath(rawPath)
  const r = await db.prepare('UPDATE files SET deleted_at = ? WHERE path = ? AND deleted_at IS NULL').bind(now(), path).run()
  if (!r.meta.changes) throw new NotFoundError(`No existe el archivo «${path}».`)
}

export async function restoreFile(db: D1Database, rawPath: string): Promise<void> {
  const path = cleanPath(rawPath)
  const r = await db.prepare('UPDATE files SET deleted_at = NULL WHERE path = ?').bind(path).run()
  if (!r.meta.changes) throw new NotFoundError(`No existe el archivo «${path}».`)
}

export async function moveFile(db: D1Database, files: R2Bucket, rawFrom: string, rawTo: string): Promise<void> {
  const from = cleanPath(rawFrom)
  const to = cleanPath(rawTo)
  const obj = await files.get(from)
  if (!obj) throw new NotFoundError(`No existe el archivo «${from}».`)
  await files.put(to, obj.body, { httpMetadata: obj.httpMetadata })
  await files.delete(from)
  await db.prepare('UPDATE files SET path = ? WHERE path = ?').bind(to, from).run()
}

// ── Settings, daily notes, templates ───────────────────────────────────────

export async function getSetting<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>()
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export async function setSetting(db: D1Database, key: string, value: unknown): Promise<void> {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run()
}

export type DailySettings = { folder: string; template: string | null }
export const DEFAULT_DAILY: DailySettings = { folder: 'Diario', template: null }
export const TEMPLATE_FOLDER = 'Plantillas'

/** {{title}}, {{date}}, {{time}} and {{date:YYYY-MM-DD HH:mm}} filled in, as Obsidian's core Templates plugin does. */
export function fillTemplate(text: string, title: string, at = new Date(), timeZone = 'America/Mexico_City'): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>
  const fmt = (f: string) =>
    f
      .replace(/YYYY/g, parts.year!)
      .replace(/MM/g, parts.month!)
      .replace(/DD/g, parts.day!)
      .replace(/HH/g, parts.hour === '24' ? '00' : parts.hour!)
      .replace(/mm/g, parts.minute!)
      .replace(/ss/g, parts.second!)
  return text
    .replace(/\{\{\s*title\s*\}\}/gi, title)
    .replace(/\{\{\s*date\s*:\s*([^}]+)\}\}/gi, (_, f: string) => fmt(f.trim()))
    .replace(/\{\{\s*time\s*:\s*([^}]+)\}\}/gi, (_, f: string) => fmt(f.trim()))
    .replace(/\{\{\s*date\s*\}\}/gi, fmt('YYYY-MM-DD'))
    .replace(/\{\{\s*time\s*\}\}/gi, fmt('HH:mm'))
}

export function localDate(at = new Date(), timeZone = 'America/Mexico_City'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

/** Today's note in the daily folder, created from the daily template the first time. */
export async function dailyNote(db: D1Database, source: Source, date?: string): Promise<NoteRow> {
  const settings = await getSetting(db, 'daily', DEFAULT_DAILY)
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDate()
  const path = notePath(`${settings.folder ? `${settings.folder}/` : ''}${day}`)
  const existing = await getNote(db, path)
  if (existing && !existing.deleted_at) return existing
  let content = `# ${day}\n\n`
  if (settings.template) {
    const tpl = await findNote(db, settings.template)
    if (tpl) content = fillTemplate(tpl.content, day, new Date(`${day}T12:00:00Z`))
  }
  return saveNote(db, path, content, { source })
}

export async function listTemplates(db: D1Database): Promise<NoteSummary[]> {
  return (await listNotes(db)).filter((n) => n.path.startsWith(`${TEMPLATE_FOLDER}/`))
}
