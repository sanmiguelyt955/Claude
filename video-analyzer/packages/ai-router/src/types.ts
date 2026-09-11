export type ProcessingMode = 'STATIC' | 'AGENTIC'

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  thoughtTokens: number
  estimatedCostUsd: number
}

export type VideoSource =
  | { kind: 'file'; path: string; mimeType: string }
  | { kind: 'youtube'; url: string }
