import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { perceive } from '../src/perceive.ts'
import { coverTimeline, phase3Problem, recreationByShot, renumberTexts, shotsFrom, v6Windows, withVoices, V6_PERCEPTION_PHASE1_SCHEMA, V6_PERCEPTION_WINDOW_SCHEMA } from '../src/v6/record.ts'
import type { VisionProvider, VisionRequest } from '../src/providers/types.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const speech = path.join(here, 'fixtures-speech.wav')

/** 8 s: red, green, blue, yellow (three cuts) with the speech fixture over it. */
function makeVideo(): string {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'v6-')), 'test.mp4')
  execFileSync('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y',
    ...['red', 'green', 'blue', 'yellow'].flatMap((c) => ['-f', 'lavfi', '-i', `color=c=${c}:s=320x180:d=2:r=30`]),
    '-i', speech,
    '-filter_complex', '[0][1][2][3]concat=n=4:v=1:a=0[v];[4]apad=whole_dur=8[a]',
    '-map', '[v]', '-map', '[a]', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out,
  ])
  return out
}

/** Answers each phase of the record by the schema it is asked for, and keeps every request. */
function fakeGemini(calls: VisionRequest[]): VisionProvider {
  return {
    name: 'fake-v6',
    available: () => true,
    async describe(req) {
      calls.push(req)
      if (req.schema === V6_PERCEPTION_PHASE1_SCHEMA) {
        return JSON.stringify({
          ficha: { duracion: 'x', duracion_origen: 'x', relacion_aspecto: 'horizontal', planos: 1, naturaleza: 'animación', audio: 'habla', sujetos: 'ninguno', idioma_habla: 'inglés', tags: ['color'] },
          ficha_tecnica: { duracion_archivo: 'x', ultimo_contenido_observable: 'x', numero_planos: 1, duracion_media_plano: 'x', plano_mas_largo: 'x', plano_mas_corto: 'x' },
          triaje: { eje0_fuente: 'video' },
          procedencia: ['sin marcas de agua'],
          entidades: [{ id: 'E1', primera_aparicion: '00:00', descripcion_fisica: 'campo de color uniforme', identificacion: 'NO DETERMINABLE', apariciones: '00:00–00:08' }],
          textos_pantalla: [],
        })
      }
      if (req.schema === V6_PERCEPTION_WINDOW_SCHEMA) {
        const [a, b] = /del segundo ([\d.]+) .* al ([\d.]+)/.exec(req.instruction)!.slice(1).map(Number) as [number, number]
        const ownBlock = /PLANOS QUE EMPIEZAN EN ESTE TRAMO[^\n]*\n([\s\S]*?)\n\n/.exec(req.instruction)![1]!
        const own = [...ownBlock.matchAll(/^(PL\d+) —/gm)].map((m) => m[1]!)
        const timeline = []
        for (let t = a; t < b; t++) {
          timeline.push({ start_seconds: t, end_seconds: Math.min(t + 1, b), sin_cambios: false, vis: `E1 en ${t}s; TX1 visible`, aud: 'VOZ1 habla', txt: 'TX1 visible', cam: 'sin cambios', cortes: [] })
        }
        return JSON.stringify({
          timeline,
          textos_pantalla: [{ id: 'TX1', aparece: '00:00', desaparece: '00:08', duracion: '8 s', tipo: 'rótulo', posicion: 'arriba', contenido: 'HOLA', apariencia: 'blanco', animacion: 'seca' }],
          cambios_estado: [{ timestamp: '00:02', antes: 'E1 rojo', transicion: 'CORTE', despues: 'E1* verde', no_determinable: 'continuidad' }],
          escenas: [{ start_seconds: a, end_seconds: b, title: 'Colores', description: 'campos de color', audio_description: 'VOZ1 habla' }],
          elementos: [{ kind: 'on_screen_text', label: 'HOLA', detail: 'arriba', start_seconds: a, end_seconds: b }],
          entidades_nuevas: [],
          // Every shot the window owns, as listed in its instruction.
          planos: own.map((id) => ({ id, escala: id === 'PL2' ? 'general' : 'medio', angulo: 'frontal', altura: 'ND', movimiento: 'fija', composicion: 'E1 llena el cuadro', fondo_superficie: 'E1', iluminacion: 'uniforme', entrada_salida: 'corte' })),
          recreacion: own.map((id) => ({ plano: id, sujetos_estado_inicial: 'E1', accion: `campo de color en ${id}; TX1 visible`, camara: 'fija', luz_entorno: 'uniforme', audio: 'VOZ1', texto: 'TX1', estado_final: 'E1' })),
          limites: [],
        })
      }
      return JSON.stringify({
        resumen_corto: 'Cuatro campos de color con voz.',
        resumen_completo: 'Un video de colores con una frase hablada.',
        idioma: 'en',
        temas: ['color'],
        gramatica: { ritmo_montaje: 'PL1 2s…', estructura_temporal: { secuencia_tramos: 'x', hitos: 'x' }, sincronia: 'x', coreografia_texto: 'x', continuidad: 'x', diseno_sonoro: 'x', arquitectura_retencion: {}, sujeto_principal_manipulacion: {} },
        plan_rodaje: { setup: 'x', secuencia: 'x', sujetos: 'Sin rostro en la fuente' },
        funcion: [],
        interpretacion: ['[INT] TÉCNICA DE APERTURA: color.'],
        patrones: [],
        recreacion: [],
        limites: ['solo un patrón'],
      })
    },
  }
}

