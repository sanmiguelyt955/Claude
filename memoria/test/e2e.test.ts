// Against a running server: MEMORIA_URL=http://127.0.0.1:8787 MEMORIA_PASSWORD=… MEMORIA_API_TOKEN=…
// (wrangler dev with a fresh local database). Skipped when MEMORIA_URL is not set.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BASE = process.env.MEMORIA_URL
const PASSWORD = process.env.MEMORIA_PASSWORD ?? ''
const TOKEN = process.env.MEMORIA_API_TOKEN ?? ''
const skip = !BASE
const run = `e2e-${Date.now()}`

let cookie = ''
async function api(method: string, p: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any; res: Response }> {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}), origin: BASE!, ...headers },
    body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
    redirect: 'manual',
  })
  const type = res.headers.get('content-type') ?? ''
  return { status: res.status, json: type.includes('json') ? await res.json() : null, res }
}

test('login: wrong password refused, right one gives a session; nothing without it', { skip }, async () => {
  assert.equal((await api('GET', '/api/tree')).status, 401)
  assert.equal((await api('POST', '/api/login', { password: 'mala' })).status, 401)
  const ok = await api('POST', '/api/login', { password: PASSWORD })
  assert.equal(ok.status, 200)
  cookie = ok.res.headers.get('set-cookie')!.split(';')[0]!
  assert.equal((await api('GET', '/api/tree')).status, 200)
  // Another site cannot use the session to change anything.
  assert.equal((await api('PUT', '/api/note', { path: `${run}/x`, content: 'x' }, { origin: 'https://otro.example' })).status, 401)
  // The API token works without a cookie; a wrong one does not.
  const saved = cookie
  cookie = ''
  assert.equal((await api('GET', '/api/tree', undefined, { authorization: `Bearer ${TOKEN}` })).status, 200)
  assert.equal((await api('GET', '/api/tree', undefined, { authorization: 'Bearer no-es-el-token-correcto' })).status, 401)
  cookie = saved
})

test('notes, links, backlinks, rename that fixes links, search, versions, conflict, trash', { skip }, async () => {
  const VA = `Video Analyzer ${run}`
  const a = `${run}/Proyectos/${VA}`
  const b = `${run}/Diario de prueba`
  assert.equal((await api('PUT', '/api/note', { path: a, content: `---\ntags: [proyecto]\n---\n# ${VA}\nAnaliza videos con impresión 3D. #app\n` })).status, 200)
  const put = await api('PUT', '/api/note', { path: b, content: `Hoy trabajé en [[${VA}]] y en [[${VA}#Pendiente|lo pendiente]]. También [[Nota que no existe]].\n${VA} sin enlace.` })
  assert.equal(put.status, 200)
  const note = await api('GET', `/api/note?path=${encodeURIComponent(a)}`)
  assert.deepEqual(note.json.backlinks.map((x: any) => x.path), [`${b}.md`])
  assert.match(note.json.backlinks[0].context, /Hoy trabajé/)
  assert.deepEqual(note.json.properties, { tags: ['proyecto'] })
  const out = await api('GET', `/api/note?path=${encodeURIComponent(b)}`)
  assert.deepEqual(out.json.outgoing.map((o: any) => [o.target, o.path]), [[VA, `${a}.md`], ['Nota que no existe', null]])

  // Search: word start, accents ignored, tag operator.
  const s1 = await api('GET', `/api/search?q=${encodeURIComponent('impresion')}`)
  assert.ok(s1.json.results.some((r: any) => r.path === `${a}.md`), JSON.stringify(s1.json))
  const s2 = await api('GET', `/api/search?q=${encodeURIComponent('tag:proyecto')}`)
  assert.deepEqual(s2.json.results.map((r: any) => r.path).filter((p: string) => p.startsWith(run)), [`${a}.md`])
  const s3 = await api('GET', `/api/search?q=${encodeURIComponent('trabaj -impresion')}`)
  assert.deepEqual(s3.json.results.map((r: any) => r.path).filter((p: string) => p.startsWith(run)), [`${b}.md`])

  // Rename: the link in the other note follows, alias and heading kept.
  const ren = await api('POST', '/api/note/rename', { from: a, to: `${run}/Archivo/VA ${run}` })
  assert.equal(ren.status, 200)
  assert.deepEqual(ren.json.updatedLinks, [`${b}.md`])
  const after = await api('GET', `/api/note?path=${encodeURIComponent(b)}`)
  assert.ok(after.json.note.content.includes(`[[VA ${run}]] y en [[VA ${run}#Pendiente|lo pendiente]]`), after.json.note.content)
  assert.equal(after.json.versions, 1, 'the linking note kept its previous content')

  // Conflict: an edit based on an old version is refused with the current one.
  const fresh = after.json.note
  assert.equal((await api('PUT', '/api/note', { path: b, content: 'edición A', base_updated_at: fresh.updated_at })).status, 200)
  const conflict = await api('PUT', '/api/note', { path: b, content: 'edición B', base_updated_at: fresh.updated_at })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.json.current.content, 'edición A')

  // History: every earlier content can be read back.
  const versions = await api('GET', `/api/versions?path=${encodeURIComponent(b)}`)
  assert.ok(versions.json.versions.length >= 1)
  const v = await api('GET', `/api/version?id=${versions.json.versions.at(-1).id}`)
  assert.ok(v.json.version.content.includes(`Hoy trabajé en [[${VA}]]`), v.json.version.content)

  // Trash and back.
  assert.equal((await api('DELETE', `/api/note?path=${encodeURIComponent(b)}`)).status, 200)
  assert.equal((await api('GET', '/api/trash')).json.notes.some((n: any) => n.path === `${b}.md`), true)
  assert.equal((await api('GET', `/api/search?q=${encodeURIComponent('edición')}`)).json.results.some((r: any) => r.path === `${b}.md`), false, 'trashed notes are not found')
  assert.equal((await api('POST', '/api/note/restore', { path: b })).status, 200)
  assert.equal((await api('GET', `/api/search?q=${encodeURIComponent('edición')}`)).json.results.some((r: any) => r.path === `${b}.md`), true)
})

