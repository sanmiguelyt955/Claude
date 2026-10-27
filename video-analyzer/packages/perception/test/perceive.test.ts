import { CLAUDE_MAX_IMAGES, evenlySpaced } from '../src/providers/claude.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'

// These tests cover the basic scene analysis; the V6.5 record has its own (perceive-v6.test.ts).
process.env.PERCEPTION_PROTOCOL = 'basico'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_FRAME_OPTIONS } from '../src/frames.ts'
import { closeGaps, perceive, parseCheckpoint, parseJsonReply, parseWindowReply, windowInstruction, WINDOW_FRAMES, type PerceptionCheckpoint } from '../src/perceive.ts'
import { ProviderOverloadedError, type VisionProvider, type VisionRequest } from '../src/providers/types.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const speech = path.join(here, 'fixtures-speech.wav')

// 8 s video: four solid colours and (unless silent) the spoken sentence.
function makeVideo({ silent = false } = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'perception-'))
  const out = path.join(dir, 'test.mp4')
  execFileSync('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=2:r=30',
    '-f', 'lavfi', '-i', 'color=c=green:s=320x180:d=2:r=30',
    '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=2:r=30',
    '-f', 'lavfi', '-i', 'color=c=yellow:s=320x180:d=2:r=30',
    ...(silent
      ? ['-filter_complex', '[0][1][2][3]concat=n=4:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out]
      : [
          '-i', speech,
          '-filter_complex', '[0][1][2][3]concat=n=4:v=1:a=0[v];[4]apad=whole_dur=8[a]',
          '-map', '[v]', '-map', '[a]', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out,
        ]),
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
  const fakeVision = fakeProvider(calls)

  const steps: Array<{ label: string; current?: number; total?: number }> = []
  const result = await perceive(video, work, { providers: [fakeVision], whisperModel: 'tiny', language: 'en', onProgress: (p) => steps.push(p) })
  assert.equal(steps[0]!.label, 'Extrayendo fotogramas y transcribiendo el audio...')
  const last = steps.at(-1)!
  assert.equal(last.label, 'Escribiendo el resumen...')
  assert.equal(last.current, last.total! - 1, 'the bar never reads 100% before the summary is in')

  assert.ok(result.transcript.length >= 1, 'speech was transcribed')
  assert.match(result.transcript.map((t) => t.text).join(' ').toLowerCase(), /quick test sentence/)
  assert.deepEqual(new Set(result.transcript.map((t) => t.speaker)), new Set(['Hablante 1']), 'one voice, one speaker')
  assert.ok(steps.some((p) => p.label === 'Separando quién habla...'))
  assert.ok(result.scenes.length >= 4, `scenes from frames: ${result.scenes.length}`)
  assert.deepEqual(result.scenes.map((s) => s.index), result.scenes.map((_, i) => i))
  assert.equal(result.summary.short_summary, 'Prueba')
  assert.ok(calls.length >= 2, 'at least one window plus the summary call')
  const windowCalls = calls.filter((c) => c.frames.length > 0)
  assert.ok(windowCalls.every((c) => c.frames.length <= WINDOW_FRAMES))
  assert.ok(windowCalls.some((c) => /quick test sentence/i.test(c.transcript)), 'speech reaches the vision model as text')
  assert.ok(existsSync(path.join(work, 'audio.wav')))
})

