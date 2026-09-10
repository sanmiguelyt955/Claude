import { NextResponse } from 'next/server'
import { listVideos } from '@cva/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Backs the polling list in the ingestion UI. Simple polling rather than SSE
 * (PROJECT.md §27 leaves this as Claude Code's call) — one video library for
 * one local user does not need a push channel, and polling has no server
 * state to leak between requests.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ videos: listVideos() })
}
