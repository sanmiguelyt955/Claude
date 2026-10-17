import { GeminiError } from './errors.js'

// Cliente mínimo de la API de Gemini, sin dependencias.
// 1) Sube el video con la Files API (protocolo reanudable) y espera a que quede ACTIVE.
// 2) Lo envía a generateContent junto con el texto: el modelo recibe imagen y audio.

const API = 'https://generativelanguage.googleapis.com'

async function failure(res, action) {
  const text = await res.text().catch(() => '')
  let detail = text
  try {
    detail = JSON.parse(text).error?.message ?? text
  } catch {
    // La respuesta no es JSON; se usa el texto tal cual.
  }
  const status = res.status >= 500 ? 502 : res.status
  return new GeminiError(status, `Gemini no pudo ${action} (${res.status}): ${detail || res.statusText}`)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitUntilActive({ apiKey, file, fetchImpl, pollMs, timeoutMs }) {
  const deadline = Date.now() + timeoutMs
  let current = file
  while (current.state === 'PROCESSING') {
    if (Date.now() > deadline) throw new GeminiError(504, 'Gemini tardó demasiado en procesar el video.')
    await sleep(pollMs)
    const res = await fetchImpl(`${API}/v1beta/${current.name}`, { headers: { 'x-goog-api-key': apiKey } })
    if (!res.ok) throw await failure(res, 'consultar el estado del video')
    current = await res.json()
  }
  if (current.state !== 'ACTIVE') {
    throw new GeminiError(422, `Gemini no pudo procesar el video (estado: ${current.state ?? 'desconocido'}).`)
  }
  return current
}

/**
 * Sube un video a la Files API. `body` es un stream con `size` bytes.
 * Devuelve el objeto file de Gemini (name, uri, mimeType, state).
 */
export async function uploadVideo({
  apiKey,
  body,
  size,
  mimeType,
  displayName,
  fetchImpl = fetch,
  pollMs = 3000,
  timeoutMs = 10 * 60_000,
}) {
  const start = await fetchImpl(`${API}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  })
  if (!start.ok) throw await failure(start, 'iniciar la subida')

  const uploadUrl = start.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new GeminiError(502, 'Gemini no devolvió una URL de subida.')

  const upload = await fetchImpl(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body,
    duplex: 'half',
  })
  if (!upload.ok) throw await failure(upload, 'recibir el video')

  const { file } = await upload.json()
  return waitUntilActive({ apiKey, file, fetchImpl, pollMs, timeoutMs })
}

/**
 * Llama a generateContent. `turns` es una lista de { role, text} que termina en
 * un turno 'user'. El video se adjunta solo al primer turno, como pide la API.
 * Con `schema` la respuesta se devuelve ya parseada como JSON.
 */
export async function generate({ apiKey, model, video, turns, schema = null, fetchImpl = fetch }) {
  const contents = turns.map((turn, index) => ({
    role: turn.role,
    parts: [
      ...(index === 0 ? [{ file_data: { mime_type: video.mimeType, file_uri: video.uri } }] : []),
      { text: turn.text },
    ],
  }))

  const generationConfig = {
    temperature: schema ? 0.2 : 0.4,
    maxOutputTokens: 65536,
    ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
  }

  const res = await fetchImpl(`${API}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig }),
  })
  if (!res.ok) throw await failure(res, 'generar la respuesta')

  const data = await res.json()
  const candidate = data.candidates?.[0]
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? '').join('')
  if (!text) {
    throw new GeminiError(502, `Gemini devolvió una respuesta vacía (motivo: ${candidate?.finishReason ?? 'desconocido'}).`)
  }
  if (!schema) return text

  try {
    return JSON.parse(text)
  } catch {
    throw new GeminiError(502, 'Gemini devolvió un análisis que no es JSON válido. Vuelve a intentarlo.')
  }
}
