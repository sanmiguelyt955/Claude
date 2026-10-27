import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { renderV6Record, type V6Phase1, type V6Phase3 } from '@cva/ai-router'

/** The smallest record the renderer accepts; each test changes what it checks. */
function render(over: {
  title?: string
  tags?: string[]
  phase1?: Partial<V6Phase1>
  phase3?: Partial<V6Phase3>
  scenes?: Array<{ start: number; end: number; description: string; aud?: string }>
  transcript?: Array<{ start: number; end: number; speaker: string; text: string }>
  elements?: Array<{ label: string; detail: string; start: number }>
  windowEntities?: V6Phase1['entidades']
  bloques?: string
  measuredTranscript?: boolean
}): string {
  return renderV6Record({
    meta: { title: over.title ?? 'colores', durationSeconds: 10 },
    phase1: {
      ficha: { duracion: '00:10 [META]', duracion_origen: 'metadata', relacion_aspecto: 'horizontal', planos: 1, naturaleza: 'real', audio: 'habla', sujetos: 'objetos', idioma_habla: 'español', tags: over.tags ?? [] },
      ficha_tecnica: { duracion_archivo: '10 s', ultimo_contenido_observable: '00:10', numero_planos: 1, duracion_media_plano: '10 s', plano_mas_largo: 'PL1', plano_mas_corto: 'PL1' },
      triaje: {},
      procedencia: [],
      entidades: [],
      planos: [],
      textos_pantalla: [],
      ...over.phase1,
    },
    merged: {
      summary: { short_summary: '', full_summary: '', topics: [], language: 'es' },
      scenes: (over.scenes ?? []).map((s, index) => ({ index, start_seconds: s.start, end_seconds: s.end, title: '', description: s.description, audio_description: s.aud ?? 'sin cambios' })),
      transcript: (over.transcript ?? []).map((t, index) => ({ index, start_seconds: t.start, end_seconds: t.end, speaker: t.speaker, text: t.text, language: 'es' })),
      elements: (over.elements ?? []).map((e) => ({ kind: 'object' as const, label: e.label, detail: e.detail, start_seconds: e.start, end_seconds: null })),
    },
    phase3: {
      resumen_corto: '', temas: [], cambios_estado: [],
      gramatica: { ritmo_montaje: 'PL1 10 s.', estructura_temporal: { secuencia_tramos: '', hitos: '' }, sincronia: '', coreografia_texto: '', continuidad: '', diseno_sonoro: '' },
      funcion: [], interpretacion: [], patrones: [], recreacion: [], limites: ['no hay patrones: un solo plano'],
      ...over.phase3,
    },
    windowLimits: [],
    windowEntities: over.windowEntities,
    bloques: over.bloques,
    measuredTranscript: over.measuredTranscript ?? true,
  })
}
const section = (md: string, n: string) => md.slice(md.indexOf(`## ${n} `), md.indexOf('\n## ', md.indexOf(`## ${n} `) + 1))
const pattern = (patron: string) => ({ patron, evidencia: '00:01', mecanismo: 'm', condiciones: 'c', transferibilidad: 'alta' })

test('9.10 writes every possible function with its [FUN] tag', () => {
  const md = render({ phase3: { funcion: [
    { elemento: 'O1', evidencia: 'e', posible_funcion: 'podría utilizarse para sujetar prendas', no_determinable: 'x' },
    { elemento: 'O2', evidencia: 'e', posible_funcion: '[FUN] podría utilizarse para cortar', no_determinable: 'x' },
    { elemento: 'O3', evidencia: 'e', posible_funcion: 'NO DETERMINABLE', no_determinable: 'x' },
  ] } })
  const fn = section(md, '9.10')
  assert.match(fn, /POSIBLE FUNCIÓN: \[FUN\] podría utilizarse para sujetar prendas/)
  assert.match(fn, /POSIBLE FUNCIÓN: \[FUN\] podría utilizarse para cortar\n/)
  assert.doesNotMatch(fn, /\[FUN\] \[FUN\]/)
  assert.match(fn, /POSIBLE FUNCIÓN: NO DETERMINABLE\n/)
})

