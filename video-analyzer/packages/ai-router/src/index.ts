export { getGeminiClient } from './client.js'
export { analyzeVideo } from './analyze-video.js'
export type { AnalyzeVideoInput, AnalyzeVideoOutput, ProgressUpdate, RequestEvent, WindowState } from './analyze-video.js'
export { WindowedAnalysisError } from './analyze-video.js'
export { estimateVideoTokens } from './estimate.js'
export { embedTexts } from './embed.js'
export type { EmbedTaskType, EmbeddedText } from './embed.js'
export { estimateCostUsd } from './cost.js'
export { QuotaExceededError } from './errors.js'
export { ANALYSIS_PROMPT, ANALYSIS_JSON_SCHEMA, buildAnalysisPrompt, buildWindowAnalysisPrompt } from './schema.js'
export type { AnalysisResult } from './schema.js'
export type { ProcessingMode, TokenUsage, VideoSource } from './types.js'
export { detectSkillCandidates, generateSkillContent, proposeSkillImprovements } from './skills.js'
export { isQuotaExhaustedError, parseQuotaLimit } from './analyze-video.js'
export { analyzeVideosBatch } from './analyze-batch.js'
export type { BatchItem, BatchAnalysisOutput } from './analyze-batch.js'
export type { SkillCandidate, GeneratedSkillContent, ProposedSkillImprovement } from './skills.js'

/**
 * Reasoning engine for Skill detection/generation/improvement (PROJECT.md
 * §12-13, §15): Gemini in the MVP, isolated behind this interface so it can
 * be swapped for @anthropic-ai/sdk later without touching skill-engine.
 * Implemented in bloque 6.
 */
export interface SkillEngineProvider {
  readonly model: string
  complete(prompt: string, schema?: unknown): Promise<{ text: string; usage: import('./types.js').TokenUsage }>
}
export {
  PROTOCOL_VERSION,
  V6_PHASE1_SCHEMA,
  V6_PHASE3_SCHEMA,
  getProtocolText,
  mmss,
  renderV6Record,
} from './protocol-v6.js'
export type { V6Phase1, V6Phase3, VideoMeta } from './protocol-v6.js'
