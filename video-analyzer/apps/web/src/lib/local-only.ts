// The app runs on this computer only (the launcher and the desktop app bind
// 127.0.0.1). Without these checks any web page open in the browser could
// POST to it, starting analyses or writing skills, and a DNS-rebinding page
// could read the videos.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

/** Why the request must be refused, or null when it comes from the app itself. */
export function localOnlyRefusal({ headers, method, url }: Pick<Request, 'headers' | 'method' | 'url'>): string | null {
  const host = headers.get('host') ?? new URL(url).host
  if (!LOCAL_HOST.test(host)) return 'Video Analyzer solo responde en esta computadora (localhost).'
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = headers.get('origin')
    let sameOrigin = origin === null
    try {
      sameOrigin ||= new URL(origin!).host === host
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) return 'Petición rechazada: no viene de la propia app.'
  }
  return null
}