test('perceive under protocol v6 writes the full record: measured shots, timeline with sound, texts and synthesis', { timeout: 300_000 }, async () => {
  const calls: VisionRequest[] = []
  const result = await perceive(makeVideo(), mkdtempSync(path.join(tmpdir(), 'v6-work-')), {
    protocol: 'v6',
    providers: [fakeGemini(calls)],
    whisperModel: 'tiny',
    language: 'en',
    diarize: false,
    title: 'colores.mp4',
  })
  const md = result.protocolRecord!.markdown
  for (const section of ['9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7', '9.8', '9.9', '9.10', '9.11', '9.12', '9.13', '9.14']) {
    assert.match(md, new RegExp(`## ${section.replace('.', '\\.')} `), `section ${section}`)
  }
  assert.match(md, /^---\ntipo: analisis-video\nprotocolo: v6\.5/)
  assert.match(md, /acceso: muestreado/)
  assert.match(md, /NÚMERO DE PLANOS: 4/, 'three measured cuts: four shots')
  assert.match(md, /\*\*PL4\*\* — 00:06/)
  assert.match(md, /ESCALA: general/, "the model's description is kept for its shot")
  assert.match(md, /\[00:07–00:08\]/, 'the timeline reaches the end')
  assert.match(md, /T1 — 00:0\d.* — VOZ1: ".*quick test sentence/i)
  assert.match(md, /\*\*TX1\*\* — aparece 00:00/)
  assert.match(md, /MAPA DE COBERTURA: VIS: fotogramas en/)
  assert.match(md, /CORTE en 00:02(?:\.0+)? → PL2/, 'cuts in 9.5 come from the measurement, even when the model lists none')
  for (const id of ['PL1', 'PL2', 'PL3', 'PL4']) assert.match(md, new RegExp(`campo de color en ${id}`), `9.13 has ${id}, written by its window`)
  assert.doesNotMatch(md, /ningún tramo/)

  const windows = calls.filter((c) => c.schema === V6_PERCEPTION_WINDOW_SCHEMA)
  assert.ok(windows.length >= 1)
  assert.ok(windows.every((w) => w.audio && w.audio.mimeType === 'audio/ogg'), 'every window hears its sound')
  assert.ok(windows.every((w) => /CORTES MEDIDOS EN ESTE TRAMO \[META\]: 00:02/.test(w.instruction)))
  assert.equal(calls.length, windows.length + 2, 'phase 1 + one request per window + synthesis')
  assert.ok(!('planos' in (V6_PERCEPTION_PHASE1_SCHEMA.properties as object)), 'phase 1 no longer writes the shots')
  assert.ok(!calls.some((c) => /MAPA DE PLANOS \(9\.4\)/.test(c.instruction) && c.schema === V6_PERCEPTION_WINDOW_SCHEMA), 'windows do not carry every shot of the video')
  assert.ok(calls.every((c) => c.instruction.length < 60_000), 'the distilled protocol, not the 30k-token full text, goes with each call')

  assert.equal(result.summary.short_summary, 'Cuatro campos de color con voz.')
  assert.equal(result.scenes[0]!.title, 'Colores')
  assert.ok(result.elements.some((e) => e.kind === 'on_screen_text' && e.label === 'HOLA'))
})

test('a resumed analysis with its transcript saved still hears every window', { timeout: 300_000 }, async () => {
  const calls: VisionRequest[] = []
  const transcript = { language: 'en', segments: [{ start: 0.5, end: 2.5, text: 'This is a quick test sentence.' }] }
  const result = await perceive(makeVideo(), mkdtempSync(path.join(tmpdir(), 'v6-resume-')), {
    protocol: 'v6',
    providers: [fakeGemini(calls)],
    diarize: false,
    checkpoint: { engine: 'perception', version: 1, windows: {}, transcript },
  })
  assert.match(result.protocolRecord!.markdown, /quick test sentence/)
  assert.ok(calls.filter((c) => c.schema === V6_PERCEPTION_WINDOW_SCHEMA).every((w) => w.audio), 'the sound is extracted again for the windows')
})

test('shots come from the measured cuts and windows cover the whole video', () => {
  assert.deepEqual(
    shotsFrom([{ time: 2, score: 20 }, { time: 2.1, score: 20 }, { time: 5, score: 30 }], 8).map((s) => [s.id, s.start, s.end]),
    [['PL1', 0, 2], ['PL2', 2, 5], ['PL3', 5, 8]],
  )
  const frames = Array.from({ length: 700 }, (_, i) => ({ path: `${i}.jpg`, time: i * 0.5 }))
  const w = v6Windows(frames, 350)
  assert.equal(w[0]!.start, 0)
  assert.equal(w.at(-1)!.end, 350)
  for (let i = 1; i < w.length; i++) assert.equal(w[i]!.start, w[i - 1]!.end, 'contiguous')
  assert.ok(w.every((x) => x.frames.length <= 300 && x.end - x.start <= 240))
})

test('a timeline with a small hole is completed and declared; a big one is asked again', () => {
  const entry = (a: number, b: number, sin_cambios = true) => ({ start_seconds: a, end_seconds: b, sin_cambios, vis: 'v', aud: 'a', txt: 't', cam: 'c', cortes: [] })
  const out = coverTimeline({ timeline: [entry(0, 10), entry(12, 40)] } as never, { start: 0, end: 40 })
  assert.deepEqual(out.timeline.map((e) => [e.start_seconds, e.end_seconds]), [[0, 10], [10, 12], [12, 40]])
  assert.match(out.filled[0]!, /00:10–00:12/)
  assert.throws(() => coverTimeline({ timeline: [entry(0, 10)] } as never, { start: 0, end: 40 }), /30 s del tramo sin registrar/)
})

test('seconds with changes grouped into long entries are rejected; stable stretches may span', () => {
  const entry = (a: number, b: number, sin_cambios: boolean) => ({ start_seconds: a, end_seconds: b, sin_cambios, vis: 'v', aud: 'a', txt: 't', cam: 'c', cortes: [] })
  const perSecond = Array.from({ length: 20 }, (_, i) => entry(i, i + 1, false))
  assert.equal(coverTimeline({ timeline: [...perSecond, entry(20, 40, true)] } as never, { start: 0, end: 40 }).timeline.length, 21)
  assert.throws(
    () => coverTimeline({ timeline: [entry(0, 10, false), entry(10, 22, false), entry(22, 40, true)] } as never, { start: 0, end: 40 }),
    /agrupa 22 s con cambios/,
  )
  const one = coverTimeline({ timeline: [...perSecond.slice(0, 35 - 15), entry(20, 25, false), entry(25, 40, true)] } as never, { start: 0, end: 40 })
  assert.match(one.filled.join(' '), /00:20–00:25\] granularidad reducida/)
})

