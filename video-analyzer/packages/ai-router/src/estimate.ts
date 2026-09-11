/**
 * Rough pre-flight estimate for logging/warnings — PROJECT.md §16's own
 * benchmark figures (Google-reported, not a guarantee for any given video):
 * ~100 tokens/sec at low resolution up to ~300 tokens/sec at high, and
 * agentic processing cuts that by up to 88%. Never used to gate a call —
 * only to warn before spending one of the account's 20 daily requests on a
 * video that is likely to blow the per-minute token budget.
 */
export function estimateVideoTokens(
  durationSeconds: number,
  processing: 'STATIC' | 'AGENTIC',
): { low: number; high: number } {
  const low = durationSeconds * 100
  const high = durationSeconds * 300
  const factor = processing === 'AGENTIC' ? 0.12 : 1 // up to 88% reduction
  return { low: Math.round(low * factor), high: Math.round(high * factor) }
}
