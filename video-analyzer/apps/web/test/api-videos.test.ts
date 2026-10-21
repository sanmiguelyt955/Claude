// Route handlers of /api/videos/** called directly (no Next server) against a
// temporary SQLite database and DATA_DIR.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// memory-engine reads DATA_DIR / SQLITE_PATH when it is first imported.
const root = mkdtempSync(path.join(tmpdir(), 'web-api-videos-'))
process.env.DATA_DIR = root
process.env.SQLITE_PATH = path.join(root, 'db', 'app.sqlite')
delete process.env.ANALYSIS_ENGINE

type MemoryEngine = typeof import('@cva/memory-engine')
let me: MemoryEngine
let sample: string

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request(`http://localhost${url}`, {
    method: init.method ?? 'POST',
    headers: { 'content-type': 'application/json', ...init.headers },
    body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
  })

/** Simulates the worker process's heartbeat (a live pid that is not this process). */
function setWorkerAlive(alive: boolean): void {
  const db = me.getDb()
  db.prepare("DELETE FROM meta WHERE key = 'worker_heartbeat'").run()
  if (alive) {
    db.prepare("INSERT INTO meta (key, value) VALUES ('worker_heartbeat', ?)").run(
      JSON.stringify({ pid: process.ppid, at: new Date().toISOString() }),
    )
  }
}

/** A video row with its file at data/videos/{id}/source.mp4, like an upload leaves it. */
function storedVideo(status: 'queued' | 'ready' = 'ready', durationSeconds = 6): string {
  const video = me.createVideo({ title: 'Prueba', sourceKind: 'file' })
  const dir = path.join(me.VIDEOS_DIR, video.id)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'source.mp4')
  writeFileSync(file, readFileSync(sample))
  me.setVideoStoredPath(video.id, me.toDataRelativePath(file))
  me.setVideoStatus(video.id, status)
  me.getDb().prepare('UPDATE videos SET duration_seconds = ? WHERE id = ?').run(durationSeconds, video.id)
  return video.id
}

function openFdsUnder(prefix: string): number {
  let count = 0
  for (const fd of readdirSync('/proc/self/fd')) {
    try {
      if (readlinkSync(`/proc/self/fd/${fd}`).startsWith(prefix)) count++
    } catch {
      // closed while listing
    }
  }
  return count
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

before(async () => {
  me = await import('@cva/memory-engine')
  me.migrate(me.getDb())
  mkdirSync(me.VIDEOS_DIR, { recursive: true })
  // apps/web is not "type": "module", so tsx compiles the routes to CommonJS,
  // and require() cannot resolve execa's ESM-only dependencies (used by
  // @cva/video-processor, which the upload route imports). Next bundles them
  // fine; here the real execa is loaded through import() and handed to require.
  const execaPath = require.resolve('execa', { paths: [path.join(process.cwd(), 'packages', 'video-processor')] })
  const execa = await import('execa')
  require.cache[execaPath] = { id: execaPath, filename: execaPath, loaded: true, exports: execa } as NodeJS.Module
  sample = path.join(root, 'sample.mp4')
  execFileSync('ffmpeg', [
    '-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=6:size=160x120:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-shortest', '-c:v', 'mpeg4', '-c:a', 'aac', sample,
  ])
})

// ── DELETE /api/videos/[id] ────────────────────────────────────────────────

test('DELETE removes the rows and every per-video file, and leaves other videos alone', async () => {
  const route = await import('../src/app/api/videos/[id]/route')
  const id = storedVideo()
  const other = storedVideo()
  const perVideo = [
    path.join(root, 'perception', id, 'windows.json'),
    path.join(root, 'frames', id, '10.jpg'),
    path.join(root, 'clips', id, '0-50.webm'),
    path.join(root, 'thumbnails', `${id}.jpg`),
    path.join(root, 'tmp', 'gemini-responses', `${id}.json`),
  ]
  for (const file of [...perVideo, ...perVideo.map((f) => f.replaceAll(id, other))]) {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, 'x')
  }
  me.addChatMessage({ videoId: id, role: 'user', text: 'hola' })
  const done = me.enqueueJob({ type: 'probe', videoId: id })
  me.completeJob(done.id)
  const [skill] = me.insertSkillCandidates(id, [
    { name: 'mi-skill', description: 'd', startSeconds: null, endSeconds: null, confidence: null },
  ])

  const res = await route.DELETE(req(`/api/videos/${id}`, { method: 'DELETE' }), ctx(id))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })

  assert.equal(me.getVideo(id), undefined)
  assert.equal(me.listChatMessages(id).length, 0)
  assert.equal(me.getJob(done.id), undefined)
  // A skill is the user's work: it stays, just no longer tied to the video.
  assert.equal(me.getSkill(skill.id)?.video_id, null)
  assert.equal(existsSync(path.join(me.VIDEOS_DIR, id)), false)
  for (const file of perVideo) assert.equal(existsSync(file), false, file)
  for (const dir of ['perception', 'frames', 'clips']) assert.equal(existsSync(path.join(root, dir, id)), false)

  assert.ok(me.getVideo(other))
  assert.ok(existsSync(path.join(me.VIDEOS_DIR, other, 'source.mp4')))
  for (const file of perVideo.map((f) => f.replaceAll(id, other))) assert.ok(existsSync(file), file)
})

