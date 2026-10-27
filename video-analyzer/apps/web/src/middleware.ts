import { NextResponse, type NextRequest } from 'next/server'
import { localOnlyRefusal } from './lib/local-only'

export function middleware(req: NextRequest) {
  const refusal = localOnlyRefusal(req)
  return refusal ? new NextResponse(refusal, { status: 403 }) : NextResponse.next()
}

// The upload route checks the same rules itself: Next hands middleware only
// the first 10 MB of a body, so a video posted through it arrived cut off
// ("Unexpected end of form").
export const config = { matcher: '/api/((?!videos/upload$).*)' }
