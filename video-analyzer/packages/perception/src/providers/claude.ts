import { readFile } from 'node:fs/promises'
import { BadReplyError, frameLabel, postJson, speechPreamble, type VisionProvider, type VisionRequest } from './types.js'

// Claude does not process audio: it sees the frames, and the speech arrives as
// text from the transcription stage. Frames are interleaved with their time
// label so the model can cite timestamps.

/** Claude accepts at most 100 images per request. */
export const CLAUDE_MAX_IMAGES = 100

/** At most `max` frames, spread evenly over the window and keeping its first and last. */
export function evenlySpaced<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  return Array.from({ length: max }, (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]!)
}

export const claude: VisionProvider = {
  name: 'claude',
  available: () => Boolean(process.env.ANTHROPIC_API_KEY),
  // Claude does not hear the audio and sees at most 100 frames: with a Gemini
  // key it only stands in when Gemini is down, never while Gemini merely
  // paces itself (it took half the windows that way).
  fallbackOnly: true,
  async describe({ frames, transcript, instruction }: VisionRequest) {
    const content: unknown[] = []
    // Windows are sized for Gemini (300 frames); as the fallback, Claude
    // sees an even sample of them instead of failing the request.
    for (const f of evenlySpaced(frames, CLAUDE_MAX_IMAGES)) {
      content.push({ type: 'text', text: `[t=${frameLabel(f.time)}]` })
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: (await readFile(f.path)).toString('base64') },
      })
    }
    content.push({
      type: 'text',
      text: [...speechPreamble(transcript), instruction].join('\n\n'),
    })

    const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
    const data = (await postJson(
      'claude',
      `${base}/v1/messages`,
      { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
      {
        model: process.env.CLAUDE_VISION_MODEL || 'claude-sonnet-5-5',
        // A window's per-second timeline outgrew 16,000 tokens.
        max_tokens: 32000,
        messages: [{ role: 'user', content }],
      },
    )) as { content: Array<{ type: string; text?: string }>; stop_reason?: string }
    if (data.stop_reason === 'max_tokens') throw new BadReplyError('claude: respuesta cortada por el límite de longitud (max_tokens)')
    return data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  },
}
