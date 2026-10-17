import { readFile } from 'node:fs/promises'
import { frameLabel, postJson, type VisionProvider, type VisionRequest } from './types.js'

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
        transcript ? `Transcripción del audio en este tramo:\n${transcript}` : 'Este tramo no tiene voz.',
        instruction,
      ].join('\n\n'),
    })

    const model = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_VIDEO_MODEL || 'gemini-3.7-flash'
    const data = (await postJson(
      'gemini',
      `${BASE}/models/${model}:generateContent`,
      { 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
      {
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      },
    )) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  },
}
