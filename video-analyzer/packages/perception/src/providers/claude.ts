import { readFile } from 'node:fs/promises'
import { frameLabel, isOverloadStatus, ProviderOverloadedError, type VisionProvider, type VisionRequest } from './types.js'

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
    const text = [
      transcript ? `Transcripción de la audio en este tramo (lo que se escucha):\n${transcript}` : 'Este tramo no tiene voz.',
      instruction,
    ].join('\n\n')
    content.push({ type: 'text', text })

    const base = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_VISION_MODEL || 'claude-sonnet-5-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content }],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      if (isOverloadStatus(res.status) || res.status === 529) throw new ProviderOverloadedError('claude', res.status, body)
      throw new Error(`claude HTTP ${res.status}: ${body.slice(0, 300)}`)
    }
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> }
    return data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  },
}
