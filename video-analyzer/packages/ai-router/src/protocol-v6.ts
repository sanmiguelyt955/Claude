import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { AnalysisResult } from './schema.js'

/**
 * V6.0 — Protocolo Maestro de Extracción Audiovisual, run in three phases so
 * it fits Gemini's per-call limits without breaking the protocol's own rules:
 *
 * 1. FULL VIDEO, one call — 9.0 ficha, 9.1 triaje, 9.2 procedencia, 9.3
 *    entidades, 9.4 planos, 9.7 texto en pantalla. Runs first so every
 *    window below references the SAME entity and shot IDs.
 * 2. WINDOWS, in parallel — 9.5 línea de tiempo canónica (VIS/AUD/TXT/CAM per
 *    second) and 9.6 transcripción literal for that slice.
 * 3. TEXT ONLY, one call — 9.8 to 9.14, synthesized from phases 1+2 without
 *    the video: the protocol itself says those sections reorganize, they do
 *    not observe (9.13 "no añadas nada que no esté en las secciones anteriores").
 *
 * The window output is converted into the app's existing AnalysisResult shape
 * (scenes/transcript/elements) so windowing, checkpoints, quota logging,
 * search and the UI keep working unchanged; the full protocol document is
 * rendered separately by renderV6Record().
 */

export const PROTOCOL_VERSION = 'v6.0'

let protocolText: string | undefined

/** The protocol, verbatim, from protocol-v6.md (loaded lazily, worker only). */
export function getProtocolText(): string {
  protocolText ??= readFileSync(fileURLToPath(new URL('./protocol-v6.md', import.meta.url)), 'utf8')
  return protocolText
}

// ─── Phase 1: full-video record ──────────────────────────────────────────

const STR = { type: 'string' } as const
const STR_ARR = { type: 'array', items: STR } as const

function obj(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties) } as const
}

export const V6_PHASE1_SCHEMA = obj({
  ficha: obj({
    duracion: STR,
    duracion_origen: STR,
    relacion_aspecto: STR,
    planos: { type: 'integer' },
    naturaleza: STR,
    audio: STR,
    sujetos: STR,
    idioma_habla: STR,
    tags: STR_ARR,
  }),
  ficha_tecnica: obj({
    duracion_archivo: STR,
    ultimo_contenido_observable: STR,
    numero_planos: { type: 'integer' },
    duracion_media_plano: STR,
    plano_mas_largo: STR,
    plano_mas_corto: STR,
  }),
  triaje: obj({
    eje1_naturaleza: STR,
    eje2_origen: STR,
    eje3_capas: STR,
    eje4_audio: STR,
    eje5_sujetos: STR,
    eje6_duracion: STR,
    eje7_densidad: STR,
  }),
  procedencia: STR_ARR,
  entidades: {
    type: 'array',
    items: obj({ id: STR, primera_aparicion: STR, descripcion_fisica: STR, identificacion: STR, apariciones: STR }),
  },
  planos: {
    type: 'array',
    items: obj({
      id: STR,
      inicio: STR,
      fin: STR,
      duracion: STR,
      escala: STR,
      angulo: STR,
      altura: STR,
      movimiento: STR,
      composicion: STR,
      iluminacion: STR,
      entrada_salida: STR,
    }),
  },
  textos_pantalla: {
    type: 'array',
    items: obj({
      id: STR,
      aparece: STR,
      desaparece: STR,
      duracion: STR,
      tipo: STR,
      posicion: STR,
      contenido: STR,
      apariencia: STR,
      animacion: STR,
    }),
  },
})