test('new notes get free names; templates and daily notes; folders move with their notes', { skip }, async () => {
  const one = await api('POST', '/api/note', { folder: `${run}/Nuevas`, title: 'Idea' })
  const two = await api('POST', '/api/note', { folder: `${run}/Nuevas`, title: 'Idea' })
  assert.deepEqual([one.json.note.path, two.json.note.path], [`${run}/Nuevas/Idea.md`, `${run}/Nuevas/Idea 1.md`])
  await api('PUT', '/api/note', { path: `Plantillas/${run} Reunión`, content: '# {{title}}\nFecha: {{date}}\n' })
  const fromTpl = await api('POST', '/api/note', { folder: `${run}/Nuevas`, title: 'Lunes', template: `Plantillas/${run} Reunión` })
  assert.match(fromTpl.json.note.content, /^# Lunes\nFecha: \d{4}-\d{2}-\d{2}\n$/)
  const daily = await api('POST', '/api/daily', { date: '2031-01-02' })
  assert.equal(daily.json.note.path, 'Diario/2031-01-02.md')
  assert.equal((await api('POST', '/api/daily', { date: '2031-01-02' })).json.note.created_at, daily.json.note.created_at, 'the same note the second time')
  await api('POST', '/api/folder', { path: `${run}/Vacía` })
  const tree = await api('GET', '/api/tree')
  assert.ok(tree.json.folders.includes(`${run}/Vacía`))
  const moved = await api('POST', '/api/folder/rename', { from: `${run}/Nuevas`, to: `${run}/Ideas` })
  assert.equal(moved.json.moved, 3)
  assert.equal((await api('GET', `/api/note?path=${encodeURIComponent(`${run}/Ideas/Idea 1`)}`)).status, 200)
})

test('files: upload, read whole and by range, replace keeps the old one, trash; links to them are not missing notes', { skip }, async () => {
  const bytes = new Uint8Array(Array.from({ length: 5000 }, (_, i) => i % 251))
  const up = await api('POST', `/api/file?path=${encodeURIComponent(`${run}/Adjuntos/datos.bin`)}`, bytes, { 'content-type': 'application/octet-stream' })
  assert.equal(up.status, 201)
  const whole = await fetch(`${BASE}/api/file?path=${encodeURIComponent(`${run}/Adjuntos/datos.bin`)}`, { headers: { cookie } })
  assert.deepEqual(new Uint8Array(await whole.arrayBuffer()), bytes)
  const part = await fetch(`${BASE}/api/file?path=${encodeURIComponent(`${run}/Adjuntos/datos.bin`)}`, { headers: { cookie, range: 'bytes=10-19' } })
  assert.equal(part.status, 206)
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), bytes.slice(10, 20))
  assert.equal((await api('POST', `/api/file?path=${encodeURIComponent(`${run}/x.md`)}`, bytes)).status, 400, '.md goes as a note')
  await api('PUT', '/api/note', { path: `${run}/Con adjunto`, content: '![[datos.bin]]' })
  const g = await api('GET', '/api/graph')
  assert.equal(g.json.unresolved.some((u: any) => u.target === 'datos.bin'), false)
  const out = await api('GET', `/api/note?path=${encodeURIComponent(`${run}/Con adjunto`)}`)
  assert.equal(out.json.outgoing[0].path, `${run}/Adjuntos/datos.bin`)
  assert.equal((await api('DELETE', `/api/file?path=${encodeURIComponent(`${run}/Adjuntos/datos.bin`)}`)).status, 200)
  assert.equal((await api('GET', '/api/trash')).json.files.some((f: any) => f.path === `${run}/Adjuntos/datos.bin`), true)
})

