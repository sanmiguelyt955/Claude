import { NextResponse } from 'next/server'
import { getQuotaWindowCounts, nextQuotaResetDate, getModelDailyLimits } from '@cva/memory-engine'

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
  const learned = getModelDailyLimits()
  const perModel = models().map((model) => {
    const used = getQuotaWindowCounts(undefined, model).requestsToday
    const limit = learned[model] ?? MAX_RPD
    return {
      model,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      // true only once Google itself reported this model's cap in a 429.
      limitConfirmed: learned[model] !== undefined,
    }
  })

  return NextResponse.json({
    perModel,
    totalRemaining: perModel.reduce((sum, m) => sum + m.remaining, 0),
    totalLimit: perModel.reduce((sum, m) => sum + m.limit, 0),
    confirmedModels: perModel.filter((m) => m.limitConfirmed).length,
    resetsAt: nextQuotaResetDate().toISOString(),
  })
}
