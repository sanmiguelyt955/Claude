import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertPublicHttps, createSources, creditText, downloadTrack, licenseLabel, parseLicense, searchAll, sniffAudio, verdict } from '../src/index.ts'
import type { Track } from '../src/index.ts'

test('licences: commercial ones pass, NC / ND / unknown are refused, BY-SA warns', () => {
  const v = (s: string) => verdict(parseLicense(s))
  assert.equal(v('http://creativecommons.org/licenses/by/4.0/'), 'ok')
  assert.equal(v('https://creativecommons.org/publicdomain/zero/1.0/'), 'ok')
  assert.equal(v('https://creativecommons.org/publicdomain/mark/1.0/'), 'ok')
  assert.equal(v('cc0'), 'ok')
  assert.equal(v('by'), 'ok')
  assert.equal(v('https://creativecommons.org/licenses/by-sa/3.0/'), 'warn')
  assert.equal(v('https://creativecommons.org/licenses/by-nc/4.0/'), 'refused')
  assert.equal(v('https://creativecommons.org/licenses/by-nc-sa/3.0/'), 'refused')
  assert.equal(v('https://creativecommons.org/licenses/by-nd/2.0/'), 'refused')
  assert.equal(v('All rights reserved'), 'refused')
  assert.equal(v(''), 'refused')
  assert.equal(parseLicense('https://creativecommons.org/licenses/by/4.0/').version, '4.0')
  assert.equal(licenseLabel(parseLicense('by-sa', '3.0')), 'CC BY-SA 3.0')
})

test('credit text: required for BY, empty for CC0', () => {
  const t = { title: 'The Britons', artist: 'Kevin MacLeod (incompetech.com)', pageUrl: null, license: parseLicense('https://creativecommons.org/licenses/by/4.0/') }
  assert.equal(creditText(t), '"The Britons" Kevin MacLeod (incompetech.com). Licencia: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/')
  assert.equal(creditText({ ...t, license: parseLicense('cc0') }), '')
})

test('audio is recognised by its first bytes, not by its name', () => {
  assert.equal(sniffAudio(Buffer.from('ID3\x04\0\0'))?.ext, '.mp3')
  assert.equal(sniffAudio(Uint8Array.from([0xff, 0xfb, 0x90, 0]))?.ext, '.mp3')
  assert.equal(sniffAudio(Buffer.from('OggS\0'))?.ext, '.ogg')
  assert.equal(sniffAudio(Buffer.from('<html><body>'))?.ext, undefined)
})

test('only public https addresses are fetched', () => {
  assert.throws(() => assertPublicHttps('http://archive.org/a.mp3'), /https/)
  for (const bad of ['https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://intranet/a', 'https://x.internal/a']) {
    assert.throws(() => assertPublicHttps(bad), /no permitida/, bad)
  }
  assert.equal(assertPublicHttps('https://archive.org/download/a/b.mp3').hostname, 'archive.org')
})

