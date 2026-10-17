import type { ElementKind, VideoStatus, SkillImprovementKind } from './types'

export const STATUS_LABEL: Record<VideoStatus, string> = {
  pending: 'En cola',
  probing: 'Leyendo metadata...',
  queued: 'Listo para analizar',
  analyzing: 'Analizando...',
  ready: 'Analizado',
  failed: 'Fallo',
}

export const STATUS_COLOR: Record<VideoStatus, string> = {
  pending: 'var(--color-ink-soft)',
  probing: 'var(--color-warn)',
  queued: 'var(--color-ok)',
  analyzing: 'var(--color-accent)',
  ready: 'var(--color-ok)',
  failed: 'var(--color-danger)',
}

export const ELEMENT_KIND_LABEL: Record<ElementKind, string> = {
  object: 'Objeto',
  on_screen_text: 'Texto en pantalla',
  action: 'Accion',
  person: 'Persona',
  relation: 'Relacion',
}

export const IMPROVEMENT_KIND_LABEL: Record<SkillImprovementKind, string> = {
  new_step: 'Paso nuevo',
  better_method: 'Mejor metodo',
  new_tool: 'Herramienta nueva',
  pitfall: 'Error a evitar',
  missing_info: 'Informacion faltante',
  outdated: 'Desactualizado',
}