test('import skips identical notes and keeps replaced ones in the history; export is a valid zip', { skip }, async () => {
  const notes = [
    { path: `${run}/Importadas/Uno.md`, content: 'uno [[Dos]]' },
    { path: `${run}/Importadas/Dos.md`, content: 'dos' },
  ]
  assert.deepEqual((await api('POST', '/api/import', { notes })).json, { created: 2, updated: 0, unchanged: 0, failed: [] })
  assert.deepEqual((await api('POST', '/api/import', { notes: [...notes.slice(0, 1), { ...notes[1]!, content: 'dos v2' }, { path: '../fuera', content: 'x' }] })).json, {
    created: 0,
    updated: 1,
    unchanged: 1,
    failed: [{ path: '../fuera', error: 'Ruta no válida: ../fuera' }],
  })
  const res = await fetch(`${BASE}/api/export`, { headers: { cookie } })
  assert.equal(res.headers.get('content-type'), 'application/zip')
  const dir = mkdtempSync(path.join(tmpdir(), 'memoria-zip-'))
  writeFileSync(path.join(dir, 'm.zip'), new Uint8Array(await res.arrayBuffer()))
  const listing = execFileSync('unzip', ['-l', path.join(dir, 'm.zip')], { encoding: 'utf8' })
  assert.match(listing, new RegExp(`${run}/Importadas/Uno\\.md`))
  execFileSync('unzip', ['-tq', path.join(dir, 'm.zip')])
})