test('fewer than 3 patterns without a reason are declared in 9.14', () => {
  const short = render({ phase3: { patrones: [pattern('a'), pattern('b')], limites: [] } })
  assert.match(section(short, '9.14'), /9\.12 tiene 2 patrón\(es\), menos de los 3 que pide el protocolo, y la síntesis no explicó por qué/)
  const explained = render({ phase3: { patrones: [pattern('a')], limites: ['Solo un patrón: el video es un plano fijo.'] } })
  assert.doesNotMatch(explained, /9\.12 tiene/)
  assert.doesNotMatch(render({ phase3: { patrones: [pattern('a'), pattern('b'), pattern('c')], limites: [] } }), /9\.12 tiene/)
})

test('9.9 stretches named by their role in the story are marked [INT]; quotes are not', () => {
  const md = render({ phase3: { gramatica: {
    ritmo_montaje: 'PL1 10 s.',
    estructura_temporal: { secuencia_tramos: '00:00–00:15 introducción al movimiento (15 %). 00:15–00:40 aparece P1 (25 %).', hitos: 'primer texto 00:02.12' },
    sincronia: 'fin del bloque de presentación en 01:07.08 (corte); el corte de 00:03.72 coincide con T1.', coreografia_texto: 'TX1 "Demostración" 00:02–00:04.', continuidad: '', diseno_sonoro: 'la música indica el cambio en 00:15.50.',
  } } })
  const g = section(md, '9.9')
  assert.match(g, /00:00–00:15 introducción al movimiento \(15 %\) \[INT — nombre de papel en el relato en sección de observación\]\./)
  assert.match(g, / 00:15–00:40 aparece P1 \(25 %\)\./)
  assert.match(g, /TX1 "Demostración" 00:02–00:04\.\n/, 'a quoted literal stays as it is')
  assert.match(g, /fin del bloque de presentación en 01:07\.08 \(corte\) \[INT — nombre de papel en el relato en sección de observación\]; el corte de 00:03\.72 coincide con T1\./, 'a decimal point does not end the sentence')
  assert.match(g, /la música indica el cambio en 00:15\.50 \[INT — deducción en sección de observación\]\./)
  assert.match(section(md, '9.14'), /2 frase\(s\) de 9\.9 nombraban el papel de un tramo/)
})

test('gender and age words in the observation sections are counted in 9.14, not in the transcript', () => {
  const md = render({
    phase1: { entidades: [{ id: 'VOZ1', primera_aparicion: '00:00', descripcion_fisica: 'Voz femenina de tono medio', identificacion: 'NO DETERMINABLE', apariciones: '00:00–00:10' }] },
    scenes: [{ start: 0, end: 1, description: 'VIS: El hombre P1 mira a cámara.\nTXT: sin cambios\nCAM: sin cambios' }],
    transcript: [{ start: 0, end: 2, speaker: 'VOZ1', text: 'Un hombre y una mujer' }],
  })
  assert.match(section(md, '9.14'), /2 palabra\(s\) de género o edad \("hombre", "mujer", "joven"\.\.\.\) en las secciones de observación \(9\.3: 1, 9\.5: 1\): el protocolo no permite inferirlos/)
})

