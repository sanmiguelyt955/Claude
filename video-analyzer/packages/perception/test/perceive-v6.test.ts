import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { V6_PHASE1_SCHEMA } from '@cva/ai-router'
import { perceive } from '../src/perceive.ts'
import { coverTimeline, renumberTexts, shotsFrom, v6Windows, withVoices, V6_PERCEPTION_WINDOW_SCHEMA } from '../src/v6/record.ts'
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
      if (req.schema === V6_PHASE1_SCHEMA) {
        return JSON.stringify({
          ficha: { duracion: 'x', duracion_origen: 'x', relacion_aspecto: 'horizontal', planos: 1, naturaleza: 'animación', audio: 'habla', sujetos: 'ninguno', idioma_habla: 'inglés', tags: ['color'] },
          ficha_tecnica: { duracion_archivo: 'x', ultimo_contenido_observable: 'x', numero_planos: 1, duracion_media_plano: 'x', plano_mas_largo: 'x', plano_mas_corto: 'x' },
          triaje: { eje0_fuente: 'video' },
          procedencia: ['sin marcas de agua'],
          entidades: [{ id: 'E1', primera_aparicion: '00:00', descripcion_fisica: 'campo de color uniforme', identificacion: 'NO DETERMINABLE', apariciones: '00:00–00:08' }],
          planos: [{ id: 'PL2', inicio: 'x', fin: 'x', duracion: 'x', escala: 'general', angulo: 'frontal', altura: 'ND', movimiento: 'fija', composicion: 'E1 llena el cuadro', fondo_superficie: 'E1', iluminacion: 'uniforme', entrada_salida: 'corte' }],
          textos_pantalla: [],
        })
      }
      if (req.schema === V6_PERCEPTION_WINDOW_SCHEMA) {
        const [a, b] = /del segundo ([\d.]+) .* al ([\d.]+)/.exec(req.instruction)!.slice(1).map(Number) as [number, number]
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

  const windows = calls.filter((c) => c.schema === V6_PERCEPTION_WINDOW_SCHEMA)
  assert.ok(windows.length >= 1)
  assert.ok(windows.every((w) => w.audio && w.audio.mimeType === 'audio/ogg'), 'every window hears its sound')
  assert.ok(windows.every((w) => /CORTES MEDIDOS EN ESTE TRAMO \[META\]: 00:02/.test(w.instruction)))
  assert.equal(calls.length, windows.length + 2, 'phase 1 + one request per window + synthesis')
  assert.ok(calls.every((c) => c.instruction.length < 60_000), 'the distilled protocol, not the 30k-token full text, goes with each call')

  assert.equal(result.summary.short_summary, 'Cuatro campos de color con voz.')
  assert.equal(result.scenes[0]!.title, 'Colores')
  assert.ok(result.elements.some((e) => e.kind === 'on_screen_text' && e.label === 'HOLA'))
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