// ── MCP through OAuth, the way claude.ai connects ──────────────────────────

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function oauthToken(): Promise<string> {
  const redirect = 'https://claude.ai/api/mcp/auth_callback'
  const reg = await fetch(`${BASE}/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect], token_endpoint_auth_method: 'none' }) })
  assert.equal(reg.status, 201)
  const client = (await reg.json()) as { client_id: string }
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const q = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'memoria', resource: `${BASE}/mcp` })
  const page = await fetch(`${BASE}/authorize?${q}`, { redirect: 'manual' })
  assert.equal(page.status, 200)
  assert.match(await page.text(), /<strong>Claude<\/strong> quiere leer y escribir/)
  const wrong = await fetch(`${BASE}/authorize?${q}`, { method: 'POST', body: new URLSearchParams({ password: 'mala' }), redirect: 'manual' })
  assert.equal(wrong.status, 401)
  const ok = await fetch(`${BASE}/authorize?${q}`, { method: 'POST', body: new URLSearchParams({ password: PASSWORD }), redirect: 'manual' })
  assert.equal(ok.status, 302)
  const back = new URL(ok.headers.get('location')!)
  assert.equal(back.searchParams.get('state'), 'xyz')
  const tok = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', code: back.searchParams.get('code')!, redirect_uri: redirect, client_id: client.client_id, code_verifier: verifier, resource: `${BASE}/mcp` }),
  })
  assert.equal(tok.status, 200, await tok.clone().text())
  return ((await tok.json()) as { access_token: string }).access_token
}

async function rpc(token: string, method: string, params?: unknown, id: number | null = 1): Promise<any> {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params }),
  })
  if (res.status === 202) return null
  return res.json()
}

test('MCP: no token, no access; with OAuth it lists and runs the tools', { skip }, async () => {
  const anon = await fetch(`${BASE}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  assert.equal(anon.status, 401)
  assert.match(anon.headers.get('www-authenticate') ?? '', /resource_metadata/)
  const meta = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`)).json() as { resource: string }
  assert.equal(meta.resource, `${BASE}/mcp`)

  const token = await oauthToken()
  const init = await rpc(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
  assert.equal(init.result.serverInfo.name, 'memoria')
  assert.match(init.result.instructions, /memoria_contexto/)
  assert.equal(await rpc(token, 'notifications/initialized', undefined, null), null)
  const tools = await rpc(token, 'tools/list')
  assert.ok(tools.result.tools.length >= 12)
  const call = async (name: string, args: Record<string, unknown>) => (await rpc(token, 'tools/call', { name, arguments: args })).result

  const wrote = await call('escribir_nota', { nota: `${run}/MCP/Decisión`, contenido: '# Decisión\nUsar Cloudflare. #decision' })
  assert.match(wrote.content[0].text, /Guardada/)
  assert.match((await call('agregar_a_nota', { nota: `${run}/MCP/Decisión`, texto: '- motivo: gratis y siempre encendido', seccion: 'Por qué' })).content[0].text, /Añadido/)
  const read = await call('leer_nota', { nota: 'Decisión' })
  assert.match(read.content[0].text, /## Por qué\n\n- motivo: gratis y siempre encendido/)
  assert.match((await call('recordar', { texto: `prueba ${run}` })).content[0].text, /Recordado en Diario\//)
  assert.match((await call('buscar', { consulta: 'cloudflare' })).content[0].text, new RegExp(`${run}/MCP/Decisión.md`))
  assert.match((await call('memoria_contexto', {})).content[0].text, /Notas cambiadas hace poco/)
  assert.match((await call('subir_archivo', { ruta: `${run}/MCP/hola.txt`, base64: Buffer.from('hola').toString('base64') })).content[0].text, /Guardado/)
  const stale = await call('escribir_nota', { nota: `${run}/MCP/Decisión`, contenido: 'x', version_base: '2000-01-01T00:00:00.000Z' })
  assert.equal(stale.isError, true)
  assert.match((await call('historial_nota', { nota: `${run}/MCP/Decisión` })).content[0].text, /id \d+/)
  assert.equal((await call('leer_nota', { nota: 'No existe nada así' })).isError, true)
  assert.equal((await rpc(token, 'metodo/raro')).error.code, -32601)
})

test('access keys made in the app: shown once, work as Bearer, cannot manage keys, stop working when deleted', { skip }, async () => {
  const made = await api('POST', '/api/keys', { name: 'Video Analyzer' })
  assert.equal(made.status, 201)
  const key = made.json.key as string
  assert.match(key, /^mem_[\w-]{32}$/)
  const listed = await api('GET', '/api/keys')
  const mine = listed.json.keys.find((k: any) => k.id === made.json.info.id)
  assert.equal(mine.hint, key.slice(-4))
  assert.ok(!JSON.stringify(listed.json).includes(key), 'the full key is never listed again')
  const saved = cookie
  cookie = ''
  try {
    assert.equal((await api('GET', '/api/tree', undefined, { authorization: `Bearer ${key}` })).status, 200)
    assert.equal((await api('POST', '/api/keys', { name: 'otra' }, { authorization: `Bearer ${key}` })).status, 403)
    assert.equal((await api('GET', '/api/tree', undefined, { authorization: `Bearer ${key}x` })).status, 401)
  } finally {
    cookie = saved
  }
  assert.equal((await api('DELETE', `/api/keys?id=${made.json.info.id}`)).status, 200)
  cookie = ''
  try {
    assert.equal((await api('GET', '/api/tree', undefined, { authorization: `Bearer ${key}` })).status, 401)
  } finally {
    cookie = saved
  }
})

test('a note over 1.8 MB is refused with a clear message, not cut', { skip }, async () => {
  const big = 'x'.repeat(1_900_000)
  const r = await api('PUT', '/api/note', { path: `${run}/Grande`, content: big })
  assert.equal(r.status, 413)
  assert.match(r.json.error, /pesa 1\.9 MB y el máximo es 1\.8 MB/)
  const imp = await api('POST', '/api/import', { notes: [{ path: `${run}/Grande`, content: big }] })
  assert.match(imp.json.failed[0].error, /divídela/)
})

test('a zipped vault imports with its folders; its single top folder is dropped; hidden folders stay out', { skip }, async () => {
  const { zip } = await import('../src/zip.ts')
  const e = (p: string, s: string) => ({ path: p, data: new TextEncoder().encode(s) })
  const archive = zip([e(`boveda/${run}/Z/Uno.md`, `uno [[Dos ${run}]]`), e(`boveda/${run}/Z/Dos ${run}.md`, 'dos'), e(`boveda/.obsidian/app.json`, '{}'), e(`boveda/${run}/Z/datos.txt`, 'hola')])
  const r = await api('POST', '/api/import/zip', archive, { 'content-type': 'application/zip' })
  assert.deepEqual(r.json, { created: 2, updated: 0, unchanged: 0, files: 1, failed: [] })
  assert.equal((await api('GET', `/api/note?path=${encodeURIComponent(`${run}/Z/Uno`)}`)).json.outgoing[0].path, `${run}/Z/Dos ${run}.md`)
  assert.equal((await api('GET', '/api/tree')).json.files.some((f: any) => f.path.startsWith('.obsidian')), false)
})
