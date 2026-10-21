// The probe job against a real (temporary) SQLite database and a real video.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// memory-engine reads DATA_DIR / SQLITE_PATH when it is first imported.
const root = mkdtempSync(path.join(tmpdir(), 'worker-probe-'))
process.env.DATA_DIR = root
process.env.SQLITE_PATH = path.join(root, 'db', 'app.sqlite')
mkdirSync(path.join(root, 'db'), { recursive: true })

type MemoryEngine = typeof import('@cva/memory-engine')
let me: MemoryEngine
let runProbeJob: typeof import('../src/jobs/probe.ts').runProbeJob

before(async () => {
  me = await import('@cva/memory-engine')
  ;({ runProbeJob } = await import('../src/jobs/probe.ts'))
  me.migrate(me.getDb())
})

after(() => me?.closeDb())

function uploaded(): string {
  const video = me.createVideo({ title: 'subido', sourceKind: 'file' })
  const file = path.join(me.VIDEOS_DIR, video.id, 'source.mp4')
  mkdirSync(path.dirname(file), { recursive: true })
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:d=1:r=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file])
  me.setVideoStoredPath(video.id, me.toDataRelativePath(file))
  return video.id
}

test('"Subir y analizar": the analysis is queued as soon as the probe finishes; a plain upload waits for the button', async () => {
  for (const analyze of [false, true]) {
    const id = uploaded()
    const job = me.enqueueJob({ type: 'probe', videoId: id, payload: analyze ? { analyze: true } : undefined })
    await runProbeJob(job, me.getDb())
    assert.equal(me.getVideo(id)!.status, 'queued')
    assert.deepEqual(me.listJobsForVideo(id).map((j) => j.type), analyze ? ['probe', 'analyze'] : ['probe'], `analyze=${analyze}`)
  }
})
