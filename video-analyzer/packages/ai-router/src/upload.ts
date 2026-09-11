import { getGeminiClient } from './client.js'

const POLL_INTERVAL_MS = 3000
const MAX_WAIT_MS = 10 * 60 * 1000 // 10 min: generous for a large video

/**
 * Uploads a local file via the Files API and waits until Gemini finishes
 * processing it (state PROCESSING -> ACTIVE). A video part referencing a
 * file still in PROCESSING is rejected by generateContent/interactions, so
 * this wait is not optional.
 */
export async function uploadAndWaitActive(
  filePath: string,
  mimeType: string,
): Promise<{ uri: string; mimeType: string }> {
  const ai = getGeminiClient()
  let file = await ai.files.upload({ file: filePath, config: { mimeType } })

  const deadline = Date.now() + MAX_WAIT_MS
  while (file.state === 'PROCESSING') {
    if (Date.now() > deadline) {
      throw new Error('Gemini tardo demasiado en procesar el archivo subido (mas de 10 minutos).')
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    if (!file.name) throw new Error('El archivo subido no tiene nombre para consultar su estado.')
    file = await ai.files.get({ name: file.name })
  }

  if (file.state === 'FAILED') {
    throw new Error(`Gemini no pudo procesar el archivo subido: ${file.error?.message ?? 'motivo desconocido'}.`)
  }
  if (!file.uri || !file.mimeType) {
    throw new Error('El archivo subido a Gemini no tiene URI o mimeType.')
  }

  return { uri: file.uri, mimeType: file.mimeType }
}
