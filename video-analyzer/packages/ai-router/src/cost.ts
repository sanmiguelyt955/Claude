import type { TokenUsage } from './types.js'

/**
 * Gemini 3 Flash family promo pricing per PROJECT.md §16 (USD per token —
 * the published rates are per million). These rates are explicitly called
 * out as doubling on 2027-01-01; estimated_cost_usd is stored per-run
 * precisely so a rate change never rewrites history.
 */
const INPUT_PER_TOKEN = 0.75 / 1_000_000
const OUTPUT_PER_TOKEN = 3.75 / 1_000_000
const CACHED_INPUT_PER_TOKEN = 0.075 / 1_000_000

export function estimateCostUsd(usage: Omit<TokenUsage, 'estimatedCostUsd'>): number {
  const billableInput = Math.max(0, usage.inputTokens - usage.cachedTokens)
  return (
    billableInput * INPUT_PER_TOKEN +
    usage.cachedTokens * CACHED_INPUT_PER_TOKEN +
    usage.outputTokens * OUTPUT_PER_TOKEN
  )
}