test('DELETE refuses while a job is queued or running, and keeps everything', async () => {
  const route = await import('../src/app/api/videos/[id]/route')
  for (const state of ['queued', 'running'] as const) {
    const id = storedVideo('queued')
    me.enqueueJob({ type: 'analyze', videoId: id })
    if (state === 'running') assert.equal(me.claimNextJob()?.video_id, id)
    const res = await route.DELETE(req(`/api/videos/${id}`, { method: 'DELETE' }), ctx(id))
    assert.equal(res.status, 409, state)
    const body = (await res.json()) as { error: string }
    assert.match(body.error, /espera|termine/i)
    assert.ok(me.getVideo(id))
    assert.ok(existsSync(path.join(me.VIDEOS_DIR, id, 'source.mp4')))
    me.getDb().prepare("UPDATE jobs SET status = 'done' WHERE video_id = ?").run(id)
  }
})

test('DELETE refuses a video that is part of a queued batch analysis led by another video', async () => {
  const route = await import('../src/app/api/videos/[id]/route')
  const first = storedVideo('queued')
  const second = storedVideo('queued')
  const job = me.enqueueJob({ type: 'analyze', videoId: first, payload: { videoIds: [first, second] } })
  const res = await route.DELETE(req(`/api/videos/${second}`, { method: 'DELETE' }), ctx(second))
  assert.equal(res.status, 409)
  assert.ok(me.getVideo(second))
  me.completeJob(job.id)
})

test('DELETE of a video that does not exist is 404', async () => {
  const route = await import('../src/app/api/videos/[id]/route')
  const res = await route.DELETE(req('/api/videos/nope', { method: 'DELETE' }), ctx('nope'))
  assert.equal(res.status, 404)
  assert.match(((await res.json()) as { error: string }).error, /no existe/)
})

// ── workerAlive ────────────────────────────────────────────────────────────

test('GET /api/videos/[id] and the list say whether the worker is running', async () => {
  const detail = await import('../src/app/api/videos/[id]/route')
  const list = await import('../src/app/api/videos/route')
  const id = storedVideo()
  setWorkerAlive(false)
  let body = (await (await detail.GET(req(`/api/videos/${id}`, { method: 'GET' }), ctx(id))).json()) as { workerAlive: unknown }
  assert.equal(body.workerAlive, false)
  assert.equal(((await (await list.GET()).json()) as { workerAlive: unknown }).workerAlive, false)
  setWorkerAlive(true)
  body = (await (await detail.GET(req(`/api/videos/${id}`, { method: 'GET' }), ctx(id))).json()) as { workerAlive: unknown }
  assert.equal(body.workerAlive, true)
  assert.equal(((await (await list.GET()).json()) as { workerAlive: unknown }).workerAlive, true)
  setWorkerAlive(false)
})