function fakeProvider(calls: VisionRequest[]): VisionProvider {
  return {
    name: 'fake',
    available: () => true,
    async describe(req) {
      calls.push(req)
      if (req.frames.length === 0) {
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
}

test('a retry resumes from the checkpoint without transcribing or asking again', { timeout: 300_000 }, async () => {
  const video = makeVideo()
  const work = mkdtempSync(path.join(tmpdir(), 'perception-resume-'))
  let saved: PerceptionCheckpoint | undefined
  const first = await perceive(video, work, {
    providers: [fakeProvider([])],
    whisperModel: 'tiny',
    language: 'en',
    onCheckpoint: (cp) => (saved = structuredClone(cp)),
  })
  assert.ok(saved?.transcript && Object.keys(saved.windows).length >= 1)

  // The checkpoint survives the trip through the jobs table as JSON.
  const checkpoint = parseCheckpoint(JSON.stringify(saved))
  assert.ok(checkpoint)
  assert.equal(parseCheckpoint('{"windows":[]}'), undefined, 'the Gemini engine checkpoint is not ours')

  // Only the summary may reach the model now; a window call would throw.
  const calls: VisionRequest[] = []
  const summaryOnly = fakeProvider(calls)
  const logs: string[] = []
  const again = await perceive(video, work, {
    providers: [{ ...summaryOnly, describe: (r) => (r.frames.length ? Promise.reject(new Error('ventana repetida')) : summaryOnly.describe(r)) }],
    whisperModel: 'no-such-model',
    language: 'en',
    checkpoint,
    log: (m) => logs.push(m),
  })
  assert.deepEqual(again.scenes, first.scenes)
  assert.deepEqual(again.transcript, first.transcript)
  assert.equal(calls.length, 1)
  assert.ok(logs.some((m) => /transcripción retomada/.test(m)))
  assert.ok(logs.some((m) => /retomada del intento anterior/.test(m)))
})

test('platform captions replace Whisper and reach the model', { timeout: 300_000 }, async () => {
  const video = makeVideo()
  const work = mkdtempSync(path.join(tmpdir(), 'perception-captions-'))
  const calls: VisionRequest[] = []
  const captions = { language: 'es', segments: [{ start: 0.5, end: 6, text: 'Frase de los subtítulos' }] }
  // A Whisper model that does not exist: transcribing would throw.
  const result = await perceive(video, work, { providers: [fakeProvider(calls)], whisperModel: 'no-such-model', captions, diarize: false })
  assert.deepEqual(result.transcript.map((t) => t.text), ['Frase de los subtítulos'])
  assert.equal(result.transcript[0]!.language, 'es')
  assert.ok(calls.some((c) => /Frase de los subtítulos/.test(c.transcript ?? '')))
  assert.equal(existsSync(path.join(work, 'audio.wav')), false, 'no audio extracted for Whisper')

  // With speakers on, the audio is extracted for them alone and the captions get labels.
  const labelled = await perceive(video, mkdtempSync(path.join(tmpdir(), 'perception-captions-')), {
    providers: [fakeProvider([])], whisperModel: 'no-such-model', captions,
  })
  assert.equal(labelled.transcript[0]!.speaker, 'Hablante 1')

  // Captions covering under half the video are not trusted: Whisper runs (and
  // here fails, since its model does not exist).
  const partial = { language: 'es', segments: [{ start: 0.5, end: 2, text: 'Solo el principio' }] }
  await assert.rejects(perceive(video, mkdtempSync(path.join(tmpdir(), 'perception-captions-')), {
    providers: [fakeProvider([])], whisperModel: 'no-such-model', captions: partial, diarize: false,
  }))
})

test('a retry with platform captions keeps the speaker labels of the first attempt', { timeout: 300_000 }, async () => {
  const video = makeVideo()
  const captions = { language: 'es', segments: [{ start: 0.5, end: 6, text: 'Frase de los subtítulos' }] }
  let saved: PerceptionCheckpoint | undefined
  await perceive(video, mkdtempSync(path.join(tmpdir(), 'perception-captions-resume-')), {
    providers: [fakeProvider([])], whisperModel: 'no-such-model', captions, onCheckpoint: (cp) => (saved = structuredClone(cp)),
  })
  assert.equal(saved?.transcript?.segments[0]?.speaker, 'Hablante 1')
  // The worker passes the captions again together with the checkpoint.
  const again = await perceive(video, mkdtempSync(path.join(tmpdir(), 'perception-captions-resume-')), {
    providers: [fakeProvider([])], whisperModel: 'no-such-model', captions, checkpoint: parseCheckpoint(JSON.stringify(saved)),
  })
  assert.equal(again.transcript[0]!.speaker, 'Hablante 1', 'the resumed run used to read the unlabelled captions (null)')
})

test('when a window fails, the others stop asking and the job fails at once', { timeout: 300_000 }, async () => {
  // 21 s at 30 fps, every frame kept: 630 frames, three windows.
  const dir = mkdtempSync(path.join(tmpdir(), 'perception-stop-'))
  const video = path.join(dir, 'busy.mp4')
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:d=21:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video])
  const asked = [0, 0, 0]
  const busy: VisionProvider = {
    name: 'busy-' + Math.random(),
    available: () => true,
    async describe(req) {
      const n = Math.min(2, Math.floor(req.frames[0]!.time / 10))
      asked[n]!++
      // The first window is refused for good a moment later; the second finds
      // the model saturated, to be asked again in a second.
      if (n === 0) {
        await new Promise((r) => setTimeout(r, 200))
        throw new Error('HTTP 400 imagen no válida')
      }
      throw new ProviderOverloadedError('busy', 503, 'UNAVAILABLE high demand', 1_000)
    },
  }
  const saved = process.env.VISION_CONCURRENCY
  process.env.VISION_CONCURRENCY = '2'
  try {
    await assert.rejects(
      perceive(video, path.join(dir, 'work'), { providers: [busy], frameOptions: { ...DEFAULT_FRAME_OPTIONS, dedupThreshold: 0, width: 160 } }),
      /HTTP 400 imagen no válida/,
    )
  } finally {
    if (saved === undefined) delete process.env.VISION_CONCURRENCY
    else process.env.VISION_CONCURRENCY = saved
  }
  // Long enough for every retry round of the second window and then the third window.
  await new Promise((r) => setTimeout(r, 6_000))
  assert.deepEqual(asked, [1, 1, 0], 'after the failure, the second window stopped retrying and the third was never asked')
})

test("at Google's own resolution the windows are cut to what one request can carry", { timeout: 300_000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'perception-hires-'))
  const video = path.join(dir, 'clip.mp4')
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:d=12:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video])
  const calls: VisionRequest[] = []
  const saved = process.env.GEMINI_MEDIA_RESOLUTION
  process.env.GEMINI_MEDIA_RESOLUTION = ''
  try {
    await perceive(video, path.join(dir, 'work'), { providers: [fakeProvider(calls)], frameOptions: { ...DEFAULT_FRAME_OPTIONS, dedupThreshold: 0, width: 160 } })
  } finally {
    if (saved === undefined) delete process.env.GEMINI_MEDIA_RESOLUTION
    else process.env.GEMINI_MEDIA_RESOLUTION = saved
  }
  const sizes = calls.filter((c) => c.frames.length > 0).map((c) => c.frames.length)
  // Not 300 + 60: a 300-frame request is about 333k tokens, refused by Google every time.
  assert.deepEqual(sizes.sort((a, b) => b - a), [175, 175, 10])
})

