import {
  getVideo,
  getVideoSummary,
  listScenes,
  listTranscriptChunks,
  listVideoElements,
  listSkillsForVideo,
  listSkillImprovementsForVideo,
  listAnalysisRunsForVideo,
} from '@cva/memory-engine'
import type { Db, VideoElementRow } from '@cva/memory-engine'

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function formatVaultDate(date = new Date()): string {
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`
}

function timestamp(seconds: number | null): string {
  if (seconds === null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`
}

function range(start: number | null, end: number | null): string {
  if (start === null) return '—'
  return end === null ? timestamp(start) : `${timestamp(start)}–${timestamp(end)}`
}

/**
 * Marks a timestamp that falls outside the video's real duration.
 *
 * Gemini reliably derives the timeline for scenes and transcript, but on long
 * videos it still drifts on `elements` and skill ranges — this export has seen
 * an 11:29 video produce element timestamps up to 15:24. Clamping them would
 * invent data, and printing them bare invites citing a minute that does not
 * exist, so they are kept verbatim and flagged instead.
 */
function outOfRange(start: number | null, end: number | null, duration: number | null): boolean {
  if (duration === null) return false
  const tolerance = 1
  return (start !== null && start > duration + tolerance) || (end !== null && end > duration + tolerance)
}

function rangeWithin(start: number | null, end: number | null, duration: number | null): string {
  const text = range(start, end)
  return outOfRange(start, end, duration) ? `${text} ⚠️` : text
}

