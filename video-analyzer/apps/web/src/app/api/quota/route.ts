import { NextResponse } from 'next/server'
import { getQuotaWindowCounts, nextQuotaResetDate } from '@cva/memory-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_RPD = Number(process.env.GEMINI_MAX_RPD ?? 20)

function models(): string[] {
  return (process.env.GEMINI_VIDEO_MODELS ?? process.env.GEMINI_VIDEO_MODEL ?? 'gemini-3.7-flash')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
}

/**
 * Remaining daily capacity, per model. Google's cap is per model, so the
 * useful number is not "20 left" but the sum across every configured model.
 */
export async function GET(): Promise<NextResponse> {
  const perModel = models().map((model) => {
    const used = getQuotaWindowCounts(undefined, model).requestsToday
    return { model, used, limit: MAX_RPD, remaining: Math.max(0, MAX_RPD - used) }
  })

  return NextResponse.json({
    perModel,
    totalRemaining: perModel.reduce((sum, m) => sum + m.remaining, 0),
    totalLimit: perModel.length * MAX_RPD,
    resetsAt: nextQuotaResetDate().toISOString(),
  })
}
