import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { perceive, parseJsonReply, WINDOW_FRAMES } from '../src/perceive.ts'
import type { VisionProvider, VisionRequest } from '../src/providers/types.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const speech = path.join(here, 'fixtures-speech.wav')

// 8 s video: four solid colours and the spoken sentence, built on the fly.
function makeVideo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'perception-'))
  const out = path.join(dir, 'test.mp4')
  execFileSync('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=2:r=30',
    '-f', 'lavfi', '-i', 'color=c=green:s=320x180:d=2:r=30',
    '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=2:r=30',
    '-f', 'lavfi', '-i', 'color=c=yellow:s=320x180:d=2:r=30',
    '-i', speech,
    '-filter_complex', '[0][1][2][3]concat=n=4:v=1:a=0[v];[4]apad=whole_dur=8[a]',
    '-map', '[v]', '-map', '[a]', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out,
  ])
  return out
}

test('parseJsonReply extracts JSON wrapped in prose', () => {
  assert.deepEqual(parseJsonReply<{ a: number }>('Aquí va:\n```json\n{"a": 1}\n```'), { a: 1 })
  assert.throws(() => parseJsonReply('sin json'), /Respuesta sin JSON/)
})

test('perceive runs frames, speech and windowed vision end to end', { timeout: 300_000 }, async () => {
  const video = makeVideo()
  const work = mkdtempSync(path.join(tmpdir(), 'perception-work-'))
  const calls: VisionRequest[] = []
  const fakeVision: VisionProvider = {
    name: 'fake',
    available: () => true,
    async describe(req) {
      calls.push(req)
      if (req.instruction.includes('transcripción completa')) {
        return '{"short_summary":"Prueba","full_summary":"Cuatro colores y una frase","topics":["prueba"],"language":"en"}'
      }
      // One scene per frame it was shown, like a model describing each picture.
      return JSON.stringify({
        scenes: req.frames.map((f) => ({
          start_seconds: f.time,
          end_seconds: f.time + 1,
          title: 'Color',
          description: 'Un color sólido',
          audio_description: null,
        })),
        elements: [{ kind: 'object', label: 'color', detail: null, start_seconds: 0, end_seconds: null }],
      })
    },
  }

  const result = await perceive(video, work, { providers: [fakeVision], whisperModel: 'tiny', language: 'en' })

  assert.ok(result.transcript.length >= 1, 'speech was transcribed')
  assert.match(result.transcript.map((t) => t.text).join(' ').toLowerCase(), /quick test sentence/)
  assert.ok(result.scenes.length >= 4, `scenes from frames: ${result.scenes.length}`)
  assert.deepEqual(result.scenes.map((s) => s.index), result.scenes.map((_, i) => i))
  assert.equal(result.summary.short_summary, 'Prueba')
  assert.ok(calls.length >= 2, 'at least one window plus the summary call')
  const windowCalls = calls.filter((c) => !c.instruction.includes('transcripción completa'))
  assert.ok(windowCalls.every((c) => c.frames.length <= WINDOW_FRAMES))
  assert.ok(existsSync(path.join(work, 'audio.wav')))
})

test('perceive fails clearly without any vision key', { timeout: 300_000 }, async () => {
  const video = makeVideo()
  const work = mkdtempSync(path.join(tmpdir(), 'perception-nokey-'))
  const savedA = process.env.ANTHROPIC_API_KEY
  const savedG = process.env.GEMINI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.GEMINI_API_KEY
  try {
    await assert.rejects(
      perceive(video, work, { whisperModel: 'tiny', language: 'en' }),
      /Ningún proveedor de visión tiene clave/,
    )
  } finally {
    if (savedA) process.env.ANTHROPIC_API_KEY = savedA
    if (savedG) process.env.GEMINI_API_KEY = savedG
  }
})