test('every route that enqueues a job reports workerAlive in its 202', async () => {
  setWorkerAlive(false)
  const analyze = await import('../src/app/api/videos/[id]/analyze/route')
  const detect = await import('../src/app/api/videos/[id]/detect-skills/route')
  const retry = await import('../src/app/api/videos/[id]/retry/route')
  const batch = await import('../src/app/api/videos/analyze-batch/route')
  const fromUrl = await import('../src/app/api/videos/from-url/route')
  const upload = await import('../src/app/api/videos/upload/route')
  const improve = await import('../src/app/api/videos/[id]/improve-skill/route')
  const generate = await import('../src/app/api/skills/[id]/generate/route')

  const responses: [string, Response][] = []
  const a = storedVideo('queued')
  responses.push(['analyze', await analyze.POST(req(`/api/videos/${a}/analyze`), ctx(a))])
  const d = storedVideo('ready')
  responses.push(['detect-skills', await detect.POST(req(`/api/videos/${d}/detect-skills`), ctx(d))])
  const r = storedVideo('ready')
  me.setVideoStatus(r, 'failed', 'x')
  responses.push(['retry', await retry.POST(req(`/api/videos/${r}/retry`), ctx(r))])
  const b1 = storedVideo('queued')
  const b2 = storedVideo('queued')
  responses.push(['analyze-batch', await batch.POST(req('/api/videos/analyze-batch', { body: { videoIds: [b1, b2] } }))])
  responses.push(['from-url', await fromUrl.POST(req('/api/videos/from-url', { body: { url: 'https://example.com/a.mp4' } }))])
  responses.push(['upload', await upload.POST(multipartRequest('clip.mp4', readFileSync(sample)))])
  const i = storedVideo('ready')
  const skillFile = path.join(root, 'ext-skill', 'SKILL.md')
  mkdirSync(path.dirname(skillFile), { recursive: true })
  writeFileSync(skillFile, '# Skill\n')
  responses.push(['improve-skill', await improve.POST(req(`/api/videos/${i}/improve-skill`, { body: { sourceSkillPath: skillFile } }), ctx(i))])
  const [skill] = me.insertSkillCandidates(i, [
    { name: 'otra-skill', description: 'd', startSeconds: null, endSeconds: null, confidence: null },
  ])
  responses.push(['generate', await generate.POST(req(`/api/skills/${skill.id}/generate`), ctx(skill.id))])

  for (const [name, res] of responses) {
    assert.equal(res.status, 202, name)
    assert.equal(((await res.json()) as { workerAlive: unknown }).workerAlive, false, name)
  }
})

// ── from-url and malformed bodies ──────────────────────────────────────────

test('from-url accepts a URL whose last segment has a bare %', async () => {
  const route = await import('../src/app/api/videos/from-url/route')
  const res = await route.POST(req('/api/videos/from-url', { body: { url: 'https://example.com/videos/oferta-50%.mp4' } }))
  assert.equal(res.status, 202)
  assert.equal(((await res.json()) as { video: { title: string } }).video.title, 'oferta-50%.mp4')
  const encoded = await route.POST(req('/api/videos/from-url', { body: { url: 'https://example.com/v/ACLARACI%C3%93N.mp4' } }))
  assert.equal(((await encoded.json()) as { video: { title: string } }).video.title, 'ACLARACIÓN.mp4')
})

test('malformed or wrongly typed JSON bodies get a 400 with a message, never a 500', async () => {
  const fromUrl = await import('../src/app/api/videos/from-url/route')
  const batch = await import('../src/app/api/videos/analyze-batch/route')
  const improve = await import('../src/app/api/videos/[id]/improve-skill/route')
  const detail = await import('../src/app/api/videos/[id]/route')
  const chat = await import('../src/app/api/videos/[id]/chat/route')
  const id = storedVideo('ready')

  const cases: [string, () => Promise<Response>][] = [
    ['from-url null', () => fromUrl.POST(req('/api/videos/from-url', { body: 'null' }))],
    ['from-url url:123', () => fromUrl.POST(req('/api/videos/from-url', { body: { url: 123 } }))],
    ['from-url not json', () => fromUrl.POST(req('/api/videos/from-url', { body: '{nope' }))],
    ['analyze-batch null', () => batch.POST(req('/api/videos/analyze-batch', { body: 'null' }))],
    ['analyze-batch "abc"', () => batch.POST(req('/api/videos/analyze-batch', { body: { videoIds: 'abc' } }))],
    ['analyze-batch [{},{}]', () => batch.POST(req('/api/videos/analyze-batch', { body: { videoIds: [{}, {}] } }))],
    ['analyze-batch array body', () => batch.POST(req('/api/videos/analyze-batch', { body: [{}, {}] }))],
    ['improve-skill skillId:5', () => improve.POST(req(`/api/videos/${id}/improve-skill`, { body: { skillId: 5 } }), ctx(id))],
    ['improve-skill null', () => improve.POST(req(`/api/videos/${id}/improve-skill`, { body: 'null' }), ctx(id))],
    ['PATCH null', () => detail.PATCH(req(`/api/videos/${id}`, { method: 'PATCH', body: 'null' }), ctx(id))],
    ['chat null', () => chat.POST(req(`/api/videos/${id}/chat`, { body: 'null' }), ctx(id))],
  ]
  for (const [name, call] of cases) {
    let res: Response
    try {
      res = await call()
    } catch (error) {
      assert.fail(`${name} threw: ${(error as Error).message}`)
    }
    assert.equal(res.status, 400, name)
    const body = (await res.json()) as { error?: unknown }
    assert.equal(typeof body.error, 'string', name)
  }

  // A non-string title is ignored, not a crash.
  const titled = await fromUrl.POST(req('/api/videos/from-url', { body: { url: 'https://example.com/b.mp4', title: 5 } }))
  assert.equal(titled.status, 202)
  assert.equal(((await titled.json()) as { video: { title: string } }).video.title, 'b.mp4')
})

