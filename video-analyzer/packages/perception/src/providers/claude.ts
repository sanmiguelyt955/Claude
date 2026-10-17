import { readFile } from 'node:fs/promises'
import { frameLabel, postJson, type VisionProvider, type VisionRequest } from './types.js'

// Claude does not process audio: it sees the frames, and the speech arrives as
// text from the transcription stage. Frames are interleaved with their time
// label so the model can cite timestamps.
export const claude: VisionProvider = {
  name: 'claude',
  available: () => Boolean(process.env.ANTHROPIC_API_KEY),
  async describe({ frames, transcript, instruction }: VisionRequest) {
    const content: unknown[] = []
    for (const f of frames) {
      content.push({ type: 'text', text: `[t=${frameLabel(f.time)}]` })
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: (await readFile(f.path)).toString('base64') },
      })
    }
    content.push({
      type: 'text',
      text: [
        transcript ? `Transcripción del audio en este tramo (lo que se escucha):\n${transcript}` : 'Este tramo no tiene voz.',
        instruction,
      ].join('\n\n'),
    })

    const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
    const data = (await postJson(
      'claude',
      `${base}/v1/messages`,
      { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
      {
        model: process.env.CLAUDE_VISION_MODEL || 'claude-sonnet-5-5',
        max_tokens: 16000,
        messages: [{ role: 'user', content }],
      },
    )) as { content: Array<{ type: string; text?: string }> }
    return data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  },
}