export type V6Phase1 = {
  ficha: {
    duracion: string
    duracion_origen: string
    relacion_aspecto: string
    planos: number
    naturaleza: string
    audio: string
    sujetos: string
    idioma_habla: string
    tags: string[]
  }
  ficha_tecnica: {
    duracion_archivo: string
    ultimo_contenido_observable: string
    numero_planos: number
    duracion_media_plano: string
    plano_mas_largo: string
    plano_mas_corto: string
  }
  triaje: Record<string, string>
  procedencia: string[]
  entidades: Array<{ id: string; primera_aparicion: string; descripcion_fisica: string; identificacion: string; apariciones: string }>
  planos: Array<Record<'id' | 'inicio' | 'fin' | 'duracion' | 'escala' | 'angulo' | 'altura' | 'movimiento' | 'composicion' | 'iluminacion' | 'entrada_salida', string>>
  textos_pantalla: Array<Record<'id' | 'aparece' | 'desaparece' | 'duracion' | 'tipo' | 'posicion' | 'contenido' | 'apariencia' | 'animacion', string>>
}

export type VideoMeta = {
  title: string
  durationSeconds: number
  width?: number | null
  height?: number | null
  fps?: number | null
}

function metaBlock(meta: VideoMeta): string {
  const lines = [`- Nombre del archivo: ${meta.title}`, `- Duración exacta del archivo: ${meta.durationSeconds} s (${mmss(meta.durationSeconds)})`]
  if (meta.width && meta.height) lines.push(`- Resolución: ${meta.width}x${meta.height}`)
  if (meta.fps) lines.push(`- Fotogramas por segundo: ${meta.fps}`)
  return `METADATA DEL ARCHIVO [META] (prevalece sobre tu propia lectura en estos campos):\n${lines.join('\n')}`
}

export function buildV6Phase1Prompt(meta: VideoMeta): string {
  return `${getProtocolText()}

==================================================
INSTRUCCIONES DE ESTA LLAMADA — FASE 1 DE 3
==================================================

${metaBlock(meta)}

El registro se produce en tres fases porque no cabe en una sola respuesta (sección 8: se divide, nunca se resume). En ESTA llamada ves el video COMPLETO y entregas SOLO estas secciones, en el JSON del esquema dado:

- ficha → 9.0 (sin el campo "fuente": lo pone la app). "planos" = número de planos.
- ficha_tecnica + triaje → 9.1 (los siete ejes de la sección 7).
- procedencia → 9.2, una observación por elemento de la lista.
- entidades → 9.3. Asigna aquí los IDs DEFINITIVOS (P#, A#, O#, I#, E#, C#, F#) de TODO el video: la fase 2 los usará tal cual. "apariciones" con la notación de asterisco tras cada corte.
- planos → 9.4, un elemento por plano, IDs PL1, PL2... en orden. Si no hay cortes, un solo plano.
- textos_pantalla → 9.7. Array vacío si no aparece texto en pantalla.

Los timestamps dentro de los textos van en formato mm:ss o mm:ss.s, tiempo absoluto del video.
NO entregues todavía la línea de tiempo (9.5), la transcripción (9.6) ni las secciones 9.8 a 9.14: llegan en las fases 2 y 3.
Aplica las tres pruebas, las etiquetas y los límites de la sección 4 a cada campo.
Responde SOLO con el objeto JSON.`
}

// ─── Phase 2: one window of the canonical timeline ────────────────────────

export const V6_WINDOW_SCHEMA = obj({
  timeline: {
    type: 'array',
    items: obj({
      start_seconds: { type: 'number' },
      end_seconds: { type: 'number' },
      sin_cambios: { type: 'boolean' },
      vis: STR,
      aud: STR,
      txt: STR,
      cam: STR,
      cortes: STR_ARR,
    }),
  },
  transcript: {
    type: 'array',
    items: obj({ start_seconds: { type: 'number' }, end_seconds: { type: 'number' }, voz: STR, texto: STR }),
  },
  entidades_nuevas: {
    type: 'array',
    items: obj({ id: STR, primera_aparicion_segundo: { type: 'number' }, descripcion_fisica: STR, identificacion: STR }),
  },
  limites: STR_ARR,
})

type V6Window = {
  timeline: Array<{
    start_seconds: number
    end_seconds: number
    sin_cambios: boolean
    vis: string
    aud: string
    txt: string
    cam: string
    cortes: string[]
  }>
  transcript: Array<{ start_seconds: number; end_seconds: number; voz: string; texto: string }>
  entidades_nuevas: Array<{ id: string; primera_aparicion_segundo: number; descripcion_fisica: string; identificacion: string }>
  limites: string[]
}

