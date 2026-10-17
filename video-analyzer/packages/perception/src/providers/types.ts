import type { Frame } from '../frames.js'

export type VisionRequest = {
  /** Frames to look at, in time order. May be empty for text-only calls. */
  frames: Frame[]
  /** Speech in the same time range, already transcribed. */
  transcript: string
  /** Full instruction; the reply must be JSON. */
  instruction: string
}

export interface VisionProvider {
  readonly name: string
  /** False when the provider has no key/config; the chain skips it silently. */
  available(): boolean
  describe(req: VisionRequest): Promise<string>
}

/** Saturation or quota: the chain should move on to the next provider. */
export class ProviderOverloadedError extends Error {
  constructor(provider: string, status: number | string, detail: string) {
    super(`${provider} saturado (${status}): ${detail.slice(0, 200)}`)
    this.name = 'ProviderOverloadedError'
  }
}

export const isOverloadStatus = (status: number) => status === 429 || status === 503 || status === 529

export function frameLabel(time: number): string {
  const m = Math.floor(time / 60)
  const s = (time % 60).toFixed(2).padStart(5, '0')
  return `${m}:${s}`
}