test('export-vault of a video that does not exist is 404', async () => {
  const route = await import('../src/app/api/videos/[id]/export-vault/route')
  const res = await route.POST(req('/api/videos/nope/export-vault'), ctx('nope'))
  assert.equal(res.status, 404)
})

// ── media, audio, frame ────────────────────────────────────────────────────

test('HEAD on /media returns the headers without opening the file', async () => {
  const route = (await import('../src/app/api/videos/[id]/media/route')) as {
    GET: (r: Request, c: ReturnType<typeof ctx>) => Promise<Response>
    HEAD?: (r: Request, c: ReturnType<typeof ctx>) => Promise<Response>
  }
  const id = storedVideo()
  const file = path.join(me.VIDEOS_DIR, id, 'source.mp4')
  const size = statSync(file).size
  // Next answers HEAD with GET when no HEAD handler is exported.
  const head = route.HEAD ?? route.GET
  for (let i = 0; i < 3; i++) {
    const plain = await head(req(`/api/videos/${id}/media`, { method: 'HEAD' }), ctx(id))
    assert.equal(plain.status, 200)
    assert.equal(plain.headers.get('content-length'), String(size))
    const ranged = await head(req(`/api/videos/${id}/media`, { method: 'HEAD', headers: { range: 'bytes=0-99' } }), ctx(id))
    assert.equal(ranged.status, 206)
    assert.equal(ranged.headers.get('content-range'), `bytes 0-99/${size}`)
  }
  await wait(100)
  assert.equal(openFdsUnder(file), 0)

  // GET still streams the bytes.
  const full = await route.GET(req(`/api/videos/${id}/media`, { method: 'GET' }), ctx(id))
  assert.equal((await full.arrayBuffer()).byteLength, size)
  const part = await route.GET(req(`/api/videos/${id}/media`, { method: 'GET', headers: { range: 'bytes=10-19' } }), ctx(id))
  assert.equal(part.status, 206)
  assert.deepEqual(new Uint8Array(await part.arrayBuffer()), new Uint8Array(readFileSync(file).subarray(10, 20)))
})

test('audio clip: past the end is 416 and caches nothing; end is clamped to the duration; a missing param is 400', async () => {
  const route = await import('../src/app/api/videos/[id]/audio/route')
  const id = storedVideo('ready', 6)
  const clips = path.join(root, 'clips', id)
  const get = (qs: string) => route.GET(req(`/api/videos/${id}/audio?${qs}`, { method: 'GET' }), ctx(id))

  assert.equal((await get('start=10&end=20')).status, 416)
  assert.equal((await get('start=6&end=8')).status, 416)
  assert.equal(existsSync(clips) ? readdirSync(clips).length : 0, 0)
  assert.equal((await get('end=3')).status, 400)
  assert.equal((await get('start=&end=3')).status, 400)
  assert.equal((await get('start=1')).status, 400)

  const tail = await get('start=4&end=20')
  assert.equal(tail.status, 200)
  assert.ok((await tail.arrayBuffer()).byteLength > 1000)
  assert.deepEqual(readdirSync(clips), ['40-20.webm'])
})

