import type { ElementKind, VideoStatus, SkillImprovementKind, SemanticSearchResult } from './types'

export const STATUS_LABEL: Record<VideoStatus, string> = {
  pending: 'En cola',
  probing: 'Leyendo el video…',
  queued: 'Listo para analizar',
  analyzing: 'Analizando…',
  ready: 'Analizado',
  failed: 'Falló',
}

export const STATUS_COLOR: Record<VideoStatus, string> = {
  pending: 'var(--color-ink-soft)',
  probing: 'var(--color-warn)',
  queued: 'var(--color-ok)',
  analyzing: 'var(--color-accent)',
  ready: 'var(--color-ok)',
  failed: 'var(--color-danger)',
}

/** What a search hit is, in both searches (the video's own listed "transcript", "scene"). */
export const SEARCH_SOURCE_LABEL: Record<SemanticSearchResult['source'], string> = {
  summary: 'Resumen',
  scene: 'Escena',
  transcript: 'Transcripción',
  element: 'Objeto/texto',
  skill: 'Skill',
}

export const ELEMENT_KIND_LABEL: Record<ElementKind, string> = {
  object: 'Objeto',
  on_screen_text: 'Texto en pantalla',
  action: 'Acción',
  person: 'Persona',
  relation: 'Relación',
}

export const IMPROVEMENT_KIND_LABEL: Record<SkillImprovementKind, string> = {
  new_step: 'Paso nuevo',
  better_method: 'Mejor método',
  new_tool: 'Herramienta nueva',
  pitfall: 'Error a evitar',
  missing_info: 'Información faltante',
  outdated: 'Desactualizado',
}

/**
 * What went wrong, for a person rather than a developer. The raw message
 * (often several providers' English errors joined together) stays one click
 * away under "Ver el detalle técnico".
 */
export function friendlyError(message: string | null): string {
  const raw = message ?? ''
  if (/cuota del día|PerDay|daily/i.test(raw)) {
    return 'Se acabó la cuota gratuita de Gemini de hoy. Se renueva a medianoche (hora de California); entonces puedes reintentar.'
  }
  if (/no tiene clave|API key|ANTHROPIC_API_KEY|GEMINI_API_KEY|401|403|PERMISSION_DENIED/i.test(raw)) {
    return 'La clave de IA falta o no es válida. Revísala en la configuración (Archivo → Configuración, o el archivo .env.local) y reintenta.'
  }
  if (/\b(429|503|529|overloaded|saturad|UNAVAILABLE|RESOURCE_EXHAUSTED)\b/i.test(raw)) {
    return 'Los servidores de IA estaban saturados y no respondieron a tiempo. Suele pasar un rato; reintenta en unos minutos.'
  }
  if (/transcribir|FFmpeg|ffprobe|audio/i.test(raw) && !/proveedor/i.test(raw)) {
    return 'No se pudo leer el audio o el video del archivo. Puede estar dañado o en un formato raro: prueba a convertirlo a MP4.'
  }
  if (/ECONN|ETIMEDOUT|fetch failed|ENOTFOUND|network/i.test(raw)) {
    return 'Se cortó la conexión a internet mientras se analizaba. Revisa la conexión y reintenta.'
  }
  if (/descarg|yt-dlp|download/i.test(raw)) {
    return 'No se pudo descargar el video desde su enlace. Revisa que la publicación sea pública (o configura las cookies del navegador, ver COMO-USAR.md).'
  }
  // A short message the app itself wrote in Spanish is already readable.
  if (raw && raw.length <= 200 && /[áéíóúñ¿]|^(El|La|No|Ya|Se|Este|Esta) /.test(raw) && !/Error:|at \w|\{/.test(raw)) return raw
  return 'Ocurrió un error inesperado. Puedes reintentar; si vuelve a pasar, el detalle técnico de abajo ayuda a encontrar la causa.'
}
