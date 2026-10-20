import { NextResponse, type NextRequest } from 'next/server'

// The app runs on this computer only (the launcher and the desktop app bind
// 127.0.0.1). Without these checks any web page open in the browser could
// POST to it, starting analyses or writing skills, and a DNS-rebinding page
// could read the videos.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? ''
  if (!LOCAL_HOST.test(host)) {
    return new NextResponse('Video Analyzer solo responde en esta computadora (localhost).', { status: 403 })
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin')
    let sameOrigin = origin === null
    try {
      sameOrigin ||= new URL(origin!).host === host
    } catch {
      sameOrigin = false
    }
    if (!sameOrigin) return new NextResponse('Petición rechazada: no viene de la propia app.', { status: 403 })
  }
  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
