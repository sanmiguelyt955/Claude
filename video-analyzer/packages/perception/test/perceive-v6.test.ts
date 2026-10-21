import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { perceive } from '../src/perceive.ts'
import {
  coverTimeline,
  entitySeconds,
  fixPhase1,
  mergeFill,
  phase3Problem,
  probeVideo,
  recreationByShot,
  renumberTexts,
  shotsFrom,
  v6Windows,
  renumberEntities,
  withVoices,
  V6_PERCEPTION_PHASE1_SCHEMA,
  V6_PERCEPTION_WINDOW_SCHEMA,
} from '../src/v6/record.ts'
import type { VisionProvider, VisionRequest } from '../src/providers/types.ts'
import { ProviderOverloadedError } from '../src/providers/types.ts'

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
          procedencia_audio: ['ruido de fondo constante, sin saturación'],
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
  assert.match(md, /^- AUDIO \[tramo 1\]: ruido de fondo constante/m, '9.2 has the sound the windows heard')
  assert.match(md, /^MAPA DE BLOQUES: tramo 1: 00:00–00:08/m)
  assert.match(md, /^- EJE0 FUENTE: video; acceso muestreado: imagen muestreada .* y sonido directo continuo; alcance: video completo \[META\]/m)
  assert.match(md, /^- EJE6 DURACION: <10 s \(00:08/m)
  assert.match(md, /^relacion_aspecto: horizontal$/m, '320x180 measured, not the model\'s word')
  for (const id of ['PL1', 'PL2', 'PL3', 'PL4']) assert.match(md, new RegExp(`campo de color en ${id}`), `9.13 has ${id}, written by its window`)
  assert.doesNotMatch(md, /ningún tramo/)

  const windows = calls.filter((c) => c.schema === V6_PERCEPTION_WINDOW_SCHEMA)
  assert.ok(windows.length >= 1)
  assert.ok(windows.every((w) => w.audio && w.audio.mimeType === 'audio/ogg'), 'every window hears its sound')
  assert.ok(windows.every((w) => /CORTES MEDIDOS EN ESTE TRAMO \[META\]: 00:02/.test(w.instruction)))
  assert.ok(windows.every((w) => /del segundo 0\.00 \(00:00\) al 8\.\d\d /.test(w.instruction)), 'window times with two decimals')
  const synthesis = calls.at(-1)!.instruction
  assert.match(synthesis, /SEGUNDOS EN 9\.5 POR ENTIDAD[^\n]*\nE1: 8\.\d s \(100\.0 %\)/, 'screen time comes from 9.5')
  assert.match(synthesis, /9\.5 DE LA APERTURA \(00:00–00:04\):\n\[00:00–00:01\] VIS: E1 en 0s/)
  assert.match(synthesis, /9\.5 DEL CIERRE \(último plano, PL4, 00:06–00:08[^\n]*\n\[00:06–00:07\] VIS: E1 en 6s/)
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
        const label = /ESTE TRAMO: (\S+) de/.exec(req.instruction)![1]!
        out.textos_pantalla[0].id = `TX1-t${label}`
        out.entidades_nuevas = [{ id: `TX1-t${label}`, primera_aparicion_segundo: a, descripcion_fisica: 'rótulo blanco', identificacion: 'rótulo con texto' }]
        out.voces = [{ id: 'VOZ1', descripcion_acustica: `tono oído en ${label}` }]
        out.limites = [`límite del tramo ${label}`]
      }
      return JSON.stringify(out)
    },
  }
  const logs: string[] = []
  const progress: Array<{ label: string; current?: number; total?: number }> = []
  let saved: unknown
  const result = await perceive(video, mkdtempSync(path.join(tmpdir(), 'v6-split-w-')), {
    protocol: 'v6', providers: [grouping], whisperModel: 'tiny', language: 'en', diarize: false, log: (m) => logs.push(m),
    onCheckpoint: (c) => { saved = JSON.parse(JSON.stringify(c)) },
    onProgress: (p) => progress.push(p),
  })
  const md = result.protocolRecord!.markdown
  // The halves keep their own label: "[tramo 2]" used to name half 1b.
  assert.match(md, /\[tramo 1a\] límite del tramo 1a/)
  assert.match(md, /\[tramo 1b\] límite del tramo 1b/)
  assert.doesNotMatch(md, /\[tramo 2\]/)
  assert.match(md, /tono oído en 1a \/ \[tramo 1b\] tono oído en 1b/)
  assert.match(md, /^MAPA DE BLOQUES: tramo 1a: 00:00–00:15 \/ tramo 1b: 00:15–00:30/m)
  assert.ok(progress.every((p) => !/(\d+) de (\d+) tramos/.test(p.label) || Number(/(\d+) de/.exec(p.label)![1]) <= Number(/de (\d+) tramos/.exec(p.label)![1])), 'never "2 de 1 tramos"')
  assert.ok(progress.every((p) => (p.current ?? 0) <= (p.total ?? 0)), progress.map((p) => `${p.current}/${p.total}`).join(' '))
  // Entities found by the windows: renumbered TX ids and the four 9.3 lines.
  assert.match(md, /\*\*TX1\*\* — primera aparición 00:00\nDESCRIPCIÓN FÍSICA: rótulo blanco\nIDENTIFICACIÓN: \[ID\] rótulo con texto\nAPARICIONES: desde 00:00 \(tramo 1a\)/)
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
  // The first window fails only once the second one's request is out, so
  // that one is really in flight (a window not sent yet is not sent at all).
  let inFlight!: () => void
  const secondSent = new Promise<void>((r) => (inFlight = r))
  const breaking: VisionProvider = {
    name: 'breaking',
    available: () => true,
    async describe(req) {
      if (req.schema === V6_PERCEPTION_WINDOW_SCHEMA) {
        if (/del segundo 0\.00 /.test(req.instruction)) {
          calls.push(req)
          await secondSent
          throw new Error('breaking HTTP 400: imagen no válida')
        }
        inFlight()
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

test('once a window fails for good, a window that is only waiting out a busy model stops retrying', { timeout: 300_000 }, async () => {
  const video = path.join(mkdtempSync(path.join(tmpdir(), 'v6-abort-')), 'long.mp4')
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=60:r=5', '-f', 'lavfi', '-i', 'sine=f=440:d=60', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video])
  const good = fakeGemini([])
  let busyCalls = 0
  const provider: VisionProvider = {
    name: 'busy',
    available: () => true,
    async describe(req) {
      if (req.schema === V6_PERCEPTION_WINDOW_SCHEMA) {
        if (/del segundo 0\.00 /.test(req.instruction)) {
          await new Promise((r) => setTimeout(r, 500))
          throw new Error('busy HTTP 400: imagen no válida')
        }
        busyCalls++
        throw new ProviderOverloadedError('busy', 503, 'saturado', 3000)
      }
      return good.describe(req)
    },
  }
  const saved = { windows: process.env.VISION_CONCURRENCY, size: process.env.V6_WINDOW_SECONDS }
  process.env.VISION_CONCURRENCY = '2'
  process.env.V6_WINDOW_SECONDS = '30'
  const started = Date.now()
  try {
    await assert.rejects(
      perceive(video, mkdtempSync(path.join(tmpdir(), 'v6-abort-w-')), { protocol: 'v6', providers: [provider], whisperModel: 'tiny', language: 'en', diarize: false }),
      /imagen no válida/,
    )
  } finally {
    process.env.VISION_CONCURRENCY = saved.windows
    process.env.V6_WINDOW_SECONDS = saved.size
  }
  const window2 = busyCalls
  await new Promise((r) => setTimeout(r, 4000)) // a retry still running would show up here
  assert.equal(busyCalls, window2, 'no request after the job failed')
  assert.ok(window2 <= 1, `the busy window asked ${window2} times`)
  assert.ok(Date.now() - started < 60_000)
})

test('windows carry only the frames that fit the per-minute token limit', () => {
  const frames = Array.from({ length: 300 }, (_, i) => ({ path: `${i}.jpg`, time: i / 3 }))
  const saved = process.env.GEMINI_MEDIA_RESOLUTION
  process.env.GEMINI_MEDIA_RESOLUTION = ''
  try {
    const sizes = v6Windows(frames, 100).map((w) => w.frames.length)
    assert.ok(Math.max(...sizes) < 300, `Google's default resolution: ${sizes}`)
    assert.equal(sizes.reduce((a, b) => a + b, 0), 300)
  } finally {
    if (saved === undefined) delete process.env.GEMINI_MEDIA_RESOLUTION
    else process.env.GEMINI_MEDIA_RESOLUTION = saved
  }
  assert.deepEqual(v6Windows(frames, 100).map((w) => w.frames.length), [300], 'LOW resolution: unchanged')
})

const entry = (a: number, b: number, extra: Record<string, unknown> = {}) => ({ start_seconds: a, end_seconds: b, sin_cambios: false, vis: `v${a}`, aud: 'a', txt: 't', cam: 'c', cortes: [] as string[], ...extra })

test('a window answered from 709.7 for a start of 709.68 continues the chain; so does an end 0.03 s short', () => {
  const tl = [entry(709.7, 710)]
  for (let t = 710; t < 809; t++) tl.push(entry(t, t + 1))
  tl.push(entry(809, 809.05))
  const out = coverTimeline({ timeline: tl } as never, { start: 709.68, end: 809.08 })
  assert.equal(out.timeline[0]!.start_seconds, 709.68)
  assert.equal(out.timeline.at(-1)!.end_seconds, 809.08)
  assert.deepEqual(out.filled, [])
})

test('finer entries inside a whole second are kept inside it, not dropped', () => {
  const out = coverTimeline({ timeline: [entry(0, 1, { vis: 'whole' }), entry(0, 0.5, { vis: 'first half: hand moves' }), entry(0.5, 1, { vis: 'second half: contact' }), entry(1, 2)] } as never, { start: 0, end: 2 })
  assert.equal(out.timeline.length, 2)
  assert.equal(out.timeline[0]!.vis, 'whole [00:00–00:00.50] first half: hand moves [00:00.50–00:01] second half: contact')
  // Entries past the end of the window are not pulled into it.
  const past = coverTimeline({ timeline: [entry(0, 1), entry(1, 2), entry(5, 6, { vis: 'after' })] } as never, { start: 0, end: 2 })
  assert.doesNotMatch(past.timeline.map((e) => e.vis).join(' '), /after/)
})

test('a timeline whose CORTE lines sit seconds away from their entries is asked again; a last resort keeps it, declared', () => {
  const tl = Array.from({ length: 30 }, (_, i) => entry(i, i + 1))
  tl[10]!.cortes = ['CORTE en 00:13.50 → PL3']
  tl[14]!.cortes = ['CORTE en 00:18.20 → PL4']
  tl[20]!.cortes = ['CORTE en 00:24.90 → PL5']
  assert.throws(() => coverTimeline({ timeline: tl } as never, { start: 0, end: 30 }), /desplazada: 3 cortes citados a más de 1 s de su entrada \(hasta 3\.9 s\)/)
  const kept = coverTimeline({ timeline: tl } as never, { start: 0, end: 30 }, { lenient: true })
  assert.ok(kept.filled.some((l) => /^\[00:10–00:21\] 3 cortes citados a más de 1 s de su entrada \(hasta 3\.9 s\): los tiempos de este intervalo pueden estar desplazados \[BAJA\]\.$/.test(l)), kept.filled.join(' | '))
  // One or two slips are not a drifting timeline.
  tl[20]!.cortes = ['CORTE en 00:20.40 → PL5']
  assert.deepEqual(coverTimeline({ timeline: tl } as never, { start: 0, end: 30 }).filled, [])
})

test('a one-second "no changes" entry with a measured cut inside no longer claims none; a new line of speech alone is not a change', () => {
  const still = (a: number) => entry(a, a + 1, { sin_cambios: true, vis: 'SIN CAMBIOS OBSERVABLES. Persisten: P10.' })
  const out = coverTimeline({ timeline: [still(0), still(1), still(2)] } as never, { start: 0, end: 3 }, {
    marks: [{ time: 0.52, what: 'un corte medido', cut: true }, { time: 1.4, what: 'el inicio de T3' }],
  })
  assert.equal(out.timeline[0]!.sin_cambios, false)
  assert.equal(out.timeline[0]!.vis, '[BAJA] El tramo la dio como «SIN CAMBIOS OBSERVABLES. Persisten: P10.», pero en ella hay un corte medido en 00:00.52: lo que cambia no quedó descrito [ND].')
  assert.equal(out.timeline[1]!.sin_cambios, true, 'speech that goes on in a still second is not hidden')
  assert.deepEqual(out.filled, ['[00:00–00:01] marcada sin cambios pero contiene un corte medido en 00:00.52 [BAJA].'])
})

test('a follow-up reply fills the hole it was asked for; its texts keep their own ids', () => {
  const tx = (id: string, contenido: string) => ({ id, aparece: '', desaparece: '', duracion: '', tipo: '', posicion: '', contenido, apariencia: '', animacion: '' })
  const hole = { start_seconds: 25, end_seconds: 30, sin_cambios: false, vis: '[ND] — registro no producido para este intervalo.', aud: '[ND]', txt: '[ND]', cam: '[ND]', cortes: [] }
  const main = {
    timeline: [entry(0, 25, { txt: 'TX1 visible' }), hole],
    textos_pantalla: [tx('TX1', 'HOLA')],
    limites: ['[00:25–00:30] la línea de tiempo de este intervalo no se produjo; ver los fotogramas y el audio del tramo [ND].'],
  } as never
  const extra = {
    timeline: [entry(25, 26, { txt: 'TX1 visible; TX2 aparece' }), entry(26, 30, { sin_cambios: true, vis: 'SIN CAMBIOS OBSERVABLES' })],
    textos_pantalla: [tx('TX1', 'hola'), tx('TX2', 'ADIÓS')],
    limites: ['[00:27] TX2 [BAJA]'],
  } as never
  const merged = mergeFill(main, extra, '1r')
  assert.deepEqual(merged.timeline.map((e) => [e.start_seconds, e.end_seconds]), [[0, 25], [25, 26], [26, 30]])
  assert.equal(merged.timeline[1]!.txt, 'TX1 visible; TX1-t1r aparece', 'the same text keeps the window id; a new one gets the follow-up suffix')
  assert.deepEqual(merged.textos_pantalla.map((t) => t.id), ['TX1', 'TX1-t1r'])
  assert.deepEqual(merged.limites, ['[00:25–00:30] registrado en una segunda petición (tramo 1r), solo para este intervalo, porque la primera respuesta lo dejó sin registrar.', '[00:27] TX1-t1r [BAJA]'])
})

/** A 30-s clip: one window. */
function makeLongVideo(name: string): string {
  const video = path.join(mkdtempSync(path.join(tmpdir(), `v6-${name}-`)), 'long.mp4')
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=30:r=10', '-f', 'lavfi', '-i', 'sine=f=440:d=30', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video])
  return video
}

/** Like fakeGemini, but the first answer for the window stops at second 25. */
function stopsEarly(calls: VisionRequest[], followUp?: () => never): VisionProvider {
  const good = fakeGemini(calls)
  return {
    name: 'stops-early',
    available: () => true,
    async describe(req) {
      if (req.schema === V6_PERCEPTION_WINDOW_SCHEMA && /COMPLETA UN HUECO/.test(req.instruction) && followUp) {
        calls.push(req)
        followUp()
      }
      const out = JSON.parse(await good.describe(req))
      if (req.schema === V6_PERCEPTION_WINDOW_SCHEMA && !/COMPLETA UN HUECO/.test(req.instruction)) out.timeline = out.timeline.filter((e: { start_seconds: number }) => e.start_seconds < 25)
      return JSON.stringify(out)
    },
  }
}

test('seconds a reply left out are asked once more on their own before they go to the record as [ND]', { timeout: 300_000 }, async () => {
  const calls: VisionRequest[] = []
  const result = await perceive(makeLongVideo('fill'), mkdtempSync(path.join(tmpdir(), 'v6-fill-w-')), {
    protocol: 'v6', providers: [stopsEarly(calls)], whisperModel: 'tiny', language: 'en', diarize: false,
  })
  const windows = calls.filter((c) => c.schema === V6_PERCEPTION_WINDOW_SCHEMA)
  assert.equal(windows.length, 2, 'the window, then its hole')
  assert.match(windows[1]!.instruction, /ESTE TRAMO: 1r de 1, del segundo 25\.00 \(00:25\) al 30\.\d\d/)
  assert.ok(windows[1]!.frames.every((f) => f.time >= 25), 'only the frames of the hole')
  assert.ok((windows[1]!.audio?.seconds ?? 0) < 6, 'only the sound of the hole')
  const md = result.protocolRecord!.markdown
  assert.doesNotMatch(md, /registro no producido/)
  assert.match(md, /\[00:27–00:28\]\nVIS: E1 en 27s/)
  assert.match(md, /registrado en una segunda petición \(tramo 1r\)/)
  assert.doesNotMatch(md, /\*\*TX2\*\*/, 'the same text seen again is one text')
})

const dailyQuota = () => {
  throw Object.assign(new Error('Ningún proveedor de visión pudo responder: todos los modelos agotaron su cuota'), { name: 'DailyQuotaExhaustedError', retryAt: Date.now() + 3_600_000 })
}

test('with the daily quota spent, a window is not split in halves: the run stops with that error', { timeout: 300_000 }, async () => {
  const calls: VisionRequest[] = []
  const good = fakeGemini(calls)
  const spent: VisionProvider = {
    name: 'spent',
    available: () => true,
    async describe(req) {
      if (req.schema === V6_PERCEPTION_WINDOW_SCHEMA) {
        calls.push(req)
        dailyQuota()
      }
      return good.describe(req)
    },
  }
  let saved: { v6?: { split?: string[] } } | undefined
  await assert.rejects(
    perceive(makeLongVideo('quota'), mkdtempSync(path.join(tmpdir(), 'v6-quota-w-')), {
      protocol: 'v6', providers: [spent], whisperModel: 'tiny', language: 'en', diarize: false,
      onCheckpoint: (c) => { saved = JSON.parse(JSON.stringify(c)) },
    }),
    (err: Error) => err.name === 'DailyQuotaExhaustedError',
  )
  assert.equal(calls.filter((c) => c.schema === V6_PERCEPTION_WINDOW_SCHEMA).length, 1, 'no halves asked')
  assert.equal(saved?.v6?.split, undefined, 'no split remembered for the retry')
})

test('with the daily quota spent during the follow-up, the window is kept with its hole and the run stops', { timeout: 300_000 }, async () => {
  const calls: VisionRequest[] = []
  let saved: { v6?: { windows: Record<string, { timeline: Array<{ vis: string }> }> } } | undefined
  await assert.rejects(
    perceive(makeLongVideo('quota-fill'), mkdtempSync(path.join(tmpdir(), 'v6-quota-fill-w-')), {
      protocol: 'v6', providers: [stopsEarly(calls, dailyQuota)], whisperModel: 'tiny', language: 'en', diarize: false,
      onCheckpoint: (c) => { saved = JSON.parse(JSON.stringify(c)) },
    }),
    (err: Error) => err.name === 'DailyQuotaExhaustedError',
  )
  const kept = Object.values(saved!.v6!.windows)
  assert.equal(kept.length, 1, 'the answered window is saved for the retry')
  assert.match(kept[0]!.timeline.at(-1)!.vis, /registro no producido/)
})

test('phase 1 cannot see the access, the duration band or the frame shape: the app sets them', () => {
  const p1 = {
    ficha: { relacion_aspecto: '16:9' }, ficha_tecnica: {}, triaje: { eje0_fuente: 'VIDEO, alcance: video completo.', eje1_naturaleza: 'real', eje6_duracion: '>10 min' },
    procedencia: [], entidades: [], planos: [], textos_pantalla: [],
  } as never
  const shots = [{ id: 'PL1', start: 0, end: 120 }]
  const vertical = fixPhase1(p1, shots, { title: 'x', durationSeconds: 120, width: 1080, height: 1920 }, [], true)
  assert.equal(vertical.ficha.relacion_aspecto, 'vertical')
  assert.equal(vertical.triaje.eje6_duracion, '1–10 min (02:00) [META]')
  assert.match(vertical.triaje.eje0_fuente!, /^video; acceso muestreado: imagen muestreada .* y sonido directo continuo; alcance: video completo \[META\]$/)
  assert.equal(vertical.triaje.eje1_naturaleza, 'real', 'the model keeps what it can see')
  const mute = fixPhase1(p1, shots, { title: 'x', durationSeconds: 8 }, [], false)
  assert.equal(mute.ficha.relacion_aspecto, '16:9', 'without a measured size the model\'s value stays')
  assert.match(mute.triaje.eje0_fuente!, /; sin pista de audio;/)
  assert.equal(mute.triaje.eje6_duracion, '<10 s (00:08) [META]')
})

test('screen time per entity comes from the seconds of 9.5 that name it', () => {
  const lines = entitySeconds([entry(0, 1, { vis: 'P1 y O2 sobre E1' }), entry(1, 2, { vis: 'P1* gira' }), entry(2, 4, { vis: 'O2; PL3 empieza' })], 4)
  assert.equal(lines, 'O2: 3.0 s (75.0 %)\nP1: 2.0 s (50.0 %), de ellos 1.0 s solo como P1*\nE1: 1.0 s (25.0 %)')
})

test('a short tail of frames joins the last window instead of costing a request of its own', () => {
  const frames = (n: number, seconds: number) => Array.from({ length: n }, (_, i) => ({ path: `${i}.jpg`, time: (i * seconds) / n }))
  assert.deepEqual(v6Windows(frames(312, 60), 60).map((w) => w.frames.length), [312], 'a 60-s clip of 312 frames: one window, not 300 + 12')
  assert.deepEqual(v6Windows(frames(346, 60), 60).map((w) => w.frames.length), [300, 46], 'past 15 % it is a window of its own')
  assert.deepEqual(v6Windows(frames(130, 130), 130).map((w) => [w.start, w.end]), [[0, 130]], '10 s past the 120-s limit')
  assert.equal(v6Windows(frames(150, 150), 150).length, 2)
})

test('a phone video stored on its side is measured as it is seen', { timeout: 60_000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'v6-rot-'))
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:d=1:r=10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'plain.mp4')])
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-display_rotation', '90', '-i', path.join(dir, 'plain.mp4'), '-c', 'copy', path.join(dir, 'rot.mp4')])
  assert.deepEqual(await probeVideo(path.join(dir, 'plain.mp4')), { width: 320, height: 180, fps: 10 })
  assert.deepEqual(await probeVideo(path.join(dir, 'rot.mp4')), { width: 180, height: 320, fps: 10 })
})

test('entities a window found get plain ids that continue the known ones, window by window', () => {
  const rename = renumberEntities([{ id: 'P1' }, { id: 'O4' }], [
    { entidades_nuevas: [{ id: 'O1-t1', primera_aparicion_segundo: 3, descripcion_fisica: 'taza', identificacion: 'NO DETERMINABLE' }] },
    { entidades_nuevas: [] },
    { entidades_nuevas: [{ id: 'O1-t3', primera_aparicion_segundo: 40, descripcion_fisica: 'portátil', identificacion: 'NO DETERMINABLE' }, { id: 'P1-t3', primera_aparicion_segundo: 41, descripcion_fisica: 'mano', identificacion: 'NO DETERMINABLE' }] },
  ])
  assert.equal(rename(0, 'P1 deja O1-t1 junto a O4'), 'P1 deja O5 junto a O4')
  assert.equal(rename(2, 'P1-t3 abre O1-t3; TX1-t3 sigue'), 'P2 abre O6; TX1-t3 sigue')
  assert.equal(rename(1, 'O1-t3'), 'O1-t3', 'another window\'s id is not this one\'s')
})
