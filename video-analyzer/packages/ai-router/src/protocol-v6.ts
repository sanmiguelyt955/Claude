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

export const PROTOCOL_VERSION = 'v6.5'

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
    eje0_fuente: STR,
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
      fondo_superficie: STR,
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
  planos: Array<
    Record<'id' | 'inicio' | 'fin' | 'duracion' | 'escala' | 'angulo' | 'altura' | 'movimiento' | 'composicion' | 'iluminacion' | 'entrada_salida', string> & {
      /** v6.3+ — absent in records produced under earlier versions. */
      fondo_superficie?: string
    }
  >
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

- ficha → 9.0 (sin los campos "fuente", "fuente_tipo", "acceso", "alcance" ni "tramo_original": los pone la app). "planos" = número de planos.
- ficha_tecnica + triaje → 9.1 (los ocho ejes, 0 a 7, de la sección 7). La fuente de esta llamada es un VIDEO con acceso directo continuo: eje0_fuente = "video; acceso directo continuo; video completo".
- procedencia → 9.2, una observación por elemento de la lista.
- entidades → 9.3. Asigna aquí los IDs DEFINITIVOS (P#, A#, O#, I#, E#, C#, F#) de TODO el video: la fase 2 los usará tal cual. "apariciones" con la notación de asterisco tras cada corte.
- planos → 9.4, un elemento por plano, IDs PL1, PL2... en orden. Si no hay cortes, un solo plano. "fondo_superficie" = FONDO Y SUPERFICIE; la iluminación, descrita por sus efectos (CASO 32).
- textos_pantalla → 9.7. Array vacío si no aparece texto en pantalla.

Los timestamps dentro de los textos van en formato mm:ss o mm:ss.s, tiempo absoluto del video.
NO entregues todavía la línea de tiempo (9.5), la transcripción (9.6) ni las secciones 9.8 a 9.14: llegan en las fases 2 y 3.
Aplica las tres pruebas, las etiquetas y los límites de la sección 4 a cada campo.
Responde SOLO con el objeto JSON.`
}

// ─── Phase 2: one window of the canonical timeline ────────────────────────

export const V6_WINDOW_SCHEMA = obj({
  // transcript FIRST: the model writes properties in this order, and the
  // timeline (the long one) used to come first and exhaust its output budget,
  // leaving the transcript short — 325 words against ~497 on 3 Oct 2026.
  transcript: {
    type: 'array',
    items: obj({ start_seconds: { type: 'number' }, end_seconds: { type: 'number' }, voz: STR, texto: STR }),
  },
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
Este fragmento es un tramo que la app corta y vuelve a unir; no es una PARTE de la sección 8.1. No apliques la sección 8: tiempos absolutos del video, sin sufijos de parte en los IDs y sin bloque de continuidad. Sí vale su regla 2: los bordes del fragmento no son cortes.

${phase1Reference(phase1)}

Usa EXACTAMENTE esos IDs. No vuelvas a describir físicamente una entidad ya registrada: menciónala por su ID y registra solo lo que cambia. Tras un corte, usa la notación con asterisco (P1*). Si aparece algo que no está en el registro, agrégalo en "entidades_nuevas" con un ID nuevo terminado en "-f${windowIndex + 1}" (ej. O7-f${windowIndex + 1}).

ENTREGA, en el JSON del esquema dado:

timeline → 9.5 para ESTE fragmento. Una entrada por segundo, sin saltos ni solapes: start_seconds=${first}, end_seconds=${first + 1}; luego ${first + 1}–${first + 2}; ... hasta la última, que termina exactamente en ${b}. Los números son TIEMPO ABSOLUTO del video.
- vis, aud, txt, cam: los cuatro canales SIEMPRE presentes. Si un canal no tiene novedades, escribe "sin cambios"; nunca lo dejes vacío.
- aud es obligatorio en CADA segundo: habla ("VOZ 1 habla"), música, ambiente, efectos, sonidos de contacto o manipulación, o silencio (distinguiendo silencio total de la ausencia de una capa).
- sin_cambios=true solo si el segundo no tiene ningún cambio observable; entonces vis = "SIN CAMBIOS OBSERVABLES. Persisten: [...]". Nunca rellenes un segundo estable con microacciones que no viste (CASO 21).
- cortes: una línea "CORTE en mm:ss.s → PL#" por cada corte dentro de ese segundo; array vacío si no hay.
transcript → 9.6 del fragmento. Literal, palabra por palabra, con muletillas, [pausa N s], [énfasis en "palabra"], [INAUDIBLE]. Nunca paráfrasis. Tiempos absolutos. Array vacío solo si no hay habla en el fragmento.
REGLAS DE COMPLETITUD DE LA TRANSCRIPCIÓN (medibles; la transcripción es lo primero que se recorta cuando hay muchos campos que llenar, y el protocolo prohíbe recortarla):
- Entrada nueva por cada frase o cláusula; ninguna entrada dura más de 8 segundos. Una sola entrada larga para medio minuto de habla es una transcripción recortada.
- El habla normal es de 2 a 3 palabras por segundo mientras alguien habla. Si tu transcripción de este fragmento tiene claramente menos palabras que eso, estás omitiendo palabras: vuelve a escuchar y completa.
- Todo segundo donde aud diga que VOZ habla debe quedar cubierto por alguna entrada de transcript, y todo segundo cubierto por una entrada debe tener VOZ en aud.
- Escribe la transcripción ANTES de decidir cómo resumir nada en los demás campos; el tiempo de la respuesta no se gasta antes en vis.
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

/**
 * 9.9 sub-measurements as [schema key, exact protocol label]. Asked as separate
 * fields since v6.3: as free text the model abbreviated the labels
 * ("MARCADORES", "CAMBIOS ESTADO") on 5 Oct 2026, so the app now writes them.
 */
const ESTRUCTURA_FIELDS = [
  ['secuencia_tramos', 'SECUENCIA DE TRAMOS'],
  ['hitos', 'HITOS'],
] as const
const RETENCION_FIELDS = [
  ['apertura', 'APERTURA (00:00–00:04)'],
  ['marcadores_fin_apertura', 'MARCADORES DE FIN DE APERTURA'],
  ['sujeto_principal', 'SUJETO PRINCIPAL'],
  ['cambios_estado_sujeto', 'CAMBIOS DE ESTADO DEL SUJETO PRINCIPAL'],
  ['estado_final_visible', 'ESTADO FINAL VISIBLE'],
  ['sonido_momentos_clave', 'SONIDO EN EL MAYOR CAMBIO Y EN EL ESTADO FINAL VISIBLE'],
  ['llamadas_accion', 'LLAMADAS A LA ACCIÓN'],
  ['cierre', 'CIERRE'],
] as const
const SUJETO_FIELDS = [
  ['zonas_mostradas', 'ZONAS MOSTRADAS'],
  ['visibilidad', 'VISIBILIDAD'],
  ['planos_detalle', 'PLANOS DE DETALLE'],
  ['manipulacion', 'MANIPULACIÓN'],
  ['presencia_rostro', 'PRESENCIA DE ROSTRO'],
] as const

type LabeledFields = readonly (readonly [string, string])[]
const fieldsObj = (fields: LabeledFields) => obj(Object.fromEntries(fields.map(([k]) => [k, STR])))

export const V6_PHASE3_SCHEMA = obj({
  resumen_corto: STR,
  temas: STR_ARR,
  cambios_estado: { type: 'array', items: obj({ timestamp: STR, antes: STR, transicion: STR, despues: STR, no_determinable: STR }) },
  gramatica: obj({
    ritmo_montaje: STR,
    estructura_temporal: fieldsObj(ESTRUCTURA_FIELDS),
    sincronia: STR,
    coreografia_texto: STR,
    continuidad: STR,
    diseno_sonoro: STR,
    arquitectura_retencion: fieldsObj(RETENCION_FIELDS),
    sujeto_principal_manipulacion: fieldsObj(SUJETO_FIELDS),
  }),
  plan_rodaje: obj({ setup: STR, secuencia: STR, sujetos: STR }),
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
  gramatica: Record<'ritmo_montaje' | 'sincronia' | 'coreografia_texto' | 'continuidad' | 'diseno_sonoro', string> & {
    /** Free text before v6.3; one field per labeled measurement since. */
    estructura_temporal: string | Record<string, string>
    /** v6.1+ — absent in records produced under v6.0. */
    arquitectura_retencion?: string | Record<string, string>
    sujeto_principal_manipulacion?: string | Record<string, string>
  }
  /** v6.1+ — the general plan that opens 9.13. */
  plan_rodaje?: Record<'setup' | 'secuencia' | 'sujetos', string>
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
- gramatica → 9.9, un campo por medición: cada campo es el contenido de la medición de 9.9 que lleva ese nombre (el rótulo lo pone la app; no lo repitas). Porcentajes sobre la duración exacta de la metadata. 9.9 es OBSERVACIÓN: ninguna deducción ("indica", "sugiere", "actúa como") ni nombre de papel en el relato ("planteamiento", "diagnóstico", "énfasis"); todo eso va a interpretacion (CASO 33).
- cambios_estado y gramatica: antes de responder, relee cada frase con la PRUEBA 1. Una deducción que quede aquí se marcará [INT] automáticamente y constará como fallo en los límites.
- funcion → 9.10 (opcional por elemento; para la mayoría la respuesta esperada es NO DETERMINABLE)
- interpretacion → 9.11, cada entrada marcada [INT], con su rótulo ("[INT] DISPARADOR: ...") y con su timestamp o ID. Una entrada por cada una de: técnica de apertura, disparador, mecanismo psicológico principal, estructura narrativa (nombre de cada tramo, y el % del clímax con su criterio), papel del rostro (solo si aparece alguno), acción buscada y registro de producción. La que el registro no sostenga no se escribe y se declara en limites.
- patrones → 9.12, objetivo 3 o más, cada uno superando la prueba de cambio de sujeto. Si el registro no sostiene 3, entrega los que sí y declara el motivo en limites; nunca inventes uno para llegar a la cifra (CASO 31).
- plan_rodaje → el PLAN GENERAL con que empieza 9.13 (setup, secuencia con la manipulación, sujetos con su perfil para recreación [INT] y cada aparición de rostro)
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

/**
 * The model cannot know the final T# numbering: each window sees only its own
 * slice, and it was observed citing "T15" in a window with 5 lines and "T14"
 * in one with 1 (3 Oct 2026). So its T# citations are discarded and the
 * references are recomputed here from the merged transcript, by time overlap.
 * A second where VOICE is said to speak but no transcript line overlaps it is
 * flagged instead of silently pointing nowhere (protocol section 4: declare
 * the limit).
 */
function audWithTranscriptRefs(aud: string | null, start: number, end: number, transcript: AnalysisResult['transcript']): string {
  const text = (aud ?? '').replace(/\s*[—–-]\s*T\d+(?:\s*(?:y|,|\+|\/)\s*T\d+)*/g, '').trim() || 'sin cambios'
  const refs = transcript
    .map((t, i) => ({ n: i + 1, t }))
    .filter(({ t }) => t.start_seconds < end - 0.01 && t.end_seconds > start + 0.01)
    .map(({ n }) => `T${n}`)
  if (refs.length) return `${text.replace(/\.$/, '')} — ${refs.join(' y ')}`
  if (/\bVOZ\b/i.test(text) && /habla|hablando|continúa|continua/i.test(text)) {
    return `${text.replace(/\.$/, '')} [BAJA — sin línea de transcripción para este segundo]`
  }
  return text
}

function renderTimeline(r: AnalysisResult): string {
  return r.scenes
    .map((s) => {
      const aud = audWithTranscriptRefs(s.audio_description, s.start_seconds, s.end_seconds, r.transcript)
      const lines = s.description.split('\n')
      const vis = lines.find((l) => l.startsWith('VIS:')) ?? `VIS: ${s.description}`
      const rest = lines.filter((l) => !l.startsWith('VIS:'))
      const txt = rest.find((l) => l.startsWith('TXT:')) ?? 'TXT: sin cambios'
      const cam = rest.find((l) => l.startsWith('CAM:')) ?? 'CAM: sin cambios'
      const cuts = rest.filter((l) => l.startsWith('CORTE'))
      const head = `[${mmss(s.start_seconds)}–${mmss(s.end_seconds)}]`
      if (vis.includes('SIN CAMBIOS OBSERVABLES')) {
        return [`${head}`, vis.replace(/^VIS:\s*/, ''), `AUD: ${aud}`, ...cuts].join('\n')
      }
      return [head, vis, `AUD: ${aud}`, txt, cam, ...cuts].join('\n')
    })
    .join('\n\n')
}

function renderTranscript(r: AnalysisResult): string {
  if (!r.transcript.length) return 'No se detecta habla.'
  return r.transcript
    .map((t, i) => `T${i + 1} — ${mmss(t.start_seconds)}–${mmss(t.end_seconds)} — ${t.speaker ?? 'VOZ 1'}: "${t.text}"`)
    .join('\n')
}

/**
 * Safety net for protocol PRUEBA 1 in the sections that observe (9.8, 9.9):
 * a sentence that deduces ("indicando grabación en interior", 5 Oct 2026) is
 * tagged [INT] inline — the data stays, and the reader sees it is a reading,
 * not a measurement. Returns the text and how many sentences were tagged.
 */
const DEDUCTION = /\b(indica|indican|indicando|sugiere|sugieren|sugiriendo|denota|denotan|revela|revelan|actúa como|actúan como|sirve para|sirven para|con el fin de|lo que demuestra|lo que implica)\b/i

function tagDeductions(text: string): { text: string; tagged: number } {
  let tagged = 0
  const out = text.replace(/[^.;\n]+[.;]?/g, (sentence) => {
    if (!DEDUCTION.test(sentence) || /\[INT/.test(sentence)) return sentence
    tagged++
    const end = sentence.match(/[.;]$/)?.[0] ?? ''
    return `${sentence.slice(0, sentence.length - end.length)} [INT — deducción en sección de observación]${end}`
  })
  return { text: out, tagged }
}

/** A 9.9 measurement: free text (before v6.3) or one labeled field each. */
function labeled(value: string | Record<string, string> | undefined, fields: LabeledFields, legacy: string): string {
  if (value === undefined) return legacy
  if (typeof value === 'string') return value
  return fields.map(([key, label]) => `${label}: ${value[key] ?? '[ND]'}`).join('\n\n')
}

/** Applies tagDeductions to 9.8 and 9.9, counting what it tagged. */
function guardObservation(p3: V6Phase3): { p3: V6Phase3; tagged: number } {
  let tagged = 0
  const fix = (s: string) => {
    const r = tagDeductions(s)
    tagged += r.tagged
    return r.text
  }
  const fixAny = <T extends string | Record<string, string> | undefined>(v: T): T =>
    (v === undefined ? v : typeof v === 'string' ? fix(v) : Object.fromEntries(Object.entries(v).map(([k, s]) => [k, fix(s)]))) as T
  const g = p3.gramatica
  const out: V6Phase3 = {
    ...p3,
    cambios_estado: p3.cambios_estado.map((c) => ({ ...c, antes: fix(c.antes), transicion: fix(c.transicion), despues: fix(c.despues) })),
    gramatica: {
      ...g,
      ritmo_montaje: fix(g.ritmo_montaje),
      estructura_temporal: fixAny(g.estructura_temporal),
      sincronia: fix(g.sincronia),
      coreografia_texto: fix(g.coreografia_texto),
      continuidad: fix(g.continuidad),
      diseno_sonoro: fix(g.diseno_sonoro),
      arquitectura_retencion: fixAny(g.arquitectura_retencion),
      sujeto_principal_manipulacion: fixAny(g.sujeto_principal_manipulacion),
    },
  }
  return { p3: out, tagged }
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
  /**
   * How the model reached the source (protocol section 1). The Gemini
   * engine sends the whole file: "directo". The perception engine sends
   * sampled frames and the full audio: "muestreado", with its detail.
   */
  access?: { acceso: string; detalle: string; cobertura: string }
  /** Texts on screen gathered window by window (perception), when phase 1 has none. */
  textosPantalla?: V6Phase1['textos_pantalla']
}): string {
  const { meta, phase1: p1, merged, windowLimits } = input
  const access = input.access ?? {
    acceso: 'directo',
    detalle: 'directo continuo: Gemini recibe el archivo completo, muestreado por Google a una frecuencia fija de fotogramas.',
    cobertura: 'VIS, AUD y TXT: 100 % de la duración.',
  }
  const guarded = guardObservation(input.phase3)
  const p3 = guarded.p3
  const f = p1.ficha
  const ft = p1.ficha_tecnica
  const lastAnalyzed = merged.scenes.length ? mmss(merged.scenes[merged.scenes.length - 1]!.end_seconds) : 'ND'
  const out: string[] = []

  out.push(
    '---',
    'tipo: analisis-video',
    `protocolo: ${PROTOCOL_VERSION}`,
    `fuente: ${yamlValue(meta.title)}`,
    // The app only ingests video files; audio and transcript sources are
    // covered by the protocol itself when it is used outside the app.
    'fuente_tipo: video',
    `acceso: ${access.acceso}`,
    'alcance: completo',
    `tramo_original: ${yamlValue(`00:00–${mmss(meta.durationSeconds)}`)}`,
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
    `ALCANCE Y TRAMO: video completo, 00:00–${mmss(meta.durationSeconds)}. Tiempos del registro: del archivo, que es el original.`,
    `ACCESO: ${access.detalle}`,
    `MAPA DE COBERTURA: ${access.cobertura}`,
    '',
    '**Triaje**',
    '',
    ...Object.entries(p1.triaje).map(([k, v]) => `- ${k.replace(/_/g, ' ').toUpperCase()}: ${v}`),
    '',
    '## 9.2 Procedencia y calidad de la fuente',
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
      `FONDO Y SUPERFICIE: ${p.fondo_superficie ?? '[ND] — registro producido con una versión del protocolo anterior a v6.3.'}`,
      `ILUMINACIÓN: ${p.iluminacion}`,
      `ENTRADA / SALIDA: ${p.entrada_salida}`,
      '',
    )
  }

  out.push('## 9.5 Línea de tiempo canónica', '', renderTimeline(merged), '')
  out.push('## 9.6 Transcripción literal', '', renderTranscript(merged), '')

  out.push('## 9.7 Texto en pantalla', '')
  const textos = p1.textos_pantalla.length ? p1.textos_pantalla : (input.textosPantalla ?? [])
  if (!textos.length) out.push('No aparece texto en pantalla.', '')
  for (const t of textos) {
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
    `**ESTRUCTURA TEMPORAL**`,
    '',
    labeled(g.estructura_temporal, ESTRUCTURA_FIELDS, '[ND]'),
    '',
    `SINCRONÍA: ${g.sincronia}`,
    '',
    `COREOGRAFÍA DEL TEXTO: ${g.coreografia_texto}`,
    '',
    `CONTINUIDAD: ${g.continuidad}`,
    '',
    `DISEÑO SONORO: ${g.diseno_sonoro}`,
    '',
    '**ARQUITECTURA DE RETENCIÓN**',
    '',
    labeled(g.arquitectura_retencion, RETENCION_FIELDS, '[ND] — registro producido con una versión del protocolo anterior a v6.1.'),
    '',
    '**SUJETO PRINCIPAL Y MANIPULACIÓN**',
    '',
    labeled(g.sujeto_principal_manipulacion, SUJETO_FIELDS, '[ND] — registro producido con una versión del protocolo anterior a v6.1.'),
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
  if (p3.plan_rodaje) {
    out.push(
      '**PLAN GENERAL**',
      '',
      `SETUP: ${p3.plan_rodaje.setup}`,
      '',
      `SECUENCIA: ${p3.plan_rodaje.secuencia}`,
      '',
      `SUJETOS: ${p3.plan_rodaje.sujetos}`,
      '',
    )
  }
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
  if (guarded.tagged) {
    limits.push(`${guarded.tagged} frase(s) de 9.8/9.9 contenían una deducción ("indica", "sugiere", "actúa como"...) y quedaron marcadas [INT] automáticamente: léanse como interpretación, no como medición.`)
  }
  out.push('## 9.14 Límites del análisis', '', bullet(limits, 'Sin límites declarados.'), '')
  return out.join('\n')
}
