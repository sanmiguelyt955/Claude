import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { failureReason, transcribe } from '../src/transcribe.ts'

const OK = JSON.stringify({ language: 'es', segments: [{ start: 0, end: 1, text: 'Hola.' }], device: 'cpu' })

// A stand-in for python3: logs its arguments, then does what FAKE_MODE says.
// "crash" dies on a signal with no Python traceback, like a missing CUDA DLL
// aborting the process; "--device cpu" runs always succeed.
function fakePython(): { bin: string; calls: () => string[] } {
  const dir = mkdtempSync(path.join(tmpdir(), 'fake-python-'))
  const log = path.join(dir, 'calls.log')
  const bin = path.join(dir, 'python3')
  writeFileSync(bin, `#!/bin/sh
echo "$*" >> '${log}'
case "$*" in *"--device cpu"*) printf '%s' '${OK}'; exit 0;; esac
case "$FAKE_MODE" in
  python-error)
    echo 'Traceback (most recent call last):' >&2
    echo '  File "transcribe.py", line 1, in <module>' >&2
    echo 'RuntimeError: FFmpeg no pudo leer el audio: Error opening input files: Invalid data found when processing input' >&2
    exit 1;;
  crash)
    echo 'Could not load library cudnn_ops64_9.dll. Error code 126' >&2
    kill -ABRT $$;;
esac
printf '%s' '${OK}'
`)
  chmodSync(bin, 0o755)
  return { bin, calls: () => readFileSync(log, 'utf8').trim().split('\n') }
}

async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]))
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v)
  try {
    return await fn()
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v)
  }
}

test('an error Python reported fails once, with its reason in one line', async () => {
  const fake = fakePython()
  await withEnv({ PYTHON_BIN: fake.bin, FAKE_MODE: 'python-error', WHISPER_DEVICE: undefined }, async () => {
    await assert.rejects(transcribe('/x.wav'), (err: Error) => {
      assert.equal(err.message, 'No se pudo transcribir el audio: FFmpeg no pudo leer el audio: Error opening input files: Invalid data found when processing input')
      return true
    })
  })
  assert.equal(fake.calls().length, 1, 'no second run on the CPU')
})

test('a crash Python could not catch is retried on the CPU, and says why', async () => {
  const fake = fakePython()
  const out = await withEnv({ PYTHON_BIN: fake.bin, FAKE_MODE: 'crash', WHISPER_DEVICE: undefined }, () => transcribe('/x.wav'))
  assert.equal(out.segments[0]?.text, 'Hola.')
  assert.equal(out.gpu_error, 'Could not load library cudnn_ops64_9.dll. Error code 126')
  const calls = fake.calls()
  assert.equal(calls.length, 2)
  assert.match(calls[1]!, /--device cpu$/)
})

test('a forced device is not second-guessed', async () => {
  const fake = fakePython()
  await withEnv({ PYTHON_BIN: fake.bin, FAKE_MODE: 'crash', WHISPER_DEVICE: 'cuda' }, async () => {
    await assert.rejects(transcribe('/x.wav'), /No se pudo transcribir el audio: Could not load library cudnn/)
  })
  assert.equal(fake.calls().length, 1)
})

test('a normal run passes the JSON through, with no gpu_error', async () => {
  const fake = fakePython()
  const out = await withEnv({ PYTHON_BIN: fake.bin, FAKE_MODE: '', WHISPER_DEVICE: undefined }, () => transcribe('/x.wav'))
  assert.deepEqual(out, JSON.parse(OK))
})

test('failureReason: the last stderr line without the exception name, else how the process ended', () => {
  assert.equal(failureReason({ stderr: 'Traceback...\nsubprocess.CalledProcessError: boom\n' }), 'boom')
  assert.equal(failureReason({ stderr: '', signal: 'SIGABRT' }), 'el proceso se cerró (SIGABRT)')
  assert.equal(failureReason({ stderr: '', code: 3221226505 }), 'el proceso terminó con el código 3221226505')
})

test('the real transcribe.py: a file FFmpeg cannot read fails fast with FFmpeg\'s reason', async (t) => {
  const python = process.env.PYTHON_BIN || 'python3'
  try {
    execFileSync(python, ['-c', 'import numpy'], { stdio: 'ignore' })
  } catch {
    t.skip('Python con NumPy no disponible')
    return
  }
  const broken = path.join(mkdtempSync(path.join(tmpdir(), 'broken-audio-')), 'broken.wav')
  writeFileSync(broken, 'not audio\n')
  const started = Date.now()
  await assert.rejects(transcribe(broken, { model: 'tiny' }), (err: Error) => {
    assert.match(err.message, /^No se pudo transcribir el audio: FFmpeg no pudo leer el audio: .*Invalid data/)
    assert.ok(!err.message.includes('\n'), err.message)
    return true
  })
  assert.ok(Date.now() - started < 10_000, 'decoded before any model loads')
})
