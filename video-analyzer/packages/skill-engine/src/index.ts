import path from 'node:path'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import {
  SKILLS_OUT_DIR,
  getVideoSummary,
  listScenes,
  listTranscriptChunks,
  toDataRelativePath,
  resolveDataPath,
} from '@cva/memory-engine'
import type { SceneRow, TranscriptChunkRow } from '@cva/memory-engine'

/**
 * Detection, generation and improvement of Agent Skills.
 * Implemented in bloques 6 and 7.
 */

export type DetectedSkill = {
  name: string // <= 64 chars, [a-z0-9-]
  description: string // <= 200 chars
  startSeconds: number
  endSeconds: number
  confidence: number
}

export type GeneratedSkill = {
  skillMd: string
  assets: { path: string; contents: string }[]
}

export type ProposedImprovement = {
  kind: 'new_step' | 'better_method' | 'new_tool' | 'pitfall' | 'missing_info' | 'outdated'
  title: string
  rationale: string
  startSeconds: number | null
  endSeconds: number | null
  proposedDiff: string
}

/** Agent Skills spec constraints, enforced before anything is written to disk. */
export const SKILL_NAME_MAX = 64
export const SKILL_DESCRIPTION_MAX = 200
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Forces a Gemini-proposed name into the Agent Skills spec shape rather than
 * rejecting it outright — the model is instructed to already produce this
 * shape, but free-text generation is never fully reliable and the folder
 * name on disk cannot be invalid.
 */
export function normalizeSkillName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents (after NFD decomposition)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SKILL_NAME_MAX)
    .replace(/-+$/g, '')
  return slug || `skill-${Date.now()}`
}

export function clampDescription(raw: string): string {
  return raw.length <= SKILL_DESCRIPTION_MAX ? raw : raw.slice(0, SKILL_DESCRIPTION_MAX - 1) + '…'
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Builds the plain-text digest handed to Gemini for skill *detection* — the
 * full summary, every scene and the full transcript, all already sitting in
 * SQLite from the 'analyze' job. Deliberately text-only and no re-upload of
 * the video (feedback: minimize credits spent on video analysis), since the
 * transcript+scenes already carry everything a process/method needs to be
 * recognized in.
 */
export function buildVideoDigest(videoId: string, db?: Parameters<typeof getVideoSummary>[1]): string {
  const summary = getVideoSummary(videoId, db)
  const scenes = listScenes(videoId, db)
  const transcript = listTranscriptChunks(videoId, db)

  const parts: string[] = []
  if (summary) {
    parts.push(`RESUMEN: ${summary.full_summary}`)
  }
  if (scenes.length) {
    parts.push(
      'ESCENAS:\n' +
        scenes.map((s) => `[${formatSeconds(s.start_seconds)}-${formatSeconds(s.end_seconds)}] ${s.title ?? ''}: ${s.description}`).join('\n'),
    )
  }
  if (transcript.length) {
    parts.push(
      'TRANSCRIPCION:\n' +
        transcript.map((t) => `[${formatSeconds(t.start_seconds)}] ${t.speaker ? t.speaker + ': ' : ''}${t.text}`).join('\n'),
    )
  }
  return parts.join('\n\n')
}

/**
 * Same idea as buildVideoDigest but scoped to one candidate's time range —
 * used for *generation*, where only the relevant slice should drive the
 * SKILL.md content (padded slightly so a step that starts a beat early/late
 * isn't cut off).
 */
export function buildSegmentDigest(
  videoId: string,
  startSeconds: number,
  endSeconds: number,
  db?: Parameters<typeof listScenes>[1],
): string {
  const padding = 5
  const from = Math.max(0, startSeconds - padding)
  const to = endSeconds + padding

  const scenes = listScenes(videoId, db).filter((s: SceneRow) => s.end_seconds >= from && s.start_seconds <= to)
  const transcript = listTranscriptChunks(videoId, db).filter(
    (t: TranscriptChunkRow) => t.end_seconds >= from && t.start_seconds <= to,
  )

  const parts: string[] = []
  if (scenes.length) {
    parts.push(
      'ESCENAS:\n' +
        scenes.map((s) => `[${formatSeconds(s.start_seconds)}-${formatSeconds(s.end_seconds)}] ${s.title ?? ''}: ${s.description}`).join('\n'),
    )
  }
  if (transcript.length) {
    parts.push(
      'TRANSCRIPCION:\n' +
        transcript.map((t) => `[${formatSeconds(t.start_seconds)}] ${t.speaker ? t.speaker + ': ' : ''}${t.text}`).join('\n'),
    )
  }
  return parts.join('\n\n')
}

function buildSkillMd(name: string, description: string, bodyMarkdown: string): string {
  return `---\nname: ${name}\ndescription: ${description.replace(/\n/g, ' ')}\n---\n\n${bodyMarkdown.trim()}\n`
}

/**
 * Writes the full Agent Skills folder to disk under DATA_DIR/skills-generadas
 * (SKILLS_OUT_DIR), ready to be copied to ~/.claude/skills/ (personal) or
 * .claude/skills/ (project) per PROJECT.md §12. Returns the DATA_DIR-relative
 * output path, since every *_path column in this app is stored that way.
 */
/**
 * A file name the model proposed, reduced to a plain name inside its folder:
 * "../../scripts/launcher.ps1" would otherwise be written outside the skill,
 * over the app's own files.
 */
export function safeAssetName(raw: string, fallback: string): string {
  const base = (raw ?? '').split(/[\\/]/).pop()!.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '')
  return base || fallback
}

