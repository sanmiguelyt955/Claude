// startApp against a stand-in runtime folder: this Node, empty Python and
// FFmpeg files, and tiny scripts in place of the web server and the worker.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, copyFileSync, symlinkSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
process.env.VIDEO_ANALYZER_RESTART_DELAY_MS = '50'
const { startApp } = createRequire(import.meta.url)('../runtime.js')

function fakeRuntime() {
  const rt = mkdtempSync(path.join(tmpdir(), 'rt-'))
  const file = (rel, text = '') => { mkdirSync(path.dirname(path.join(rt, rel)), { recursive: true }); writeFileSync(path.join(rt, rel), text) }
  mkdirSync(path.join(rt, 'node', 'bin'), { recursive: true })
  symlinkSync(process.execPath, path.join(rt, 'node', 'bin', 'node'))
  file('python/bin/python3'); file('ffmpeg/ffmpeg'); file('ffmpeg/ffprobe')
  file('app/worker/migrate.mjs', 'process.exit(0)\n')
  // Each worker start is counted in a file; it crashes the first two times.
  file('app/worker/worker.mjs', `import fs from 'node:fs'
const f = new URL('./starts.txt', import.meta.url)
const n = (fs.existsSync(f) ? Number(fs.readFileSync(f, 'utf8')) : 0) + 1
fs.writeFileSync(f, String(n))
if (n <= 2) process.exit(1)
setInterval(() => {}, 1000)
`)
  file('app/web/apps/web/server.js', "require('node:http').createServer((q, r) => r.end('ok')).listen(Number(process.env.PORT), '127.0.0.1')\n")
  mkdirSync(path.join(rt, 'app'), { recursive: true })
  copyFileSync(path.join(here, '..', 'child-guard.mjs'), path.join(rt, 'app', 'child-guard.mjs'))
  return rt
}

test('a worker that dies while the app is open is started again', async () => {
  const rt = fakeRuntime()
  const logs = []
  const app = await startApp({ runtimeDir: rt, dataDir: mkdtempSync(path.join(tmpdir(), 'rt-data-')), log: (m) => logs.push(m) })
  try {
    await new Promise((r) => setTimeout(r, 1500))
    assert.equal(readFileSync(path.join(rt, 'app', 'worker', 'starts.txt'), 'utf8'), '3', logs.join(' | '))
    assert.ok(logs.some((l) => /worker se cerró \(código 1\); se vuelve a abrir/.test(l)))
    assert.equal(await (await fetch(app.url)).text(), 'ok')
  } finally {
    app.stop()
  }
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(readFileSync(path.join(rt, 'app', 'worker', 'starts.txt'), 'utf8'), '3', 'a stopped app starts nothing again')
})
