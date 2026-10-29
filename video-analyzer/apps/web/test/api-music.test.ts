// Route handlers of /api/music/** against a temporary database and DATA_DIR,
// with fake sources: nothing here touches the internet.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = mkdtempSync(path.join(tmpdir(), 'web-api-music-'))
process.env.DATA_DIR = root
process.env.SQLITE_PATH = path.join(root, 'db', 'app.sqlite')

const MP3 = Buffer.concat([Buffer.from('ID3\x04\0\0\0\0\0\0'), Buffer.alloc(3000, 7)])
let fetched: string[] = []
const fakeFetch = (async (url: string | URL) => {
  fetched.push(String(url))
  return new Response(String(url).includes('page') ? '<html>no</html>' : MP3, { headers: { 'content-length': String(MP3.length) } })
}) as typeof fetch

type Lib = typeof import('../src/lib/music')
let lib: Lib
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const get = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init)
const post = (body: unknown) => new Request('http://localhost/api/music', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

before(async () => {
  const me = await import('@cva/memory-engine')
  me.migrate()
  lib = await import('../src/lib/music')
  const { parseLicense } = await import('@cva/music')
  const mk = (sourceId: string, license: string, audioUrl: string) => ({
    source: 'jamendo' as const, sourceId, title: `Pieza ${sourceId}`, artist: 'Dee', license: parseLicense(license), durationSec: 90, audioUrl, pageUrl: 'https://j.test/' + sourceId, tags: ['piano'], verified: false,
  })
  const tracks = [
    mk('1', 'https://creativecommons.org/licenses/by/4.0/', 'https://cdn.example.com/a.mp3'),
    mk('2', 'https://creativecommons.org/licenses/by-nc/4.0/', 'https://cdn.example.com/b.mp3'),
    mk('3', 'cc0', 'https://cdn.example.com/page.mp3'),
    mk('4', 'cc0', 'http://127.0.0.1/secret.mp3'),
  ]
  lib.useMusicSourcesForTest({
    fetch: fakeFetch,
    sources: [{
      id: 'jamendo', label: 'Fake', unavailable: () => null,
      search: async (q) => (q === 'falla' ? Promise.reject(new Error('caído')) : tracks),
      resolve: async (id) => tracks.find((t) => t.sourceId === id) ?? null,
    }, {
      id: 'openverse', label: 'Sin clave', unavailable: () => 'Falta la clave.', search: async () => [], resolve: async () => null,
    }],
  })
})

test('search lists tracks with verdict and credit, and reports sources that cannot run', async () => {
  const { GET } = await import('../src/app/api/music/search/route')
  const res = await GET(get('/api/music/search?q=piano'))
  const body = await res.json()
  assert.equal(body.tracks.length, 4)
  const t1 = body.tracks[0]
  assert.deepEqual([t1.verdict, t1.license.label, t1.saved], ['ok', 'CC BY 4.0', null])
  assert.match(t1.credit, /Pieza 1.*CC BY 4\.0/)
  assert.equal(body.tracks[1].verdict, 'refused')
  assert.deepEqual(body.problems.map((p: { source: string }) => p.source), ['openverse'])
  assert.equal((await GET(get('/api/music/search'))).status, 400)
  const only = await (await GET(get('/api/music/search?q=piano&sources=jamendo'))).json()
  assert.equal(only.problems.length, 0)
})

test('saving downloads the audio, keeps the licence, and is served with Range support', async () => {
  const { POST, GET } = await import('../src/app/api/music/route')
  const res = await POST(post({ source: 'jamendo', sourceId: '1' }))
  assert.equal(res.status, 201)
  const { track } = await res.json()
  assert.deepEqual([track.title, track.license.code, track.verified, track.sizeBytes], ['Pieza 1', 'by', false, MP3.length])
  assert.match(track.credit, /CC BY 4\.0/)
  assert.deepEqual(fetched, ['https://cdn.example.com/a.mp3'])

  const list = await (await GET()).json()
  assert.equal(list.tracks.length, 1)

  const file = await import('../src/app/api/music/[id]/file/route')
  const full = await file.GET(get(`/api/music/${track.id}/file`), ctx(track.id))
  assert.deepEqual([full.status, full.headers.get('content-type')], [200, 'audio/mpeg'])
  assert.equal(Buffer.from(await full.arrayBuffer()).length, MP3.length)
  const part = await file.GET(get(`/api/music/${track.id}/file`, { headers: { range: 'bytes=0-9' } }), ctx(track.id))
  assert.deepEqual([part.status, part.headers.get('content-range')], [206, `bytes 0-9/${MP3.length}`])
  assert.equal((await file.GET(get('/api/music/x/file'), ctx('x'))).status, 404)

  // Saving again replaces the row, it does not duplicate it.
  await POST(post({ source: 'jamendo', sourceId: '1' }))
  assert.equal((await (await GET()).json()).tracks.length, 1)
  const search = await (await (await import('../src/app/api/music/search/route')).GET(get('/api/music/search?q=piano'))).json()
  assert.equal(search.tracks[0].saved.id, track.id)
})

test('saving refuses what the source does not allow, leaving nothing behind', async () => {
  const { POST, GET } = await import('../src/app/api/music/route')
  fetched = []
  const cases: [unknown, number, RegExp][] = [
    [{ source: 'jamendo', sourceId: '2' }, 422, /no permite uso comercial/],
    [{ source: 'jamendo', sourceId: '3' }, 502, /no es audio/],
    [{ source: 'jamendo', sourceId: '4' }, 502, /https/],
    [{ source: 'jamendo', sourceId: '99' }, 404, /ya no está/],
    [{ source: 'openverse', sourceId: 'x' }, 400, /Falta la clave/],
    [{ source: 'nada', sourceId: 'x' }, 400, /Fuente desconocida/],
    [{ source: 'jamendo' }, 400, /Faltan/],
    [{ source: 7, sourceId: 1 }, 400, /Faltan/],
  ]
  for (const [body, status, msg] of cases) {
    const res = await POST(post(body))
    const json = await res.json()
    assert.equal(res.status, status, JSON.stringify(body))
    assert.match(json.error, msg)
  }
  // A forged request cannot choose the address: only the permitted track's own URL was fetched.
  assert.deepEqual(fetched, ['https://cdn.example.com/page.mp3'])
  assert.equal((await (await GET()).json()).tracks.length, 1)
})

test('deleting removes the row and its folder', async () => {
  const { GET } = await import('../src/app/api/music/route')
  const del = await import('../src/app/api/music/[id]/route')
  const [t] = (await (await GET()).json()).tracks
  const dir = path.join(lib.MUSIC_DIR, t.id)
  assert.ok(existsSync(dir))
  assert.equal((await del.DELETE(get('/x', { method: 'DELETE' }), ctx(t.id))).status, 200)
  assert.ok(!existsSync(dir))
  assert.equal((await del.DELETE(get('/x', { method: 'DELETE' }), ctx(t.id))).status, 404)
  assert.equal((await del.DELETE(get('/x', { method: 'DELETE' }), ctx('../../db'))).status, 404)
})