export async function writeSkillFolder(input: {
  name: string
  description: string
  bodyMarkdown: string
  references: { filename: string; contents: string }[]
  scripts: { filename: string; contents: string }[]
}): Promise<{ outputPath: string; skillMd: string; assets: { path: string; contents: string }[] }> {
  const skillMd = buildSkillMd(input.name, input.description, input.bodyMarkdown)
  const dir = path.join(SKILLS_OUT_DIR, input.name)

  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'SKILL.md'), skillMd, 'utf8')

  const assets: { path: string; contents: string }[] = []

  if (input.references.length) {
    const refDir = path.join(dir, 'references')
    await mkdir(refDir, { recursive: true })
    for (const ref of input.references) {
      const relPath = path.join('references', safeAssetName(ref.filename, 'referencia.md'))
      await writeFile(path.join(dir, relPath), ref.contents, 'utf8')
      assets.push({ path: relPath, contents: ref.contents })
    }
  }

  if (input.scripts.length) {
    const scriptDir = path.join(dir, 'scripts')
    await mkdir(scriptDir, { recursive: true })
    for (const script of input.scripts) {
      const relPath = path.join('scripts', safeAssetName(script.filename, 'script.txt'))
      await writeFile(path.join(dir, relPath), script.contents, 'utf8')
      assets.push({ path: relPath, contents: script.contents })
    }
  }

  return { outputPath: toDataRelativePath(dir), skillMd, assets }
}

// ── Mejora de Skills (PROJECT.md §13, bloque 7) ────────────────────────────

export const IMPROVEMENT_KIND_LABEL: Record<ProposedImprovement['kind'], string> = {
  new_step: 'Paso nuevo',
  better_method: 'Mejor metodo',
  new_tool: 'Herramienta nueva',
  pitfall: 'Error a evitar',
  missing_info: 'Informacion faltante',
  outdated: 'Desactualizado',
}

/** Reads a SKILL.md living outside SKILLS_OUT_DIR — the "point at a file on disk" path of §13. */
export async function readExternalSkillMd(absolutePath: string): Promise<string> {
  await access(absolutePath)
  return readFile(absolutePath, 'utf8')
}

/**
 * Deterministic "[Aplicar]" (PROJECT.md §13): appends the improvement's
 * proposed_diff as its own section at the end of the current SKILL.md,
 * rather than re-prompting Gemini to merge it in. This is also why each
 * proposed_diff is required to be self-contained (ai-router/src/skills.ts) —
 * applying two improvements back-to-back just stacks two sections, with no
 * risk of one clobbering context the other needed.
 */
export function appendImprovementToSkillMd(
  currentSkillMd: string,
  improvement: { kind: ProposedImprovement['kind']; title: string; proposedDiff: string },
): string {
  const heading = `\n\n## Actualizacion: ${improvement.title}\n_${IMPROVEMENT_KIND_LABEL[improvement.kind]}_\n\n${improvement.proposedDiff.trim()}\n`
  return currentSkillMd.trimEnd() + heading
}

/** Overwrites an internally-generated skill's SKILL.md in place (output_path is DATA_DIR-relative). */
export async function writeSkillMdAtOutputPath(outputPath: string, skillMd: string): Promise<void> {
  await writeFile(path.join(resolveDataPath(outputPath), 'SKILL.md'), skillMd, 'utf8')
}

/** Overwrites a SKILL.md living outside SKILLS_OUT_DIR, at the exact path the user pointed at. */
export async function writeExternalSkillMd(absolutePath: string, skillMd: string): Promise<void> {
  await writeFile(absolutePath, skillMd, 'utf8')
}
