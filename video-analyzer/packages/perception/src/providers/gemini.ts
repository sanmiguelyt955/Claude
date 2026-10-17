import { readFile } from 'node:fs/promises'
import { frameLabel, isOverloadStatus, ProviderOverloadedError, type VisionProvider, type VisionRequest } from './types.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export const gemini: VisionProvider = {
  name: 'gemini',
  available: () => Boolean(process.env.GEMINI_API_KEY),
  async describe({ frames, transcript, instruction }: VisionRequest) {
    const parts: unknown[] = []
    for (const f of frames) {
      parts.push({ text: `[t=${frameLabel(f.time)}]` })
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: (await readFile(f.path)).toString('base64') } })
    }
    parts.push({
      text: [
        transcript ? `Transcripción de la audio en este tramo:\n${transcript}` : 'Este tramo no tiene voz.',
        instruction,
      ].join('\n\n'),
    })

    const model = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_VIDEO_MODEL || 'gemini-3.7-flash'
    const res = await fetch(`${BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY || '', 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      if (isOverloadStatus(res.status)) throw new ProviderOverloadedError('gemini', res.status, body)
      throw new Error(`gemini HTTP ${res.status}: ${body.slice(0, 300)}`)
    }
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  },
}
