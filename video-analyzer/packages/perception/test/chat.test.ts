import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askVideo, buildChatContext, formatTimestamp, type ChatVideo } from '../src/chat.ts'
import { ProviderOverloadedError, type VisionProvider, type VisionRequest } from '../src/providers/types.ts'

const video: ChatVideo = {
  title: 'Licuadora portátil',
  durationSeconds: 29,
  summary: { short: 'Presentación de una licuadora', full: 'Un narrador presenta una licuadora USB.', topics: ['cocina'] },
  scenes: [
    { start: 0, end: 7, title: 'Intro', description: 'Fondo azul', audio: null },
    { start: 14, end: 21, title: 'Batido', description: 'Fondo verde', audio: 'licuadora encendida' },
  ],
  transcript: [
    { start: 0, end: 4.5, speaker: null, text: 'Hoy vamos a mostrar un producto nuevo.' },
    { start: 20.4, end: 25.6, speaker: 'Narrador', text: 'El precio es de 29 dólares con envío gratis.' },
  ],
  elements: [{ kind: 'object', label: 'licuadora portátil', detail: 'carga por USB', start: 5, end: 10 }],
}

const answering = (answer: string, seen: VisionRequest[] = []): VisionProvider => ({
  name: 'fake',
  available: () => true,
  async describe(req) {
    seen.push(req)
    return answer
  },
})

test('formatTimestamp uses m:ss and h:mm:ss', () => {
  assert.equal(formatTimestamp(0), '0:00')
  assert.equal(formatTimestamp(20.4), '0:20')
  assert.equal(formatTimestamp(65), '1:05')
  assert.equal(formatTimestamp(3725), '1:02:05')
})

test('the context is one timeline in time order, with what is seen and what is heard', () => {
  const ctx = buildChatContext(video, '¿cuánto cuesta?')
  assert.match(ctx, /VIDEO: Licuadora portátil/)
  assert.match(ctx, /RESUMEN: Un narrador presenta/)
  const order = ['[0:00–0:07] ESCENA "Intro"', '[0:00–0:04] VOZ: Hoy', '[0:05–0:10] OBJETO: licuadora portátil — carga por USB', '[0:14–0:21] ESCENA "Batido": Fondo verde (audio: licuadora encendida)', '[0:20–0:25] VOZ (Narrador): El precio']
  let last = -1
  for (const piece of order) {
    const at = ctx.indexOf(piece)
    assert.ok(at > last, `${piece} en orden`)
    last = at
  }
})

test('a long video is trimmed around what the question asks, keeping time order', () => {
  const long: ChatVideo = {
    ...video,
    durationSeconds: 3600,
    scenes: [],
    elements: [],
    transcript: Array.from({ length: 2000 }, (_, i) => ({
      start: i * 1.8,
      end: i * 1.8 + 1.7,
      speaker: null,
      text: i === 1500 ? 'Y el precio final es de cuarenta dólares.' : `Frase de relleno número ${i} sin nada especial.`,
    })),
  }
  const ctx = buildChatContext(long, '¿Cuál es el PRECIO?', 8_000)
  assert.ok(ctx.length <= 8_000, `cabe en el presupuesto: ${ctx.length}`)
  assert.match(ctx, /extracto/)
  assert.match(ctx, /precio final es de cuarenta/)
  assert.match(ctx, /relleno número 1499 /) // its neighbours come along
  assert.match(ctx, /relleno número 1501 /)
  assert.match(ctx, /relleno número 0 /) // and the rest of the video is still sampled
  const times = [...ctx.matchAll(/\[(\d+):(\d+):(\d+)–|\[(\d+):(\d+)–/g)].map((m) =>
    m[1] !== undefined ? +m[1] * 3600 + +m[2]! * 60 + +m[3]! : +m[4]! * 60 + +m[5]!,
  )
  assert.deepEqual(times, [...times].sort((a, b) => a - b))
})

test('askVideo sends the analysis, the history and the question as free text', async () => {
  const seen: VisionRequest[] = []
  const out = await askVideo({
    video,
    question: '¿Y el envío?',
    history: [
      { role: 'user', text: '¿Cuánto cuesta?' },
      { role: 'assistant', text: 'Cuesta 29 dólares [0:20].' },
    ],
    providers: [answering('  Es gratis [0:20].  ', seen)],
  })
  assert.deepEqual(out, { answer: 'Es gratis [0:20].', provider: 'fake' })
  const req = seen[0]!
  assert.equal(req.frames.length, 0)
  assert.equal(req.json, false)
  assert.equal(req.transcript, undefined) // no "this window has no voice" note
  assert.match(req.instruction, /El precio es de 29 dólares/)
  assert.match(req.instruction, /USUARIO: ¿Cuánto cuesta\?\nASISTENTE: Cuesta 29 dólares/)
  assert.match(req.instruction, /PREGUNTA: ¿Y el envío\?$/)
})

test('askVideo falls over to the next provider when one is saturated', async () => {
  const saturated: VisionProvider = {
    name: 'saturado-' + Math.random(),
    available: () => true,
    async describe() {
      throw new ProviderOverloadedError('gemini', 503, 'high demand')
    },
  }
  const out = await askVideo({ video, question: '¿Qué se vende?', providers: [saturated, answering('Una licuadora [0:05].')] })
  assert.equal(out.provider, 'fake')
})

test('an empty answer goes to the next provider instead of being shown', async () => {
  const blank = { ...answering('   '), name: 'blank-' + Math.random() }
  const out = await askVideo({ video, question: 'hola', providers: [blank, answering('Hola.')] })
  assert.equal(out.answer, 'Hola.')
})