test('on-screen texts are numbered across windows by first appearance, references follow', () => {
  const tx = (id: string, aparece: string) => ({ id, aparece, desaparece: '', duracion: '', tipo: '', posicion: '', contenido: id, apariencia: '', animacion: '' })
  const { list, rename } = renumberTexts([{ textos_pantalla: [tx('TX1-t1', '00:05')] }, { textos_pantalla: [tx('TX1', '04:10'), tx('TX2', '04:01')] }])
  assert.deepEqual(list.map((t) => [t.id, t.contenido]), [['TX1', 'TX1-t1'], ['TX2', 'TX2'], ['TX3', 'TX1']])
  assert.equal(rename(1, 'TX1 y TX2 visibles'), 'TX3 y TX2 visibles', 'one pass, no chained renames')
  assert.equal(rename(0, 'TX1-t1 aparece'), 'TX1 aparece')
})

test('voices get their acoustic description from the windows that heard them', () => {
  const p1 = { entidades: [{ id: 'VOZ1', primera_aparicion: '00:01', descripcion_fisica: 'Descripción acústica en la fase 2.', identificacion: 'NO DETERMINABLE', apariciones: '00:01–00:05' }] } as never as Parameters<typeof withVoices>[0]
  withVoices(p1, [{ voces: [{ id: 'VOZ 1', descripcion_acustica: 'tono medio, ritmo rápido' }] }, { voces: [{ id: 'VOZ1', descripcion_acustica: 'tono medio, ritmo rápido' }, { id: 'S1', descripcion_acustica: 'pitido agudo de 0,2 s' }] }])
  assert.equal(p1.entidades[0]!.descripcion_fisica, 'tono medio, ritmo rápido', 'same description once')
  assert.equal(p1.entidades[1]!.id, 'S1')
})