test('frame: a missing or empty t is 400, a real one is a picture', async () => {
  const route = await import('../src/app/api/videos/[id]/frame/route')
  const id = storedVideo('ready', 6)
  const get = (qs: string) => route.GET(req(`/api/videos/${id}/frame${qs}`, { method: 'GET' }), ctx(id))
  assert.equal((await get('')).status, 400)
  assert.equal((await get('?t=')).status, 400)
  assert.equal((await get('?t=abc')).status, 400)
  const ok = await get('?t=1')
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('content-type'), 'image/jpeg')
})

// ── upload ─────────────────────────────────────────────────────────────────

const BOUNDARY = '----cvaTestBoundary'
function multipartHead(filename: string): Uint8Array {
  return new TextEncoder().encode(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`,
  )
}
function multipartRequest(filename: string, bytes: Uint8Array): Request {
  const tail = new TextEncoder().encode(`\r\n--${BOUNDARY}--\r\n`)
  const body = new Uint8Array([...multipartHead(filename), ...bytes, ...tail])
  return new Request('http://localhost/api/videos/upload', {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    body,
  })
}

test('an upload cut off mid-file settles with an error and leaves no folder, row or open file', async () => {
  const route = await import('../src/app/api/videos/upload/route')
  const uncaught: Error[] = []
  const onUncaught = (error: Error) => uncaught.push(error)
  process.on('uncaughtException', onUncaught)
  const foldersBefore = readdirSync(me.VIDEOS_DIR).length
  const rowsBefore = me.listVideos().length

  try {
    // 1) The connection drops: the body stream errors, as Node's does on ECONNRESET.
    let sent = 0
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === 0) controller.enqueue(multipartHead('clip.mp4'))
        else if (sent < 4) controller.enqueue(new Uint8Array(256 * 1024).fill(7))
        else controller.error(Object.assign(new Error('aborted'), { code: 'ECONNRESET' }))
        sent++
      },
    })
    const first = await Promise.race([
      route.POST(
        new Request('http://localhost/api/videos/upload', {
          method: 'POST',
          headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
          body: broken,
          duplex: 'half',
        } as RequestInit),
      ),
      wait(3000).then(() => 'hung' as const),
    ])
    assert.notEqual(first, 'hung', 'the request never settled')
    assert.equal((first as Response).status, 400)
    assert.match(((await (first as Response).json()) as { error: string }).error, /interrump/i)

    // 2) The browser goes away while the body is stalled: only the request's signal says so.
    const abort = new AbortController()
    let stalledOnce = false
    const stalled = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!stalledOnce) {
          stalledOnce = true
          controller.enqueue(new Uint8Array([...multipartHead('clip.mp4'), ...new Uint8Array(64 * 1024)]))
          return
        }
        return new Promise(() => {}) // never more data
      },
    })
    setTimeout(() => abort.abort(), 300)
    const second = await Promise.race([
      route.POST(
        new Request('http://localhost/api/videos/upload', {
          method: 'POST',
          headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
          body: stalled,
          duplex: 'half',
          signal: abort.signal,
        } as RequestInit),
      ),
      wait(3000).then(() => 'hung' as const),
    ])
    assert.notEqual(second, 'hung', 'the request never settled')
    assert.equal((second as Response).status, 400)

    await wait(100)
    assert.equal(openFdsUnder(me.VIDEOS_DIR), 0)
    assert.equal(readdirSync(me.VIDEOS_DIR).length, foldersBefore)
    assert.equal(me.listVideos().length, rowsBefore)
    assert.deepEqual(uncaught.map((e) => e.message), [])
  } finally {
    process.off('uncaughtException', onUncaught)
  }
})

test('a complete upload still lands on disk byte for byte', async () => {
  const route = await import('../src/app/api/videos/upload/route')
  const bytes = readFileSync(sample)
  const res = await route.POST(multipartRequest('ACLARACIÓN.mp4', bytes))
  assert.equal(res.status, 202)
  const { video } = (await res.json()) as { video: { id: string; title: string; stored_path: string } }
  assert.equal(video.title, 'ACLARACIÓN.mp4')
  assert.deepEqual(readFileSync(me.resolveDataPath(video.stored_path)), bytes)
})
