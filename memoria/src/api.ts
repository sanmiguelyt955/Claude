// The JSON API the web app (public/) and scripts use, under /api/.
import { authenticate, checkPassword, clearCookie, configured, createKey, deleteKey, listKeys, sessionCookie, type Env } from './auth'
import { cleanPath, extractHeadings, notePath, splitFrontmatter, titleOf } from './parse'
import {
  appendToNote,
  backlinks,
  ConflictError,
  createFolder,
  dailyNote,
  DEFAULT_DAILY,
  fillTemplate,
  findNote,
  freePath,
  getNote,
  getSetting,
  getVersion,
  graph,
  listFiles,
  listFolders,
  listNotes,
  listTemplates,
  moveFile,
  NotFoundError,
  TooLargeError,
  outgoingLinks,
  putFile,
  renameFolder,
  renameNote,
  restoreFile,
  restoreNote,
  saveNote,
  search,
  setSetting,
  suggestTitles,
  tagCounts,
  trashFile,
  trashFolder,
  trashNote,
  unlinkedMentions,
  versions,
  type Source,
} from './store'
import { guessType } from './mcp'
import { unzip, zip } from './zip'

const MAX_UPLOAD = 100 * 1024 * 1024

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function json<T>(request: Request): Promise<T> {
  try {
    const value = (await request.json()) as T
    if (!value || typeof value !== 'object') throw new Error()
    return value
  } catch {
    throw new HttpError(400, 'El cuerpo debe ser un objeto JSON.')
  }
}

const required = (v: unknown, name: string): string => {
  if (typeof v === 'string' && v.trim()) return v
  throw new HttpError(400, `Falta «${name}».`)
}

/** Settings the app keeps: bookmarks (paths), daily notes, the pinned startup note. */
type AppSettings = { bookmarks: string[]; daily: typeof DEFAULT_DAILY }

async function settings(db: D1Database): Promise<AppSettings> {
  return { bookmarks: await getSetting(db, 'bookmarks', [] as string[]), daily: await getSetting(db, 'daily', DEFAULT_DAILY) }
}

/**
 * Notes and files from a .zip (an Obsidian vault, or a GitHub archive whose
 * single top folder is dropped). Hidden folders (.obsidian, .git, .trash)
 * are left out. Identical notes and same-size files are skipped.
 */
async function importArchive(db: D1Database, files: R2Bucket, archive: Uint8Array, prefix: string, source: Source) {
  let entries = (await unzip(archive)).filter((e) => !e.path.split('/').some((p) => p.startsWith('.') || p === '__MACOSX'))
  const tops = new Set(entries.map((e) => e.path.split('/')[0]))
  if (tops.size === 1 && entries.every((e) => e.path.includes('/'))) entries = entries.map((e) => ({ ...e, path: e.path.slice(e.path.indexOf('/') + 1) }))
  const existingFiles = new Map((await listFiles(db)).map((f) => [f.path, f.size]))
  const dec = new TextDecoder()
  let created = 0
  let updated = 0
  let unchanged = 0
  let filesSaved = 0
  const failed: Array<{ path: string; error: string }> = []
  for (const e of entries) {
    const path = prefix ? `${prefix}/${e.path}` : e.path
    try {
      if (/\.md$/i.test(path)) {
        const content = dec.decode(e.data)
        const before = await getNote(db, path)
        if (before && !before.deleted_at && before.content === content) {
          unchanged++
          continue
        }
        await saveNote(db, path, content, { source: source === 'web' ? 'import' : source })
        if (before && !before.deleted_at) updated++
        else created++
      } else if (existingFiles.get(path) === e.data.byteLength) {
        unchanged++
      } else {
        await putFile(db, files, path, e.data.slice().buffer as ArrayBuffer, guessType(path), e.data.byteLength)
        filesSaved++
      }
    } catch (err) {
      failed.push({ path, error: (err as Error).message })
    }
  }
  return { created, updated, unchanged, files: filesSaved, failed }
}