test('9.13 follows the measured shots; one no window wrote is [ND] and declared', () => {
  const shots = [{ id: 'PL1', start: 0, end: 2 }, { id: 'PL2', start: 2, end: 5 }]
  const r = (plano: string) => ({ plano, sujetos_estado_inicial: 's', accion: 'TX1 aparece', camara: 'c', luz_entorno: 'l', audio: 'a', texto: 'TX1', estado_final: 'e' })
  const { list, missing } = recreationByShot(shots, [{ recreacion: [r('pl 1')] }, { recreacion: [] }], (w, s) => s.replace('TX1', `TX${w + 7}`))
  assert.deepEqual(list.map((x) => [x.plano, x.duracion, x.texto]), [['PL1', '2.00 s [META]', 'TX7'], ['PL2', '3.00 s [META]', '[ND]']])
  assert.equal(missing.length, 1)
  assert.match(missing[0]!, /PL2/)
})

for (const skipped of ['planos', 'recreacion'] as const) test(`a window that skips most of its shots (${skipped}) is asked again`, { timeout: 300_000 }, async () => {
  const calls: VisionRequest[] = []
  const good = fakeGemini(calls)
  const lazy: VisionProvider = {
    name: 'lazy',
    available: () => true,
    async describe(req) {
      const out = JSON.parse(await good.describe(req))
      if (req.schema === V6_PERCEPTION_WINDOW_SCHEMA) out[skipped] = []
      return JSON.stringify(out)
    },
  }
  const result = await perceive(makeVideo(), mkdtempSync(path.join(tmpdir(), 'v6-lazy-')), {
    protocol: 'v6', providers: [lazy, { ...good, name: 'good' }], whisperModel: 'tiny', language: 'en', diarize: false,
  })
  assert.match(result.protocolRecord!.markdown, /\*\*PL4\*\* — 00:06/)
  assert.match(result.protocolRecord!.markdown, /ESCALA: general/, 'the description comes from the second answer')
  assert.doesNotMatch(result.protocolRecord!.markdown, /ningún tramo/)
})

