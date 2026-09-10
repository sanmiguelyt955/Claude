/**
 * Gemini client, token estimation, quota limiter and 429 backoff.
 * Implemented in bloque 3.
 *
 * `SkillEngineProvider` is the seam PROJECT.md §15 asks for: the MVP binds it
 * to Gemini, and swapping in @anthropic-ai/sdk later touches only this file.
 */

export type ProcessingMode = 'STATIC' | 'AGENTIC'

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  thoughtTokens: number
  estimatedCostUsd: number
}

export type VideoAnalysisRequest = {
  filePath?: string
  youtubeUrl?: string
  startSeconds?: number
  endSeconds?: number
  processing: ProcessingMode
  prompt: string
}

export interface VideoUnderstandingProvider {
  readonly model: string
  /** Pre-flight estimate, so the app can warn before burning daily quota. */
  estimateTokens(durationSeconds: number, processing: ProcessingMode): number
  analyze(request: VideoAnalysisRequest): Promise<{ text: string; usage: TokenUsage }>
}

export interface EmbeddingProvider {
  readonly model: string
  readonly dimensions: number
  embed(texts: string[], kind: 'document' | 'query'): Promise<Float32Array[]>
}

export interface SkillEngineProvider {
  readonly model: string
  complete(prompt: string, schema?: unknown): Promise<{ text: string; usage: TokenUsage }>
}
