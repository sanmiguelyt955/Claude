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