test('a window no model answers whole is split in two halves, asked in parallel', { timeout: 300_000 }, async () => {
  const video = path.join(mkdtempSync(path.join(tmpdir(), 'v6-split-')), 'long.mp4')
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=30:r=10', '-f', 'lavfi', '-i', 'sine=f=440:d=30', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video])
  const calls: VisionRequest[] = []
  const good = fakeGemini(calls)
  // Like Flash-Lite on 19 Oct 2026: a long window comes back with its seconds grouped.
  const grouping: VisionProvider = {
    name: 'grouping',
    available: () => true,
    async describe(req) {
      const out = JSON.parse(await good.describe(req))
      if (req.schema === V6_PERCEPTION_WINDOW_SCHEMA) {
        const [a, b] = /del segundo ([\d.]+) .* al ([\d.]+)/.exec(req.instruction)!.slice(1).map(Number) as [number, number]
        if (b - a > 20) out.timeline = [{ start_seconds: a, end_seconds: b, sin_cambios: false, vis: 'todo junto', aud: 'a', txt: 't', cam: 'c', cortes: [] }]
      }
      return JSON.stringify(out)
    },
  }
  const logs: string[] = []
  let saved: unknown
  const result = await perceive(video, mkdtempSync(path.join(tmpdir(), 'v6-split-w-')), {
    protocol: 'v6', providers: [grouping], whisperModel: 'tiny', language: 'en', diarize: false, log: (m) => logs.push(m),
    onCheckpoint: (c) => { saved = JSON.parse(JSON.stringify(c)) },
  })
  const md = result.protocolRecord!.markdown
  assert.ok(logs.some((l) => /se parte en dos mitades/.test(l)))
  const windows = calls.filter((c) => c.schema === V6_PERCEPTION_WINDOW_SCHEMA)
  assert.equal(windows.length, 3, 'the whole window once, then its two halves')
  assert.ok(windows.slice(1).every((w) => /ESTE TRAMO: 1[ab] de 1/.test(w.instruction)))
  assert.match(md, /\[00:29–00:30/, 'the timeline reaches the end')
  assert.doesNotMatch(md, /todo junto/)
  assert.match(md, /\*\*TX1\*\*/)
  assert.doesNotMatch(md, /TX\d+-t1[ab]/, 'texts from the halves are renumbered')

  // Resumed before the synthesis: the halves are reused, the whole window is not asked again.
  const resumed = saved as { v6: { phase3?: unknown } }
  delete resumed.v6.phase3
  const again: VisionRequest[] = []
  await perceive(video, mkdtempSync(path.join(tmpdir(), 'v6-split-r-')), {
    protocol: 'v6', providers: [fakeGemini(again)], whisperModel: 'tiny', language: 'en', diarize: false, checkpoint: resumed as never,
  })
  assert.equal(again.filter((c) => c.schema === V6_PERCEPTION_WINDOW_SCHEMA).length, 0)
})

test('a half that cannot be split again keeps its grouped seconds, declared [BAJA]', () => {
  const entry = (a: number, b: number) => ({ start_seconds: a, end_seconds: b, sin_cambios: false, vis: 'v', aud: 'a', txt: 't', cam: 'c', cortes: [] })
  const grouped = { timeline: [entry(0, 8), entry(8, 15)] } as never
  assert.throws(() => coverTimeline(grouped, { start: 0, end: 15 }), /agrupa 15 s/)
  const kept = coverTimeline(grouped, { start: 0, end: 15 }, { lenient: true })
  assert.equal(kept.timeline.length, 2)
  assert.equal(kept.filled.filter((l) => /granularidad reducida/.test(l)).length, 2)
})

test('holes add up: many short holes that leave most of the window empty are asked again', () => {
  const entry = (a: number, b: number) => ({ start_seconds: a, end_seconds: b, sin_cambios: false, vis: 'v', aud: 'a', txt: 't', cam: 'c', cortes: [] })
  const sparse = { timeline: [entry(0, 4), entry(29, 33), entry(58, 62), entry(87, 91), entry(119, 120)] } as never
  assert.throws(() => coverTimeline(sparse, { start: 0, end: 120 }), /103 s del tramo sin registrar/)
})

test('a "no changes" entry that spans a measured cut or a new line of speech is not stable', () => {
  const entry = (a: number, b: number, sin_cambios: boolean) => ({ start_seconds: a, end_seconds: b, sin_cambios, vis: 'SIN CAMBIOS OBSERVABLES', aud: 'a', txt: 't', cam: 'c', cortes: [] })
  const perSecond = Array.from({ length: 104 }, (_, i) => entry(i, i + 1, false))
  const out = coverTimeline({ timeline: [...perSecond, entry(104, 120, true)] } as never, { start: 0, end: 120 }, { marks: [{ time: 113.5, what: 'un corte medido' }, { time: 117, what: 'el inicio de T19' }] })
  const last = out.timeline.at(-1)!
  assert.equal(last.sin_cambios, false)
  assert.ok(out.filled.some((l) => /01:44–02:00\] marcada sin cambios pero contiene un corte medido en 01:53\.50, el inicio de T19 en 01:57 \[BAJA\]/.test(l)), out.filled.join(' | '))
})