test('9.6 marks pauses of a second or more between lines of the same voice', () => {
  const md = render({ transcript: [
    { start: 0, end: 2, speaker: 'VOZ1', text: 'uno' },
    { start: 4.11, end: 5, speaker: 'VOZ1', text: 'dos' },
    { start: 5.5, end: 6, speaker: 'VOZ1', text: 'tres' },
    { start: 8, end: 9, speaker: 'VOZ2', text: 'cuatro' },
  ] })
  const t = section(md, '9.6')
  assert.match(t, /T1 — 00:00–00:02 — VOZ1: "uno"\n\[pausa 2\.1 s\] \[META\]\nT2 — 00:04\.11–00:05 — VOZ1: "dos"\nT3/)
  assert.match(t, /"tres"\nT4/, 'half a second is not a long pause; another voice is not a pause')
  // The Gemini engine's transcript is the model's own: its times are not measured.
  assert.doesNotMatch(render({ measuredTranscript: false, transcript: [{ start: 0, end: 2, speaker: 'VOZ1', text: 'uno' }, { start: 4, end: 5, speaker: 'VOZ1', text: 'dos' }] }), /\[pausa/)
})

test('the frontmatter quotes what YAML would misread, and a numeric tag gets a letter', () => {
  const fm = (title: string, tags: string[] = []) => render({ title, tags }).split('---')[1]!
  assert.match(fm('- Episodio 3 -'), /^fuente: "- Episodio 3 -"$/m)
  assert.match(fm('2024'), /^fuente: "2024"$/m)
  assert.match(fm('null'), /^fuente: "null"$/m)
  assert.match(fm('No'), /^fuente: "No"$/m)
  assert.match(fm('Makers: la ciencia'), /^fuente: "Makers: la ciencia"$/m)
  assert.match(fm('Tutorial de cocina'), /^fuente: Tutorial de cocina$/m)
  assert.match(fm('x', ['2024', 'tutorial']), /^tags: \[analisis-video, n2024, tutorial\]$/m)
})

const hasPyYaml = spawnSync('python3', ['-c', 'import yaml'], { stdio: 'ignore' }).status === 0
test('a YAML parser reads the frontmatter back as the same strings', { skip: !hasPyYaml && 'PyYAML no instalado' }, () => {
  for (const title of ['- Episodio 3 -', '2024', 'null', 'No', 'yes', '', 'Makers: la ciencia', 'Cómo #1 [parte 2]', 'Tutorial de cocina']) {
    const front = render({ title, tags: ['2024', 'tutorial'] }).split('---')[1]!
    const parsed = JSON.parse(execFileSync('python3', ['-c', 'import sys, yaml, json; print(json.dumps(yaml.safe_load(sys.stdin.read())))'], { input: front }).toString())
    assert.equal(parsed.fuente, title)
    assert.deepEqual(parsed.tags, ['analisis-video', 'n2024', 'tutorial'])
  }
})

test('entities found by the windows get the four 9.3 lines', () => {
  const md = render({ windowEntities: [{ id: 'TX18', primera_aparicion: '01:05', descripcion_fisica: 'cartela blanca', identificacion: 'Cartela identificativa', apariciones: 'desde 01:05 (tramo 5)' }] })
  assert.match(section(md, '9.3'), /\*\*TX18\*\* — primera aparición 01:05\nDESCRIPCIÓN FÍSICA: cartela blanca\nIDENTIFICACIÓN: \[ID\] Cartela identificativa\nAPARICIONES: desde 01:05 \(tramo 5\)/)
  // The Gemini engine passes them as elements labelled "ID — identificación".
  const gemini = render({ elements: [{ label: 'O7-f2 — NO DETERMINABLE', detail: 'vaso de borde ancho', start: 5 }] })
  assert.match(section(gemini, '9.3'), /\*\*O7-f2\*\* — primera aparición 00:05\nDESCRIPCIÓN FÍSICA: vaso de borde ancho\nIDENTIFICACIÓN: NO DETERMINABLE\nAPARICIONES: \[ND\]/)
})

test('9.1 names the stretches the timeline was asked in', () => {
  assert.match(render({ bloques: 'tramo 1: 00:00–02:00 / tramo 2: 02:00–03:49.68' }), /^MAPA DE BLOQUES: tramo 1: 00:00–02:00 \/ tramo 2: 02:00–03:49\.68 \(los "\[tramo N\]" de 9\.14 remiten a estos tramos\)\.$/m)
  assert.doesNotMatch(render({}), /MAPA DE BLOQUES/)
})

test('an entry flagged for hiding a cut is printed with all its channels, not as a still second', () => {
  const md = render({ scenes: [{ start: 0, end: 1, description: 'VIS: [BAJA] El tramo la dio como «SIN CAMBIOS OBSERVABLES. Persisten: P1.», pero en ella hay un corte medido en 00:00.52: lo que cambia no quedó descrito [ND].\nTXT: sin cambios\nCAM: sin cambios\nCORTE en 00:00.52 → PL2' }] })
  assert.match(section(md, '9.5'), /\[00:00–00:01\]\nVIS: \[BAJA\] El tramo la dio como «SIN CAMBIOS OBSERVABLES[^\n]*\nAUD: sin cambios\nTXT: sin cambios\nCAM: sin cambios\nCORTE en 00:00\.52 → PL2/)
})