test('a failed speaker step leaves the analysis complete, without labels', { timeout: 300_000 }, async () => {
  const video = makeVideo()
  const saved = process.env.DIARIZATION_MODEL_PATH
  process.env.DIARIZATION_MODEL_PATH = '/no/such/model.onnx'
  const logs: string[] = []
  try {
    const result = await perceive(video, mkdtempSync(path.join(tmpdir(), 'perception-nodiar-')), {
      providers: [fakeProvider([])], whisperModel: 'tiny', language: 'en', log: (m) => logs.push(m),
    })
    assert.ok(result.transcript.length >= 1)
    assert.ok(result.transcript.every((t) => t.speaker === null))
    assert.ok(logs.some((m) => /no se pudo separar quién habla/.test(m)))
  } finally {
    if (saved === undefined) delete process.env.DIARIZATION_MODEL_PATH
    else process.env.DIARIZATION_MODEL_PATH = saved
  }
})

test('a video without audio is analyzed from frames alone', { timeout: 300_000 }, async () => {
  const video = makeVideo({ silent: true })
  const work = mkdtempSync(path.join(tmpdir(), 'perception-silent-'))
  const calls: VisionRequest[] = []
  const result = await perceive(video, work, { providers: [fakeProvider(calls)], whisperModel: 'tiny' })
  assert.equal(result.transcript.length, 0)
  assert.ok(result.scenes.length >= 4)
  assert.equal(existsSync(path.join(work, 'audio.wav')), false)
  assert.ok(calls.filter((c) => c.frames.length > 0).every((c) => c.transcript === ''))
})

test('parseWindowReply repairs what the database would reject', () => {
  const w = { start: 10, end: 20 }
  const out = parseWindowReply(JSON.stringify({
    scenes: [
      { start_seconds: 12, end_seconds: 11, title: '', description: 'fin antes que inicio' },
      { start_seconds: 'x', description: 'sin tiempo' },
      { start_seconds: 5, end_seconds: 99, description: 'fuera de la ventana' },
    ],
    elements: [
      { kind: 'logo', label: 'Nike', start_seconds: 12 },
      { kind: 'person', label: '', start_seconds: 12 },
    ],
  }), w)
  assert.equal(out.scenes.length, 2)
  assert.deepEqual([out.scenes[0]!.start_seconds, out.scenes[0]!.end_seconds], [10, 20], 'sorted by time')
  assert.deepEqual([out.scenes[1]!.start_seconds, out.scenes[1]!.end_seconds], [12, 20], 'the last one reaches the window end')
  assert.equal(out.scenes[1]!.title, 'fin antes que inicio')
  assert.equal(out.elements.length, 1)
  assert.equal(out.elements[0]!.kind, 'object')
  assert.throws(() => parseWindowReply('{"scenes":[]}', w), /ninguna escena válida/)
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

test('Claude, as the fallback, sees an even sample of at most 100 frames', () => {
  const frames = Array.from({ length: 300 }, (_, i) => i)
  const sample = evenlySpaced(frames, CLAUDE_MAX_IMAGES)
  assert.equal(sample.length, 100)
  assert.equal(sample[0], 0)
  assert.equal(sample.at(-1), 299)
  assert.deepEqual(evenlySpaced([1, 2, 3], 100), [1, 2, 3])
})

test('no part of a window is left without a scene', () => {
  const scene = (a: number, b: number) => ({ start_seconds: a, end_seconds: b, title: 't', description: 'd', audio_description: null })
  const scenes = [scene(130, 200), scene(3, 100)]
  closeGaps(scenes, { start: 0, end: 210 })
  assert.deepEqual(scenes.map((s) => [s.start_seconds, s.end_seconds]), [[0, 130], [130, 210]], 'small gaps closed, in order')
  assert.throws(() => closeGaps([scene(0, 100), scene(700, 1000)], { start: 0, end: 1000 }), /600 s del tramo sin describir/)
  assert.match(windowInstruction({ start: 0, end: 1083 }), /del segundo 0\.0 al 1083\.0.*sin huecos.*120 segundos/s)
})
