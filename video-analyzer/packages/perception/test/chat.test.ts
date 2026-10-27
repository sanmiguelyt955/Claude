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

// A V6.5 record shaped like the ones the analysis writes (sections 9.5 and 9.7 are what the chat reads).
const record = [
  '# Licuadora portátil',
  '',
  '## 9.4 Mapa de planos',
  '',
  '**PL1** — 00:00–00:29 (29 s [META])',
  '',
  '## 9.5 Línea de tiempo canónica',
  '',
  '[00:14–00:15]',
  'VIS: Pasa un vagón de metro con el número 4521 pintado en el lateral.',
  'AUD: VOZ1 habla — T2',
  'TXT: sin cambios',
  'CAM: fija',
  '',
  '[00:15–00:15.50]',
  'Plano fijo de la licuadora',
  'AUD: música',
  'CORTE en 00:15.50 → PL2',
  '',
  '## 9.6 Transcripción literal',
  '',
  'T1 — 00:00–00:04.50 — VOZ1: "Hoy vamos a mostrar un producto nuevo."',
  '',
  '## 9.7 Texto en pantalla',
  '',
  '**TX1** — aparece 00:02.40 / desaparece 00:05.10 (00:02.70)',
  'TIPO: texto dentro de la escena',
  'POSICIÓN: pantalla del portátil',
  'CONTENIDO: Laboratorio Abierto',
  '',
  '**TX2** — aparece [ND] / desaparece [ND]',
  'TIPO: rótulo superpuesto',
  'CONTENIDO: MARTA RUIZ',
  'Bióloga',
  '',
  '## 9.8 Registro diferencial de cambios de estado',
  '',
  '**00:15**',
  'ANTES: licuadora vacía',
].join('\n')

test('with a V6.5 record, its second-by-second detail and its on-screen texts reach the chat', () => {
  const ctx = buildChatContext({ ...video, record }, '¿Qué número tiene el vagón?')
  assert.match(ctx, /\[0:14–0:15\] DETALLE: VIS: Pasa un vagón de metro con el número 4521 pintado en el lateral\. · AUD: VOZ1 habla — T2 · TXT: sin cambios · CAM: fija/)
  assert.match(ctx, /\[0:15–0:15\] DETALLE: Plano fijo de la licuadora · AUD: música · CORTE en 00:15\.50 → PL2/)
  assert.match(ctx, /\[0:02–0:05\] TEXTO EN PANTALLA TX1: TIPO: texto dentro de la escena · POSICIÓN: pantalla del portátil · CONTENIDO: Laboratorio Abierto/)
  assert.match(ctx, /\[sin hora\] TEXTO EN PANTALLA TX2: TIPO: rótulo superpuesto · CONTENIDO: MARTA RUIZ · Bióloga/)
  assert.doesNotMatch(ctx, /T1 — 00:00/, 'the transcript is already there as VOZ lines')
  assert.doesNotMatch(ctx, /ANTES: licuadora vacía|PL1\*\*/, 'only 9.5 and 9.7 are read')
  assert.ok(ctx.indexOf('[0:02–0:05] TEXTO') < ctx.indexOf('[0:14–0:15] DETALLE'), 'merged into the timeline in time order')
})

test('a long record is trimmed like the rest, but every on-screen text stays', () => {
  const seconds = Array.from({ length: 3600 }, (_, i) =>
    i === 2500
      ? `[41:40–41:41]\nVIS: Pasa un vagón de metro con el número 4521.\nAUD: música`
      : `[${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}–${String(Math.floor((i + 1) / 60)).padStart(2, '0')}:${String((i + 1) % 60).padStart(2, '0')}]\nVIS: Persona trabajando en el taller, segundo ${i}.\nAUD: música`,
  )
  const texts = Array.from({ length: 30 }, (_, i) => `**TX${i + 1}** — aparece ${String(i * 2).padStart(2, '0')}:00 / desaparece ${String(i * 2).padStart(2, '0')}:05 (00:05)\nCONTENIDO: Rótulo número ${i + 1}`)
  const long = `## 9.5 Línea de tiempo canónica\n\n${seconds.join('\n\n')}\n\n## 9.7 Texto en pantalla\n\n${texts.join('\n\n')}\n`
  const ctx = buildChatContext({ ...video, durationSeconds: 3600, record: long }, '¿Qué número tiene el vagón del metro?', 20_000)
  assert.ok(ctx.length <= 20_000, `fits: ${ctx.length}`)
  assert.match(ctx, /extracto/)
  assert.match(ctx, /vagón de metro con el número 4521/)
  assert.equal((ctx.match(/TEXTO EN PANTALLA TX\d+: CONTENIDO: Rótulo número \d+/g) ?? []).length, 30)
  const times = [...ctx.matchAll(/^\[(?:(\d+):)?(\d+):(\d+)/gm)].map((m) => (+(m[1] ?? 0) * 3600) + +m[2]! * 60 + +m[3]!)
  assert.deepEqual(times, [...times].sort((a, b) => a - b))
})

test('askVideo reads the record and tells the model what DETALLE lines are', async () => {
  const seen: VisionRequest[] = []
  await askVideo({ video: { ...video, record }, question: '¿Qué pone en el portátil?', providers: [answering('Laboratorio Abierto [0:02].', seen)] })
  assert.match(seen[0]!.instruction, /DETALLE describen el video segundo a segundo/)
  assert.match(seen[0]!.instruction, /CONTENIDO: Laboratorio Abierto/)
})
