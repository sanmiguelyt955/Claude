/**
 * Which licences the music page accepts. Only Creative Commons licences that
 * allow commercial use (CC0, Public Domain Mark, BY) are "ok"; BY-SA is
 * allowed with a warning; anything NonCommercial / NoDerivatives or unknown
 * is refused, because the videos made with this music may be monetised.
 */
export type License = {
  /** cc0, pdm, by, by-sa, by-nc, by-nd, by-nc-sa, by-nc-nd or unknown. */
  code: string
  version: string | null
  url: string | null
  /** Can be used in a monetised video. */
  commercial: boolean
  /** The result must be shared under the same licence (BY-SA). */
  shareAlike: boolean
  /** Credit to the author is required. */
  attribution: boolean
}

export type Verdict = 'ok' | 'warn' | 'refused'

const KNOWN = ['by-nc-nd', 'by-nc-sa', 'by-nc', 'by-nd', 'by-sa', 'by'] as const

/** Reads a licence from a creativecommons.org URL, or a short code like "by-sa". */
export function parseLicense(input: string | null | undefined, version?: string | null): License {
  const raw = (input ?? '').trim().toLowerCase()
  const none: License = { code: 'unknown', version: null, url: null, commercial: false, shareAlike: false, attribution: false }
  if (!raw) return none

  let code = ''
  let ver: string | null = version ? String(version) : null
  let url: string | null = null
  const fromUrl = /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)(?:\/([0-9.]+))?/.exec(raw)
  if (fromUrl) {
    url = `https://creativecommons.org/${fromUrl[1]}/${fromUrl[2]}${fromUrl[3] ? `/${fromUrl[3]}` : ''}/`
    ver = fromUrl[3] ?? ver
    code = fromUrl[2]!
    if (fromUrl[1] === 'publicdomain') code = code === 'mark' ? 'pdm' : code === 'zero' ? 'cc0' : code
  } else {
    code = raw.replace(/^cc[-\s]?/, '').replace(/\s+/g, '-')
    if (code === 'zero' || code === '0') code = 'cc0'
    if (raw === 'pdm' || raw === 'publicdomain' || raw === 'public-domain') code = 'pdm'
  }
  if (code !== 'cc0' && code !== 'pdm' && !(KNOWN as readonly string[]).includes(code)) return none
  return {
    code,
    version: ver,
    url,
    commercial: code === 'cc0' || code === 'pdm' || code === 'by' || code === 'by-sa',
    shareAlike: code === 'by-sa',
    attribution: code !== 'cc0' && code !== 'pdm',
  }
}

export function verdict(license: License): Verdict {
  if (!license.commercial) return 'refused'
  return license.shareAlike ? 'warn' : 'ok'
}

export function licenseLabel(license: License): string {
  if (license.code === 'unknown') return 'Licencia desconocida'
  if (license.code === 'cc0') return 'CC0 (dominio público)'
  if (license.code === 'pdm') return 'Dominio público'
  return `CC ${license.code.toUpperCase()}${license.version ? ` ${license.version}` : ''}`
}

/** The text to paste in a video description. Empty when no credit is required. */
export function creditText(t: { title: string; artist: string; pageUrl?: string | null; license: License }): string {
  if (!t.license.attribution) return ''
  const where = t.pageUrl ? ` (${t.pageUrl})` : ''
  const lic = t.license.url ? `${licenseLabel(t.license)}, ${t.license.url}` : licenseLabel(t.license)
  return `"${t.title}" ${t.artist}${where}. Licencia: ${lic}`
}