test('a text on screen across a window border stays one text', () => {
  const tx = (id: string, aparece: string, desaparece: string, contenido: string) => ({ id, aparece, desaparece, duracion: '', tipo: 'rótulo', posicion: 'abajo', contenido, apariencia: '', animacion: '' })
  const { list, rename } = renumberTexts(
    [{ textos_pantalla: [tx('TX1', '09:46.0', '09:49.7', 'JEFF KEEGAN\nMiembro')] }, { textos_pantalla: [tx('TX1-t2', '09:49.68', '09:53.0', 'Jeff Keegan miembro'), tx('TX2-t2', '09:50', '09:51', 'otro')] }],
    [589.68, 709.68],
  )
  assert.deepEqual(list.map((t) => [t.id, t.aparece, t.desaparece]), [['TX1', '09:46.0', '09:53.0'], ['TX2', '09:50', '09:51']])
  assert.equal(rename(1, 'TX1-t2 visible'), 'TX1 visible')
})

test('a synthesis missing a section is refused, so it is never saved and replayed', () => {
  const ok = { resumen_corto: 'x', gramatica: {}, plan_rodaje: {}, temas: [], funcion: [], interpretacion: [], patrones: [], limites: [] }
  assert.equal(phase3Problem(ok), '')
  const { gramatica: _g, ...noGrammar } = ok
  assert.equal(phase3Problem(noGrammar), 'falta gramatica')
  assert.equal(phase3Problem(null), 'no es un objeto')
})

test('once a window fails for good, no new window is asked; those in flight finish and are kept', { timeout: 300_000 }, async () => {
  const video = path.join(mkdtempSync(path.join(tmpdir(), 'v6-stop-')), 'long.mp4')
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=95:r=5', '-f', 'lavfi', '-i', 'sine=f=440:d=95', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video])
  const calls: VisionRequest[] = []
  const good = fakeGemini(calls)
  const breaking: VisionProvider = {
    name: 'breaking',
    available: () => true,
    async describe(req) {
      if (req.schema === V6_PERCEPTION_WINDOW_SCHEMA) {
        if (/del segundo 0\.0 /.test(req.instruction)) {
          calls.push(req)
          throw new Error('breaking HTTP 400: imagen no válida')
        }
        await new Promise((r) => setTimeout(r, 300))
      }
      return good.describe(req)
    },
  }
  const saved = { windows: process.env.VISION_CONCURRENCY, size: process.env.V6_WINDOW_SECONDS }
  process.env.VISION_CONCURRENCY = '2'
  process.env.V6_WINDOW_SECONDS = '30'
  let checkpoint: { v6?: { windows: Record<string, unknown> } } | undefined
  try {
    await assert.rejects(
      perceive(video, mkdtempSync(path.join(tmpdir(), 'v6-stop-w-')), {
        protocol: 'v6', providers: [breaking], whisperModel: 'tiny', language: 'en', diarize: false,
        onCheckpoint: (c) => { checkpoint = JSON.parse(JSON.stringify(c)) },
      }),
      /imagen no válida/,
    )
  } finally {
    process.env.VISION_CONCURRENCY = saved.windows
    process.env.V6_WINDOW_SECONDS = saved.size
  }
  await new Promise((r) => setTimeout(r, 1500)) // windows asked after the failure would show up here
  assert.equal(calls.filter((c) => c.schema === V6_PERCEPTION_WINDOW_SCHEMA).length, 2, 'the failed window and the one already in flight')
  assert.equal(Object.keys(checkpoint!.v6!.windows).length, 1, 'the one in flight was saved for the retry')
})