// ── A fake of the four sources on a local server ──────────────────────────
const MP3 = Buffer.concat([Buffer.from('ID3\x04\0\0\0\0\0\0'), Buffer.alloc(2000, 1)])
let server: http.Server
let base = ''
let jamendoCalls: string[] = []

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const json = (o: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(o))
    }
    if (url.pathname === '/advancedsearch.php') {
      return json({ response: { docs: [
        { identifier: 'good-by', licenseurl: 'http://creativecommons.org/licenses/by/3.0/' },
        { identifier: 'bad-nc', licenseurl: 'http://creativecommons.org/licenses/by-nc/3.0/' },
        { identifier: 'no-audio', licenseurl: 'https://creativecommons.org/licenses/by/4.0/' },
      ] } })
    }
    if (url.pathname === '/metadata/good-by') {
      return json({ metadata: { identifier: 'good-by', title: 'Lluvia', creator: ['Ana'], licenseurl: 'http://creativecommons.org/licenses/by/3.0/' },
        files: [{ name: 'x_spectrogram.png', format: 'PNG' }, { name: 'a.ogg', format: 'Ogg Vorbis', length: '61' }, { name: 'a.mp3', format: 'VBR MP3', length: '02:05' }] })
    }
    if (url.pathname === '/metadata/no-audio') return json({ metadata: { identifier: 'no-audio', licenseurl: 'https://creativecommons.org/licenses/by/4.0/' }, files: [{ name: 'a.png', format: 'PNG' }] })
    if (url.pathname === '/metadata/bad-nc') return json({}, 500)
    if (url.pathname === '/music/royalty-free/pieces.json') {
      return json([
        { title: 'The Britons', filename: 'The Britons.mp3', length: '00:05:07', instruments: 'Lute, Flute', feel: 'Ren Faire, Medieval', description: 'Tavern music' },
        { title: 'Rain Dance', filename: 'Rain Dance.mp3', length: '00:02:00', instruments: 'Drums', feel: 'Tribal', description: 'medieval drums' },
        { title: 'Other', filename: 'Other.mp3', length: '00:01:00', instruments: 'Piano', feel: 'Calm', description: '' },
      ])
    }
    if (url.pathname === '/v1/audio/') {
      return json({ results: [
        { id: 'aaaaaaaa-1111', title: 'Piano Uno', creator: 'Bea', license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', url: `${base}/audio.mp3`, duration: 61000, foreign_landing_url: 'https://example.org/p1', tags: [{ name: 'piano' }] },
        { id: 'bbbbbbbb-2222', title: 'Piano NC', creator: 'Cy', license: 'by-nc', license_url: 'https://creativecommons.org/licenses/by-nc/4.0/', url: `${base}/audio.mp3` },
      ] })
    }
    if (url.pathname === '/v1/audio/aaaaaaaa-1111/') {
      return json({ id: 'aaaaaaaa-1111', title: 'Piano Uno', creator: 'Bea', license: 'by', license_version: '4.0', url: `${base}/audio.mp3`, duration: 61000 })
    }
    if (url.pathname === '/v3.0/tracks/') {
      jamendoCalls.push(url.search)
      if (url.searchParams.get('client_id') === 'mala') return json({ headers: { status: 'failed', error_message: 'invalid client_id' }, results: [] })
      return json({ headers: { status: 'success' }, results: [
        { id: '7', name: 'Jam Uno', artist_name: 'Dee', duration: 90, audio: `${base}/audio.mp3`, shareurl: 'https://jamendo.test/7', license_ccurl: 'http://creativecommons.org/licenses/by/3.0/' },
        { id: '8', name: 'Jam NC', artist_name: 'Eli', duration: 90, audio: `${base}/audio.mp3`, license_ccurl: 'http://creativecommons.org/licenses/by-nc-nd/3.0/' },
      ] })
    }
    if (url.pathname === '/audio.mp3') { res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': String(MP3.length) }); return void res.end(MP3) }
    if (url.pathname === '/page.html') { res.writeHead(200, { 'content-type': 'audio/mpeg' }); return void res.end('<html>no soy audio</html>') }
    res.writeHead(404).end()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
after(() => server.close())

const sources = (clientId?: string) =>
  createSources({ bases: { archive: base, incompetech: base, openverse: base, jamendo: base }, jamendoClientId: clientId })

test('Internet Archive: refuses NC items, skips items with no audio, picks the MP3, reads the file title and length', async () => {
  const [, archive] = sources()
  const found = await archive!.search('lluvia', {})
  assert.equal(found.length, 1)
  const t = found[0]!
  assert.deepEqual([t.source, t.sourceId, t.title, t.artist, t.durationSec, t.license.code], ['archive', 'good-by/a.mp3', 'Lluvia', 'Ana', 125, 'by'])
  assert.equal(t.audioUrl, `${base}/download/good-by/a.mp3`)
  assert.equal((await archive!.resolve('good-by/a.mp3'))?.title, 'Lluvia')
  assert.equal(await archive!.resolve('good-by/missing.mp3'), null)
  assert.equal(await archive!.resolve('sin-barra'), null)
})

test('Incompetech: every word must match, title matches rank first, licence is BY 4.0', async () => {
  const [inc] = sources()
  const found = await inc!.search('medieval', {})
  assert.deepEqual(found.map((t) => t.title), ['The Britons', 'Rain Dance'])
  assert.equal(found[0]!.license.version, '4.0')
  assert.equal(found[0]!.verified, true)
  assert.equal(found[0]!.audioUrl, `${base}/music/royalty-free/mp3-royaltyfree/The%20Britons.mp3`)
  assert.equal(found[0]!.durationSec, 307)
  assert.deepEqual((await inc!.search('medieval drums', {})).map((t) => t.title), ['Rain Dance'])
  assert.deepEqual(await inc!.search('!!!', {}), [])
  assert.equal((await inc!.resolve('Other.mp3'))?.title, 'Other')
  assert.equal(await inc!.resolve('../x'), null)
})

test('Openverse: drops NC results, converts milliseconds, resolves by id and rejects odd ids', async () => {
  const ov = sources()[2]!
  const found = await ov.search('piano', {})
  assert.deepEqual(found.map((t) => [t.title, t.durationSec, t.pageUrl, t.tags]), [['Piano Uno', 61, 'https://example.org/p1', ['piano']]])
  assert.equal((await ov.resolve('aaaaaaaa-1111'))?.license.version, '4.0')
  assert.equal(await ov.resolve('../../etc'), null)
})

test('Jamendo: needs a key, reports a bad key, drops NC / ND', async () => {
  assert.match(sources()[3]!.unavailable() ?? '', /JAMENDO_CLIENT_ID/)
  const ok = sources('buena')[3]!
  assert.equal(ok.unavailable(), null)
  assert.deepEqual((await ok.search('jam', {})).map((t) => t.title), ['Jam Uno'])
  assert.equal((await ok.resolve('7'))?.sourceId, '7')
  assert.equal(await ok.resolve('7; DROP'), null)
  await assert.rejects(sources('mala')[3]!.search('jam', {}), /invalid client_id/)
})

test('searchAll: a failing or unconfigured source is reported and the rest still answer', async () => {
  const broken = createSources({ bases: { archive: 'http://127.0.0.1:1', incompetech: base, openverse: base, jamendo: base } })
  const r = await searchAll(broken, 'medieval')
  assert.ok(r.tracks.some((t) => t.source === 'incompetech'))
  assert.ok(r.tracks.some((t) => t.source === 'openverse'))
  assert.deepEqual(r.problems.map((p) => p.source).sort(), ['archive', 'jamendo'])
  const only = await searchAll(broken, 'medieval', { only: ['incompetech'] })
  assert.equal(only.problems.length, 0)
})

const track = (over: Partial<Track> = {}): Track => ({
  source: 'jamendo', sourceId: '7', title: 'Jam Uno', artist: 'Dee', license: parseLicense('by'), durationSec: 90, audioUrl: 'https://cdn.example.com/a.mp3', pageUrl: null, tags: [], verified: false, ...over,
})

test('download: writes audio + licence sidecar, via the fetch it is given', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'music-'))
  const f = (async () => new Response(MP3, { headers: { 'content-length': String(MP3.length) } })) as typeof fetch
  const r = await downloadTrack(track(), dir, 'abc', f)
  assert.equal(r.bytes, MP3.length)
  assert.equal(r.mime, 'audio/mpeg')
  assert.deepEqual(readdirSync(dir).sort(), ['abc.license.json', 'abc.mp3'])
  const side = JSON.parse(readFileSync(path.join(dir, 'abc.license.json'), 'utf8'))
  assert.equal(side.license.code, 'by')
  assert.match(side.credit, /Jam Uno/)
})

test('download: refuses NC licences, non-audio bodies, big files and non-https, leaving nothing behind', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'music-'))
  const html = (async () => new Response('<html>hola</html>', { headers: { 'content-type': 'audio/mpeg' } })) as typeof fetch
  await assert.rejects(downloadTrack(track({ license: parseLicense('by-nc') }), dir, 'a', html), /no permite uso comercial/)
  await assert.rejects(downloadTrack(track(), dir, 'b', html), /no es audio/)
  const big = (async () => new Response(MP3, { headers: { 'content-length': String(500 * 1024 * 1024) } })) as typeof fetch
  await assert.rejects(downloadTrack(track(), dir, 'c', big), /demasiado grande/)
  await assert.rejects(downloadTrack(track({ audioUrl: 'http://cdn.example.com/a.mp3' }), dir, 'd', html), /https/)
  const gone = (async () => new Response('', { status: 404 })) as typeof fetch
  await assert.rejects(downloadTrack(track(), dir, 'e', gone), /HTTP 404/)
  assert.deepEqual(readdirSync(dir), [])
})