/** Markdown tables break on a raw pipe, and a newline would split the row. */
function cell(value: string | null): string {
  if (!value) return '—'
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

const ELEMENT_GROUPS: Array<{ kind: VideoElementRow['kind']; heading: string }> = [
  { kind: 'on_screen_text', heading: 'Texto en pantalla (OCR)' },
  { kind: 'object', heading: 'Objetos' },
  { kind: 'action', heading: 'Acciones' },
  { kind: 'person', heading: 'Personas' },
  { kind: 'relation', heading: 'Relaciones' },
]

const PHASE_LABEL: Record<string, string> = {
  first_pass: 'Análisis del video',
  deep_pass: 'Análisis profundo',
  skill_detection: 'Detección de skills',
  skill_generation: 'Generación de skill',
  skill_improvement: 'Mejora de skill',
  embedding: 'Indexado semántico',
}

/**
 * Renders one video's entire stored analysis as Markdown — every scene, every
 * transcript line, every detected element, plus the skills and the token/cost
 * log. Deliberately lossless: anything the analysis captured ends up here,
 * because the vault note is meant to stand on its own if the database is ever
 * lost or the video file is deleted.
 */
export function buildVideoMarkdown(videoId: string, db?: Db): string {
  const video = getVideo(videoId, db)
  if (!video) throw new Error(`El video ${videoId} no existe.`)

  const summary = getVideoSummary(videoId, db)
  const scenes = listScenes(videoId, db)
  const transcript = listTranscriptChunks(videoId, db)
  const elements = listVideoElements(videoId, db)
  const skills = listSkillsForVideo(videoId, db)
  const improvements = listSkillImprovementsForVideo(videoId, db)
  const runs = listAnalysisRunsForVideo(videoId, db)

  // A video analyzed under the V6.0 protocol already has its complete record,
  // in the protocol's own section order (frontmatter first). That IS the note.
  // The protocol does not cover where the video came from nor the skills;
  // they follow it, so the note still stands on its own.
  if (summary?.protocol_record_md) {
    return [
      summary.protocol_record_md.trimEnd(),
      '',
      ...originSection(video),
      ...skillSections(skills, improvements, video.duration_seconds),
      ...processingSection(runs),
      ...exportFooter(video.id),
    ].join('\n')
  }

  const topics: string[] = summary ? (JSON.parse(summary.topics_json) as string[]) : []
  const out: string[] = []

  out.push(`# ${video.title}`)
  out.push('')
  out.push(
    `Análisis completo del video, exportado automáticamente desde la app Video Analyzer. Incluye todo lo capturado: resumen, timeline escena por escena (imagen y audio), transcripción, y cada objeto, texto en pantalla, acción y persona detectados.`,
  )
  out.push('')
  out.push('#contenido #video #analisis-video')
  out.push('')

  // ── Ficha técnica ───────────────────────────────────────────────────────
  out.push('## Ficha del video')
  out.push('')
  out.push('| Dato | Valor |')
  out.push('|---|---|')
  out.push(`| Origen | ${video.source_kind === 'url' ? cell(video.source_url) : 'Archivo local'} |`)
  out.push(`| Duración | ${timestamp(video.duration_seconds)} |`)
  if (video.width && video.height) {
    out.push(`| Resolución | ${video.width}x${video.height}${video.fps ? ` @ ${video.fps.toFixed(1)}fps` : ''} |`)
  }
  if (video.container) out.push(`| Contenedor | ${cell(video.container)} |`)
  if (video.video_codec) out.push(`| Códec de video | ${cell(video.video_codec)} |`)
  if (video.audio_codec) out.push(`| Códec de audio | ${cell(video.audio_codec)} |`)
  if (video.size_bytes) out.push(`| Tamaño | ${(video.size_bytes / 1024 / 1024).toFixed(1)} MB |`)
  if (video.content_hash) out.push(`| Hash (SHA-256) | \`${video.content_hash}\` |`)
  out.push(`| Analizado | ${new Date(video.updated_at).toLocaleString('es-MX')} |`)
  out.push('')

  // ── Resumen ─────────────────────────────────────────────────────────────
  if (summary) {
    out.push('## Resumen')
    out.push('')
    out.push(`**En una línea:** ${summary.short_summary}`)
    out.push('')
    out.push(summary.full_summary)
    out.push('')
    if (topics.length) {
      out.push(`**Temas:** ${topics.join(' · ')}`)
      out.push('')
    }
  }

  // ── Timeline ────────────────────────────────────────────────────────────
  if (scenes.length) {
    out.push(`## Timeline completo (${scenes.length} escenas)`)
    out.push('')
    for (const scene of scenes) {
      out.push(`### [${range(scene.start_seconds, scene.end_seconds)}] ${scene.title ?? 'Escena ' + scene.scene_index}`)
      out.push('')
      out.push(`- **Imagen:** ${scene.description}`)
      out.push(`- **Audio:** ${scene.audio_description ?? '—'}`)
      out.push('')
    }
  }

  // ── Transcripción ───────────────────────────────────────────────────────
  if (transcript.length) {
    out.push(`## Transcripción completa (${transcript.length} intervenciones)`)
    out.push('')
    for (const chunk of transcript) {
      const who = chunk.speaker ? `**${chunk.speaker}:** ` : ''
      out.push(`- **[${timestamp(chunk.start_seconds)}]** ${who}${chunk.text}`)
    }
    out.push('')
  }

  // ── Elementos ───────────────────────────────────────────────────────────
  if (elements.length) {
    out.push(`## Todo lo que aparece (${elements.length} elementos)`)
    out.push('')
    if (elements.some((e) => outOfRange(e.start_seconds, e.end_seconds, video.duration_seconds))) {
      out.push(
        `> [!warning] Un ⚠️ marca un momento que cae fuera de la duración real del video (${timestamp(video.duration_seconds)}). Gemini derivó ese timestamp: el dato del elemento sirve, el minuto exacto no. Verifícalo en el video antes de citarlo.`,
      )
      out.push('')
    }
    for (const group of ELEMENT_GROUPS) {
      const items = elements.filter((e) => e.kind === group.kind)
      if (!items.length) continue
      out.push(`### ${group.heading} (${items.length})`)
      out.push('')
      out.push('| Momento | Qué es | Detalle |')
      out.push('|---|---|---|')
      for (const item of items) {
        out.push(
          `| ${rangeWithin(item.start_seconds, item.end_seconds, video.duration_seconds)} | ${cell(item.label)} | ${cell(item.detail)} |`,
        )
      }
      out.push('')
    }
  }

  out.push(...skillSections(skills, improvements, video.duration_seconds))

  out.push(...processingSection(runs), ...exportFooter(video.id))

  return out.join('\n')
}

type AnalysisRun = ReturnType<typeof listAnalysisRunsForVideo>[number]

/** Skills found in the video, the SKILL.md written for each, and the improvements proposed. */
function skillSections(
  skills: ReturnType<typeof listSkillsForVideo>,
  improvements: ReturnType<typeof listSkillImprovementsForVideo>,
  duration: number | null,
): string[] {
  const out: string[] = []
  // ── Skills ──────────────────────────────────────────────────────────────
  if (skills.length) {
    out.push('## Procesos reutilizables detectados (skills)')
    out.push('')
    out.push('| Skill | Tramo | Confianza | Estado | Qué cubre |')
    out.push('|---|---|---|---|---|')
    for (const skill of skills) {
      const confidence = skill.confidence === null ? '—' : `${Math.round(skill.confidence * 100)}%`
      out.push(
        `| \`${cell(skill.name)}\` | ${rangeWithin(skill.start_seconds, skill.end_seconds, duration)} | ${confidence} | ${skill.status} | ${cell(skill.description)} |`,
      )
    }
    out.push('')
    for (const skill of skills) {
      if (!skill.skill_md) continue
      out.push(`### SKILL.md generado: \`${skill.name}\``)
      out.push('')
      if (skill.output_path) out.push(`Guardado en: \`data/${skill.output_path}\``)
      out.push('')
      out.push('```markdown')
      out.push(skill.skill_md.trimEnd())
      out.push('```')
      out.push('')
    }
  }

  // ── Mejoras propuestas ──────────────────────────────────────────────────
  if (improvements.length) {
    out.push('## Mejoras propuestas a skills existentes')
    out.push('')
    for (const imp of improvements) {
      out.push(`### ${imp.title} — *${imp.kind}* (${imp.status})`)
      out.push('')
      out.push(`- **Evidencia:** ${range(imp.start_seconds, imp.end_seconds)}`)
      out.push(`- **Por qué:** ${imp.rationale}`)
      if (imp.proposed_diff) {
        out.push('')
        out.push('```markdown')
        out.push(imp.proposed_diff.trimEnd())
        out.push('```')
      }
      out.push('')
    }
  }

  return out
}

/** Where the video came from and which file it was: the note's link back to the post. */
function originSection(video: NonNullable<ReturnType<typeof getVideo>>): string[] {
  const out = ['## Origen del video', '', '| Dato | Valor |', '|---|---|']
  out.push(`| Origen | ${video.source_kind === 'url' ? cell(video.source_url) : 'Archivo local'} |`)
  if (video.original_filename) out.push(`| Archivo | ${cell(video.original_filename)} |`)
  if (video.content_hash) out.push(`| Hash (SHA-256) | \`${video.content_hash}\` |`)
  out.push(`| Analizado | ${new Date(video.updated_at).toLocaleString('es-MX')} |`, '')
  return out
}

/**
 * Token/cost table plus the real number of Gemini calls, failures included —
 * a 503 still spends daily quota, so hiding failed calls would misreport cost.
 * Rows with no tokens (per-job summary rows) are left out of the table.
 */
function processingSection(runs: AnalysisRun[]): string[] {
  const calls = runs.reduce((n, r) => n + (r.request_count ?? 1), 0)
  // The perception engine logs its requests without tokens: counting only
  // rows with tokens left its notes with no log at all.
  if (!calls) return []
  const okRuns = runs.filter((r) => r.succeeded && (r.input_tokens ?? 0) + (r.output_tokens ?? 0) > 0)
  const failed = runs.filter((r) => !r.succeeded).reduce((n, r) => n + (r.request_count ?? 1), 0)
  const byModel = new Map<string, number>()
  for (const r of runs) if (r.request_count) byModel.set(r.model, (byModel.get(r.model) ?? 0) + r.request_count)
  const out: string[] = [
    '## Registro de procesamiento',
    '',
    `Llamadas a la IA: **${calls}** (${calls - failed} correctas, ${failed} rechazadas o fallidas; las rechazadas también consumen cupo diario). Por modelo: ${[...byModel].map(([m, n]) => `${m} ${n}`).join(' · ')}.`,
    '',
  ]
  if (!okRuns.length) return out
  out.push('| Fase | Modelo | Modo | Tokens | Costo |', '|---|---|---|---|---|')
  let totalTokens = 0
  let totalCost = 0
  for (const run of okRuns) {
    const tokens = (run.input_tokens ?? 0) + (run.output_tokens ?? 0)
    totalTokens += tokens
    totalCost += run.estimated_cost_usd ?? 0
    out.push(
      `| ${PHASE_LABEL[run.phase] ?? run.phase} | ${cell(run.model)} | ${run.processing_mode ?? '—'} | ${tokens.toLocaleString('es-MX')} | $${(run.estimated_cost_usd ?? 0).toFixed(4)} |`,
    )
  }
  out.push(`| **Total** | | | **${totalTokens.toLocaleString('es-MX')}** | **$${totalCost.toFixed(4)}** |`, '')
  return out
}

/** Marks the note as this video's, so a later export overwrites it instead of adding a copy. */
export const noteMarker = (videoId: string) => `<!-- video-analyzer:${videoId} -->`

function exportFooter(videoId: string): string[] {
  return [
    '---',
    '',
    `*Exportado desde Video Analyzer el ${formatVaultDate()}. Fuente de verdad: la base de datos local de la app (\`data/db/app.sqlite\`).*`,
    '',
    noteMarker(videoId),
    '',
  ]
}