/** A public GitHub repository's default branch, in one archive download (no API calls, so no API rate limit). */
async function importGithub(db: D1Database, files: R2Bucket, repo: string, prefix: string, source: Source) {
  const res = await fetch(`https://codeload.github.com/${repo}/zip/HEAD`, { headers: { 'user-agent': 'memoria-app' } })
  if (res.status === 404) throw new HttpError(404, `No encontré el repositorio público «${repo}».`)
  if (!res.ok) throw new HttpError(502, `GitHub respondió ${res.status}; prueba en unos minutos.`)
  const size = Number(res.headers.get('content-length') ?? 0)
  if (size > MAX_UPLOAD) throw new HttpError(413, 'El repositorio pasa de 100 MB.')
  return { repo, ...(await importArchive(db, files, new Uint8Array(await res.arrayBuffer()), prefix, source)) }
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const route = `${request.method} ${url.pathname}`
  const q = (k: string) => url.searchParams.get(k) ?? ''

  // Login does not need a session.
  if (route === 'GET /api/status') {
    return Response.json({ configured: configured(env), signedIn: Boolean(await authenticate(request, env)) })
  }
  if (route === 'POST /api/login') {
    const body = await json<{ password?: string }>(request)
    const result = await checkPassword(request, env, String(body.password ?? ''))
    if (result === 'unset') return Response.json({ error: 'Falta configurar la contraseña (MEMORIA_PASSWORD, mínimo 8 caracteres).' }, { status: 503 })
    if (result === 'locked') return Response.json({ error: 'Demasiados intentos. Espera 15 minutos.' }, { status: 429 })
    if (result === 'wrong') return Response.json({ error: 'Contraseña incorrecta.' }, { status: 401 })
    return Response.json({ ok: true }, { headers: { 'set-cookie': await sessionCookie(env) } })
  }
  if (route === 'POST /api/logout') return Response.json({ ok: true }, { headers: { 'set-cookie': clearCookie } })

  const caller = await authenticate(request, env)
  if (!caller) return Response.json({ error: 'Inicia sesión.' }, { status: 401 })
  const source: Source = caller.via === 'token' ? 'api' : 'web'
  const db = env.DB

  try {
    switch (route) {
      case 'GET /api/tree': {
        const [notes, folders, files, tags, s] = await Promise.all([listNotes(db), listFolders(db), listFiles(db), tagCounts(db), settings(db)])
        return Response.json({ notes, folders, files, tags, settings: s })
      }
      case 'GET /api/note': {
        const path = notePath(required(q('path'), 'path'))
        const note = await getNote(db, path)
        if (!note) throw new NotFoundError(`No existe la nota «${path}».`)
        const [back, out, mentions, hist] = await Promise.all([backlinks(db, path), outgoingLinks(db, path), unlinkedMentions(db, path), versions(db, path)])
        const { data } = splitFrontmatter(note.content)
        return Response.json({ note, properties: data, headings: extractHeadings(note.content), backlinks: back, outgoing: out, mentions, versions: hist.length })
      }
      case 'GET /api/resolve': {
        // A [[link]] clicked in the preview: the note it names, if any.
        const note = await findNote(db, required(q('name'), 'name'))
        return Response.json({ path: note?.path ?? null })
      }
      case 'PUT /api/note': {
        const body = await json<{ path?: string; content?: string; base_updated_at?: string | null }>(request)
        if (typeof body.content !== 'string') throw new HttpError(400, 'Falta «content».')
        const note = await saveNote(db, required(body.path, 'path'), body.content, { source, baseUpdatedAt: body.base_updated_at ?? null })
        return Response.json({ note })
      }
      case 'POST /api/note': {
        // A new note: a free name in the folder, optionally from a template.
        const body = await json<{ folder?: string; title?: string; template?: string; content?: string }>(request)
        const folder = body.folder ? cleanPath(body.folder) : ''
        const title = (body.title ?? '').trim() || 'Sin título'
        const path = await freePath(db, folder ? `${folder}/${title}` : title)
        let content = body.content ?? ''
        if (body.template) {
          const tpl = await findNote(db, body.template)
          if (!tpl) throw new NotFoundError(`No existe la plantilla «${body.template}».`)
          content = fillTemplate(tpl.content, titleOf(path))
        }
        const note = await saveNote(db, path, content, { source, createOnly: true })
        return Response.json({ note }, { status: 201 })
      }
      case 'POST /api/note/append': {
        const body = await json<{ path?: string; text?: string; heading?: string }>(request)
        const note = await appendToNote(db, required(body.path, 'path'), required(body.text, 'text'), { source, heading: body.heading })
        return Response.json({ note })
      }
      case 'DELETE /api/note': {
        await trashNote(db, required(q('path'), 'path'))
        return Response.json({ ok: true })
      }
      case 'POST /api/note/restore': {
        const body = await json<{ path?: string }>(request)
        return Response.json({ note: await restoreNote(db, required(body.path, 'path')) })
      }
      case 'POST /api/note/rename': {
        const body = await json<{ from?: string; to?: string }>(request)
        return Response.json(await renameNote(db, required(body.from, 'from'), required(body.to, 'to'), source))
      }
      case 'GET /api/search':
        return Response.json({ results: await search(db, q('q'), 100) })
      case 'GET /api/suggest':
        return Response.json({ results: await suggestTitles(db, q('q'), Number(q('limit')) || 20) })
      case 'GET /api/graph':
        return Response.json(await graph(db))
      case 'GET /api/versions':
        return Response.json({ versions: await versions(db, required(q('path'), 'path')) })
      case 'GET /api/version': {
        const v = await getVersion(db, Number(q('id')))
        if (!v) throw new NotFoundError('No existe esa versión.')
        return Response.json({ version: v })
      }
      case 'GET /api/trash': {
        const [notes, files] = await Promise.all([listNotes(db, { trash: true }), listFiles(db, { trash: true })])
        return Response.json({ notes, files })
      }
      case 'POST /api/folder': {
        const body = await json<{ path?: string }>(request)
        return Response.json({ path: await createFolder(db, required(body.path, 'path')) }, { status: 201 })
      }
      case 'POST /api/folder/rename': {
        const body = await json<{ from?: string; to?: string }>(request)
        return Response.json(await renameFolder(db, env.FILES, required(body.from, 'from'), required(body.to, 'to'), source))
      }
      case 'DELETE /api/folder':
        return Response.json(await trashFolder(db, required(q('path'), 'path')))
      case 'POST /api/daily': {
        const body = await json<{ date?: string }>(request).catch(() => ({}) as { date?: string })
        return Response.json({ note: await dailyNote(db, source, body.date) })
      }
      case 'GET /api/templates':
        return Response.json({ templates: await listTemplates(db) })
      case 'PUT /api/settings': {
        const body = await json<Partial<AppSettings>>(request)
        if (body.bookmarks) await setSetting(db, 'bookmarks', body.bookmarks.filter((b) => typeof b === 'string').slice(0, 500))
        if (body.daily) await setSetting(db, 'daily', { folder: String(body.daily.folder ?? 'Diario'), template: body.daily.template ? String(body.daily.template) : null })
        return Response.json({ settings: await settings(db) })
      }
      case 'POST /api/file': {
        const path = cleanPath(required(q('path'), 'path'))
        const size = Number(request.headers.get('content-length') ?? 0)
        if (!request.body) throw new HttpError(400, 'El archivo está vacío.')
        if (size > MAX_UPLOAD) throw new HttpError(413, 'El archivo pasa de 100 MB.')
        const body = size ? request.body : await request.arrayBuffer()
        const bytes = size || (body as ArrayBuffer).byteLength
        const type = request.headers.get('content-type') || guessType(path)
        return Response.json({ file: await putFile(db, env.FILES, path, body, type, bytes) }, { status: 201 })
      }
      case 'GET /api/file': {
        const path = cleanPath(required(q('path'), 'path'))
        const meta = await db.prepare('SELECT content_type FROM files WHERE path = ?').bind(path).first<{ content_type: string }>()
        const obj = meta ? await env.FILES.get(path, { range: request.headers }) : null
        if (!obj || !meta) throw new NotFoundError(`No existe el archivo «${path}».`)
        const headers = new Headers({
          'content-type': meta.content_type,
          'cache-control': 'private, max-age=300',
          'accept-ranges': 'bytes',
          // Shown, never run as a page of this site.
          'content-security-policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
          'x-content-type-options': 'nosniff',
          'content-disposition': `${q('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(path.split('/').pop()!)}`,
        })
        const r = (obj as R2ObjectBody).range as { offset?: number; length?: number } | undefined
        if (request.headers.has('range') && r && r.offset !== undefined) {
          const length = r.length ?? obj.size - r.offset
          headers.set('content-range', `bytes ${r.offset}-${r.offset + length - 1}/${obj.size}`)
          headers.set('content-length', String(length))
          return new Response((obj as R2ObjectBody).body, { status: 206, headers })
        }
        headers.set('content-length', String(obj.size))
        return new Response((obj as R2ObjectBody).body, { headers })
      }
      case 'DELETE /api/file':
        await trashFile(db, required(q('path'), 'path'))
        return Response.json({ ok: true })
      case 'POST /api/file/restore': {
        const body = await json<{ path?: string }>(request)
        await restoreFile(db, required(body.path, 'path'))
        return Response.json({ ok: true })
      }
      case 'POST /api/file/rename': {
        const body = await json<{ from?: string; to?: string }>(request)
        await moveFile(db, env.FILES, required(body.from, 'from'), required(body.to, 'to'))
        return Response.json({ ok: true })
      }
      case 'GET /api/keys': {
        // Only the signed-in owner manages keys, never a key itself.
        if (caller.via !== 'cookie') throw new HttpError(403, 'Las claves se gestionan desde la app.')
        return Response.json({ keys: (await listKeys(db)).map(({ hash: _h, ...k }) => k) })
      }
      case 'POST /api/keys': {
        if (caller.via !== 'cookie') throw new HttpError(403, 'Las claves se gestionan desde la app.')
        const body = await json<{ name?: string }>(request)
        return Response.json(await createKey(db, String(body.name ?? '')), { status: 201 })
      }
      case 'DELETE /api/keys': {
        if (caller.via !== 'cookie') throw new HttpError(403, 'Las claves se gestionan desde la app.')
        if (!(await deleteKey(db, required(q('id'), 'id')))) throw new NotFoundError('No existe esa clave.')
        return Response.json({ ok: true })
      }
      case 'POST /api/import/github': {
        // A public GitHub repository (an Obsidian vault): its notes and files.
        if (caller.via !== 'cookie') throw new HttpError(403, 'Se importa desde la app.')
        const body = await json<{ repo?: string; prefix?: string }>(request)
        const repo = required(body.repo, 'repo').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$|\/+$/g, '')
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new HttpError(400, 'Escribe el repositorio como «usuario/nombre».')
        return Response.json(await importGithub(db, env.FILES, repo, body.prefix ? cleanPath(body.prefix) : '', source))
      }
      case 'POST /api/import/zip': {
        // A zipped vault, uploaded as the request body.
        const size = Number(request.headers.get('content-length') ?? 0)
        if (size > MAX_UPLOAD) throw new HttpError(413, 'El .zip pasa de 100 MB.')
        const prefix = q('prefix') ? cleanPath(q('prefix')) : ''
        try {
          return Response.json(await importArchive(db, env.FILES, new Uint8Array(await request.arrayBuffer()), prefix, source))
        } catch (err) {
          if (/zip|compresión|máximo/.test((err as Error).message)) throw new HttpError(400, (err as Error).message)
          throw err
        }
      }
      case 'POST /api/import': {
        // Notes from an Obsidian vault or another app. Identical notes are
        // skipped; different ones replace the current content, which stays
        // in the history.
        const body = await json<{ notes?: Array<{ path?: string; content?: string }> }>(request)
        const list = Array.isArray(body.notes) ? body.notes.slice(0, 2000) : []
        let created = 0
        let updated = 0
        let unchanged = 0
        const failed: Array<{ path: string; error: string }> = []
        for (const n of list) {
          try {
            const path = notePath(required(n.path, 'path'))
            if (typeof n.content !== 'string') throw new Error('sin contenido')
            const before = await getNote(db, path)
            if (before && !before.deleted_at && before.content === n.content) {
              unchanged++
              continue
            }
            await saveNote(db, path, n.content, { source: caller.via === 'token' ? 'api' : 'import' })
            if (before && !before.deleted_at) updated++
            else created++
          } catch (err) {
            failed.push({ path: String(n.path), error: (err as Error).message })
          }
        }
        return Response.json({ created, updated, unchanged, failed })
      }
      case 'GET /api/export': {
        // Every note as an Obsidian vault in a .zip (attachments up to 50 MB in total).
        const { results } = await db.prepare('SELECT path, content, updated_at FROM notes WHERE deleted_at IS NULL').all<{ path: string; content: string; updated_at: string }>()
        const enc = new TextEncoder()
        const entries = results.map((n) => ({ path: n.path, data: enc.encode(n.content), modified: new Date(n.updated_at) }))
        let budget = 50 * 1024 * 1024
        const skipped: string[] = []
        for (const f of await listFiles(db)) {
          if (f.size > budget) {
            skipped.push(f.path)
            continue
          }
          const obj = await env.FILES.get(f.path)
          if (!obj) continue
          entries.push({ path: f.path, data: new Uint8Array(await obj.arrayBuffer()), modified: new Date(f.uploaded_at) })
          budget -= f.size
        }
        if (skipped.length) entries.push({ path: 'ARCHIVOS-NO-INCLUIDOS.txt', data: enc.encode(`Estos archivos no caben en el .zip; descárgalos desde la app:\n${skipped.join('\n')}\n`), modified: new Date() })
        const date = new Date().toISOString().slice(0, 10)
        return new Response(zip(entries), { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="memoria-${date}.zip"` } })
      }
      default:
        return Response.json({ error: 'No existe esa ruta.' }, { status: 404 })
    }
  } catch (err) {
    if (err instanceof ConflictError) return Response.json({ error: err.message, current: err.current ?? null }, { status: 409 })
    const status = err instanceof HttpError ? err.status : err instanceof NotFoundError ? 404 : err instanceof TooLargeError ? 413 : /no válida|vacía|no permitidos|se guardan como notas/.test((err as Error).message) ? 400 : 500
    if (status === 500) console.error(err)
    return Response.json({ error: (err as Error).message }, { status })
  }
}