/** Compact phase-1 reference handed to every window, so IDs stay consistent. */
function phase1Reference(p1: V6Phase1): string {
  const ent = p1.entidades.map((e) => `${e.id} — ${e.descripcion_fisica} (apariciones: ${e.apariciones})`).join('\n')
  const pl = p1.planos.map((p) => `${p.id} — ${p.inicio}–${p.fin}: ${p.escala}, ${p.angulo}, ${p.movimiento}`).join('\n')
  const tx = p1.textos_pantalla.length
    ? p1.textos_pantalla.map((t) => `${t.id} — ${t.aparece}–${t.desaparece}: "${t.contenido}"`).join('\n')
    : 'No aparece texto en pantalla.'
  return `REGISTRO DE ENTIDADES (9.3, ya establecido para todo el video):\n${ent || '(ninguna)'}\n\nMAPA DE PLANOS (9.4):\n${pl}\n\nTEXTO EN PANTALLA (9.7):\n${tx}`
}

export function buildV6WindowPrompt(input: {
  meta: VideoMeta
  phase1: V6Phase1
  windowIndex: number
  windowCount: number
  windowStartSeconds: number
  windowEndSeconds: number
}): string {
  const { meta, phase1, windowIndex, windowCount, windowStartSeconds: a, windowEndSeconds: b } = input
  const first = Math.floor(a)
  const lastStart = Math.ceil(b) - 1
  return `${getProtocolText()}

==================================================
INSTRUCCIONES DE ESTA LLAMADA — FASE 2 DE 3 (fragmento ${windowIndex + 1} de ${windowCount})
==================================================

${metaBlock(meta)}

Ves SOLO el fragmento del video entre ${mmss(a)} y ${mmss(b)} (segundos ${a} a ${b} del archivo). No describas ni supongas nada de fuera de ese intervalo.

${phase1Reference(phase1)}

Usa EXACTAMENTE esos IDs. No vuelvas a describir físicamente una entidad ya registrada: menciónala por su ID y registra solo lo que cambia. Tras un corte, usa la notación con asterisco (P1*). Si aparece algo que no está en el registro, agrégalo en "entidades_nuevas" con un ID nuevo terminado en "-f${windowIndex + 1}" (ej. O7-f${windowIndex + 1}).

ENTREGA, en el JSON del esquema dado:

timeline → 9.5 para ESTE fragmento. Una entrada por segundo, sin saltos ni solapes: start_seconds=${first}, end_seconds=${first + 1}; luego ${first + 1}–${first + 2}; ... hasta la última, que termina exactamente en ${b}. Los números son TIEMPO ABSOLUTO del video.
- vis, aud, txt, cam: los cuatro canales SIEMPRE presentes. Si un canal no tiene novedades, escribe "sin cambios"; nunca lo dejes vacío.
- aud es obligatorio en CADA segundo: habla ("VOZ 1 habla"), música, ambiente, efectos o silencio (distinguiendo silencio total de la ausencia de una capa).
- sin_cambios=true solo si el segundo no tiene ningún cambio observable; entonces vis = "SIN CAMBIOS OBSERVABLES. Persisten: [...]". Nunca rellenes un segundo estable con microacciones que no viste (CASO 21).
- cortes: una línea "CORTE en mm:ss.s → PL#" por cada corte dentro de ese segundo; array vacío si no hay.
transcript → 9.6 del fragmento. Literal, palabra por palabra, con muletillas, [pausa N s], [énfasis en "palabra"], [INAUDIBLE]. Nunca paráfrasis. Tiempos absolutos. Array vacío solo si no hay habla en el fragmento.
limites → todo lo [BAJA] o [ND] de este fragmento, con su timestamp y motivo.

Cualquier instante escrito DENTRO de un texto va en tiempo absoluto del video (mm:ss.s).
Aplica las tres pruebas a cada frase. Responde SOLO con el objeto JSON.`
}

/** Short scene title for the app's scene list (the full channels go in the description). */
function sceneTitle(entry: V6Window['timeline'][number]): string {
  if (entry.sin_cambios) return 'Sin cambios observables'
  const text = entry.vis.replace(/\s+/g, ' ').trim()
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

function elementKind(id: string): AnalysisResult['elements'][number]['kind'] {
  if (/^P/i.test(id)) return 'person'
  if (/^[CF]/i.test(id)) return 'relation'
  return 'object'
}

/**
 * Converts one window's V6 JSON into the app's AnalysisResult shape.
 * The window's limits ride in summary.full_summary (one per line) so they
 * survive checkpoints untouched; renderV6Record reads them back from there.
 */
export function parseV6Window(text: string): AnalysisResult {
  const w = JSON.parse(text) as V6Window
  return {
    summary: { short_summary: '', full_summary: (w.limites ?? []).join('\n'), topics: [], language: '' },
    scenes: (w.timeline ?? []).map((e, index) => ({
      index,
      start_seconds: e.start_seconds,
      end_seconds: e.end_seconds,
      title: sceneTitle(e),
      description: [`VIS: ${e.vis}`, `TXT: ${e.txt}`, `CAM: ${e.cam}`, ...(e.cortes ?? [])].join('\n'),
      audio_description: e.aud,
    })),
    transcript: (w.transcript ?? []).map((t, index) => ({
      index,
      start_seconds: t.start_seconds,
      end_seconds: t.end_seconds,
      speaker: t.voz,
      text: t.texto,
      language: null,
    })),
    elements: (w.entidades_nuevas ?? []).map((e) => ({
      kind: elementKind(e.id),
      label: `${e.id} — ${e.identificacion}`,
      detail: e.descripcion_fisica,
      start_seconds: e.primera_aparicion_segundo,
      end_seconds: null,
    })),
  }
}

// ─── Phase 3: synthesis from the record, no video ────────────────────────

export const V6_PHASE3_SCHEMA = obj({
  resumen_corto: STR,
  temas: STR_ARR,
  cambios_estado: { type: 'array', items: obj({ timestamp: STR, antes: STR, transicion: STR, despues: STR, no_determinable: STR }) },
  gramatica: obj({
    ritmo_montaje: STR,
    estructura_temporal: STR,
    sincronia: STR,
    coreografia_texto: STR,
    continuidad: STR,
    diseno_sonoro: STR,
  }),
  funcion: { type: 'array', items: obj({ elemento: STR, evidencia: STR, posible_funcion: STR, no_determinable: STR }) },
  interpretacion: STR_ARR,
  patrones: { type: 'array', items: obj({ patron: STR, evidencia: STR, mecanismo: STR, condiciones: STR, transferibilidad: STR }) },
  recreacion: {
    type: 'array',
    items: obj({
      plano: STR,
      duracion: STR,
      sujetos_estado_inicial: STR,
      accion: STR,
      camara: STR,
      luz_entorno: STR,
      audio: STR,
      texto: STR,
      estado_final: STR,
    }),
  },
  limites: STR_ARR,
})

export type V6Phase3 = {
  resumen_corto: string
  temas: string[]
  cambios_estado: Array<Record<'timestamp' | 'antes' | 'transicion' | 'despues' | 'no_determinable', string>>
  gramatica: Record<'ritmo_montaje' | 'estructura_temporal' | 'sincronia' | 'coreografia_texto' | 'continuidad' | 'diseno_sonoro', string>
  funcion: Array<Record<'elemento' | 'evidencia' | 'posible_funcion' | 'no_determinable', string>>
  interpretacion: string[]
  patrones: Array<Record<'patron' | 'evidencia' | 'mecanismo' | 'condiciones' | 'transferibilidad', string>>
  recreacion: Array<Record<'plano' | 'duracion' | 'sujetos_estado_inicial' | 'accion' | 'camara' | 'luz_entorno' | 'audio' | 'texto' | 'estado_final', string>>
  limites: string[]
}

export function buildV6Phase3Prompt(meta: VideoMeta, phase1: V6Phase1, merged: AnalysisResult, windowLimits: string[]): string {
  return `${getProtocolText()}

==================================================
INSTRUCCIONES DE ESTA LLAMADA — FASE 3 DE 3 (SÍNTESIS)
==================================================

${metaBlock(meta)}

En esta llamada NO tienes el video. Tienes el registro ya producido en las fases 1 y 2: ficha, entidades, planos, textos en pantalla, línea de tiempo canónica completa y transcripción. Estas secciones REORGANIZAN y SINTETIZAN ese registro; no observan. Todo lo que escribas debe poder rastrearse a un timestamp o ID de abajo. Si algo no está en el registro, es [ND].

ENTREGA, en el JSON del esquema dado:
- cambios_estado → 9.8
- gramatica → 9.9
- funcion → 9.10 (opcional por elemento; para la mayoría la respuesta esperada es NO DETERMINABLE)
- interpretacion → 9.11, cada entrada marcada [INT] y con su timestamp o ID
- patrones → 9.12, mínimo 3, cada uno superando la prueba de cambio de sujeto
- recreacion → 9.13, una entrada por plano del mapa de planos
- limites → 9.14. Incluye los límites declarados por cada fragmento (abajo) y agrega los tuyos.
- resumen_corto: UNA frase de observación física para la ficha de la biblioteca de la app (sin interpretación).
- temas: 3 a 8 etiquetas cortas para buscar este video.

Responde SOLO con el objeto JSON.

==================================================
REGISTRO — FASE 1
==================================================
${JSON.stringify(phase1, null, 1)}

==================================================
REGISTRO — LÍNEA DE TIEMPO CANÓNICA (9.5)
==================================================
${renderTimeline(merged)}

==================================================
REGISTRO — TRANSCRIPCIÓN (9.6)
==================================================
${renderTranscript(merged)}

==================================================
LÍMITES DECLARADOS POR LOS FRAGMENTOS
==================================================
${windowLimits.length ? windowLimits.map((l) => `- ${l}`).join('\n') : '(ninguno)'}`
}

// ─── Rendering the final document (section 9 order) ───────────────────────

export function mmss(seconds: number): string {
  const whole = Math.floor(seconds)
  const frac = seconds - whole
  const m = Math.floor(whole / 60)
  const s = whole % 60
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return frac > 0.004 ? `${base}${frac.toFixed(2).slice(1)}` : base
}

function renderTimeline(r: AnalysisResult): string {
  return r.scenes
    .map((s) => {
      const lines = s.description.split('\n')
      const vis = lines.find((l) => l.startsWith('VIS:')) ?? `VIS: ${s.description}`
      const rest = lines.filter((l) => !l.startsWith('VIS:'))
      const txt = rest.find((l) => l.startsWith('TXT:')) ?? 'TXT: sin cambios'
      const cam = rest.find((l) => l.startsWith('CAM:')) ?? 'CAM: sin cambios'
      const cuts = rest.filter((l) => l.startsWith('CORTE'))
      const head = `[${mmss(s.start_seconds)}–${mmss(s.end_seconds)}]`
      if (vis.includes('SIN CAMBIOS OBSERVABLES')) {
        return [`${head}`, vis.replace(/^VIS:\s*/, ''), `AUD: ${s.audio_description ?? 'sin cambios'}`, ...cuts].join('\n')
      }
      return [head, vis, `AUD: ${s.audio_description ?? 'sin cambios'}`, txt, cam, ...cuts].join('\n')
    })
    .join('\n\n')
}

function renderTranscript(r: AnalysisResult): string {
  if (!r.transcript.length) return 'No se detecta habla.'
  return r.transcript
    .map((t, i) => `T${i + 1} — ${mmss(t.start_seconds)}–${mmss(t.end_seconds)} — ${t.speaker ?? 'VOZ 1'}: "${t.text}"`)
    .join('\n')
}

const bullet = (items: string[], empty: string) => (items.length ? items.map((x) => `- ${x}`).join('\n') : empty)

/** YAML-safe scalar for the frontmatter. */
function yamlValue(v: string | number): string {
  const s = String(v)
  return /[:#\[\]{},&*?|<>=!%@`'"]/.test(s) || s.trim() !== s ? JSON.stringify(s) : s
}

/**
 * The complete V6.0 record as one Markdown document, sections in the exact
 * order of protocol section 9. Frontmatter (9.0) first so Obsidian reads it
 * as note properties.
 */
export function renderV6Record(input: {
  meta: VideoMeta
  phase1: V6Phase1
  merged: AnalysisResult
  phase3: V6Phase3
  windowLimits: string[]
}): string {
  const { meta, phase1: p1, merged, phase3: p3, windowLimits } = input
  const f = p1.ficha
  const ft = p1.ficha_tecnica
  const lastAnalyzed = merged.scenes.length ? mmss(merged.scenes[merged.scenes.length - 1]!.end_seconds) : 'ND'
  const out: string[] = []

  out.push(
    '---',
    'tipo: analisis-video',
    `protocolo: ${PROTOCOL_VERSION}`,
    `fuente: ${yamlValue(meta.title)}`,
    `duracion: ${yamlValue(f.duracion)}`,
    `duracion_origen: ${yamlValue(f.duracion_origen)}`,
    `relacion_aspecto: ${yamlValue(f.relacion_aspecto)}`,
    `planos: ${f.planos}`,
    `naturaleza: ${yamlValue(f.naturaleza)}`,
    `audio: ${yamlValue(f.audio)}`,
    `sujetos: ${yamlValue(f.sujetos)}`,
    `idioma_habla: ${yamlValue(f.idioma_habla)}`,
    `tags: [${['analisis-video', ...f.tags.filter((t) => t !== 'analisis-video')].map((t) => yamlValue(t.replace(/\s+/g, '-'))).join(', ')}]`,
    '---',
    '',
    `# ${meta.title}`,
    '',
    '## 9.1 Ficha técnica y triaje',
    '',
    `DURACIÓN DEL ARCHIVO: ${ft.duracion_archivo}`,
    `ÚLTIMO CONTENIDO OBSERVABLE: ${ft.ultimo_contenido_observable}`,
    `ÚLTIMO CONTENIDO ANALIZADO: ${lastAnalyzed}`,
    `NÚMERO DE PLANOS: ${ft.numero_planos}`,
    `DURACIÓN MEDIA DE PLANO: ${ft.duracion_media_plano}`,
    `PLANO MÁS LARGO: ${ft.plano_mas_largo}`,
    `PLANO MÁS CORTO: ${ft.plano_mas_corto}`,
    '',
    '**Triaje**',
    '',
    ...Object.entries(p1.triaje).map(([k, v]) => `- ${k.replace(/_/g, ' ').toUpperCase()}: ${v}`),
    '',
    '## 9.2 Procedencia y calidad de imagen',
    '',
    bullet(p1.procedencia, 'Sin observaciones de procedencia registradas.'),
    '',
    '## 9.3 Registro de entidades',
    '',
  )
  for (const e of p1.entidades) {
    out.push(`**${e.id}** — primera aparición ${e.primera_aparicion}`, `DESCRIPCIÓN FÍSICA: ${e.descripcion_fisica}`, `IDENTIFICACIÓN: ${e.identificacion}`, `APARICIONES: ${e.apariciones}`, '')
  }
  const fromWindows = merged.elements
  if (fromWindows.length) {
    out.push('**Entidades registradas durante la línea de tiempo** (no estaban en el registro inicial):', '')
    for (const el of fromWindows) out.push(`**${el.label}** — primera aparición ${mmss(el.start_seconds)}`, `DESCRIPCIÓN FÍSICA: ${el.detail ?? '[ND]'}`, '')
  }
  if (!p1.entidades.length && !fromWindows.length) out.push('No se registran entidades.', '')

  out.push('## 9.4 Mapa de planos', '')
  for (const p of p1.planos) {
    out.push(
      `**${p.id}** — ${p.inicio}–${p.fin} (${p.duracion})`,
      `ESCALA: ${p.escala}`,
      `ÁNGULO: ${p.angulo}`,
      `ALTURA: ${p.altura}`,
      `MOVIMIENTO: ${p.movimiento}`,
      `COMPOSICIÓN: ${p.composicion}`,
      `ILUMINACIÓN: ${p.iluminacion}`,
      `ENTRADA / SALIDA: ${p.entrada_salida}`,
      '',
    )
  }

  out.push('## 9.5 Línea de tiempo canónica', '', renderTimeline(merged), '')
  out.push('## 9.6 Transcripción literal', '', renderTranscript(merged), '')

  out.push('## 9.7 Texto en pantalla', '')
  if (!p1.textos_pantalla.length) out.push('No aparece texto en pantalla.', '')
  for (const t of p1.textos_pantalla) {
    out.push(
      `**${t.id}** — aparece ${t.aparece} / desaparece ${t.desaparece} (${t.duracion})`,
      `TIPO: ${t.tipo}`,
      `POSICIÓN: ${t.posicion}`,
      `CONTENIDO: ${t.contenido}`,
      `APARIENCIA: ${t.apariencia}`,
      `ANIMACIÓN: ${t.animacion}`,
      '',
    )
  }

  out.push('## 9.8 Registro diferencial de cambios de estado', '')
  if (!p3.cambios_estado.length) out.push('No se registran cambios de estado.', '')
  for (const c of p3.cambios_estado) {
    out.push(`**${c.timestamp}**`, `ANTES: ${c.antes}`, `TRANSICIÓN: ${c.transicion}`, `DESPUÉS: ${c.despues}`, `NO DETERMINABLE: ${c.no_determinable}`, '')
  }

  const g = p3.gramatica
  out.push(
    '## 9.9 Gramática audiovisual',
    '',
    `RITMO DE MONTAJE: ${g.ritmo_montaje}`,
    '',
    `ESTRUCTURA TEMPORAL: ${g.estructura_temporal}`,
    '',
    `SINCRONÍA: ${g.sincronia}`,
    '',
    `COREOGRAFÍA DEL TEXTO: ${g.coreografia_texto}`,
    '',
    `CONTINUIDAD: ${g.continuidad}`,
    '',
    `DISEÑO SONORO: ${g.diseno_sonoro}`,
    '',
    '## 9.10 Función / posible uso',
    '',
  )
  if (!p3.funcion.length) out.push('NO DETERMINABLE para todos los elementos: el video no demuestra un uso repetido ni un resultado directamente observable.', '')
  for (const fn of p3.funcion) {
    out.push(`ELEMENTO: ${fn.elemento}`, `EVIDENCIA: ${fn.evidencia}`, `POSIBLE FUNCIÓN: ${fn.posible_funcion}`, `NO DETERMINABLE: ${fn.no_determinable}`, '')
  }

  out.push('## 9.11 Interpretación', '', bullet(p3.interpretacion, 'Sin interpretaciones.'), '')

  out.push('## 9.12 Patrones replicables', '')
  for (const p of p3.patrones) {
    out.push(`**PATRÓN: ${p.patron}**`, `EVIDENCIA: ${p.evidencia}`, `MECANISMO: ${p.mecanismo}`, `CONDICIONES: ${p.condiciones}`, `TRANSFERIBILIDAD: ${p.transferibilidad}`, '')
  }

  out.push('## 9.13 Ficha de recreación por plano', '')
  for (const r of p3.recreacion) {
    out.push(
      `**${r.plano}** (${r.duracion})`,
      `SUJETOS Y ESTADO INICIAL: ${r.sujetos_estado_inicial}`,
      `ACCIÓN: ${r.accion}`,
      `CÁMARA: ${r.camara}`,
      `LUZ Y ENTORNO: ${r.luz_entorno}`,
      `AUDIO: ${r.audio}`,
      `TEXTO: ${r.texto}`,
      `ESTADO FINAL: ${r.estado_final}`,
      '',
    )
  }

  const limits = [...new Set([...p3.limites, ...windowLimits])]
  out.push('## 9.14 Límites del análisis', '', bullet(limits, 'Sin límites declarados.'), '')
  return out.join('\n')
}
