import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { GeminiError } from './lib/errors.js'
import { mimeFromName } from './lib/mime.js'
import { generate, uploadVideo } from './lib/gemini.js'
import { ANALYSIS_PROMPT, ANALYSIS_SCHEMA } from './lib/analysis.js'

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '127.0.0.1'
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash'
const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 2048) * 1024 * 1024
const MAX_MESSAGE_CHARS = 4000

const here = path.dirname(fileURLToPath(import.meta.url))
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
}

// Los videos viven en memoria: el archivo queda en Gemini (48 h) y aquí solo guardamos
// su referencia, el análisis y la conversación. Si se reinicia el servidor, se pierden.
const videos = new Map()

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function publicVideo(video) {
  return {
    id: video.id,
    name: video.name,
    mimeType: video.mimeType,
    analysis: video.analysis ?? null,
    chat: video.chat,
  }
}

function requireVideo(id) {
  const video = videos.get(id)
  if (!video) throw new GeminiError(404, 'No encuentro ese video. Puede que el servidor se haya reiniciado.')
  return video
}

async function readJson(req) {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 64 * 1024) throw new GeminiError(413, 'La petición es demasiado grande.')
  }
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    throw new GeminiError(400, 'El cuerpo de la petición no es JSON válido.')
  }
}

function apiKey() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new GeminiError(500, 'Falta GEMINI_API_KEY. Ponla en el archivo .env.')
  return key
}

async function handleUpload(req, res, url) {
  const size = Number(req.headers['content-length'])
  if (!size) throw new GeminiError(411, 'Falta el tamaño del archivo (Content-Length).')
  if (size > MAX_BYTES) throw new GeminiError(413, `El video supera el límite de ${MAX_BYTES / 1024 / 1024} MB.`)

  const name = url.searchParams.get('name') || 'video'
  const mimeType = mimeFromName(name, req.headers['content-type'])
  const file = await uploadVideo({
    apiKey: apiKey(),
    body: Readable.toWeb(req),
    size,
    mimeType,
    displayName: name,
  })

  const video = { id: randomUUID(), name, mimeType: file.mimeType ?? mimeType, uri: file.uri, analysis: null, turns: [], chat: [] }
  videos.set(video.id, video)
  sendJson(res, 201, publicVideo(video))
}

async function handleAnalyze(res, video) {
  const turns = [{ role: 'user', text: ANALYSIS_PROMPT }]
  const analysis = await generate({ apiKey: apiKey(), model: MODEL, video, turns, schema: ANALYSIS_SCHEMA })
  // El análisis queda en el historial para que el chat sepa de qué se habló.
  video.turns = [...turns, { role: 'model', text: JSON.stringify(analysis) }]
  video.analysis = analysis
  video.chat = []
  sendJson(res, 200, publicVideo(video))
}

async function handleChat(req, res, video) {
  if (!video.analysis) throw new GeminiError(409, 'Analiza el video antes de hacer preguntas.')
  const { message } = await readJson(req)
  if (typeof message !== 'string' || !message.trim()) throw new GeminiError(400, 'Escribe una pregunta.')
  if (message.length > MAX_MESSAGE_CHARS) throw new GeminiError(400, 'La pregunta es demasiado larga.')

  const turns = [...video.turns, { role: 'user', text: message.trim() }]
  const reply = await generate({ apiKey: apiKey(), model: MODEL, video, turns })
  video.turns = [...turns, { role: 'model', text: reply }]
  video.chat.push({ role: 'user', text: message.trim() }, { role: 'model', text: reply })
  sendJson(res, 200, { reply, chat: video.chat })
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean) // ['api', 'videos', id, action]
  const [, resource, id, action] = parts

  if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true, model: MODEL })
  if (resource !== 'videos') throw new GeminiError(404, 'Ruta no encontrada.')

  if (!id) {
    if (req.method === 'POST') return handleUpload(req, res, url)
    if (req.method === 'GET') return sendJson(res, 200, [...videos.values()].map(publicVideo))
  }

  if (id && !action && req.method === 'GET') return sendJson(res, 200, publicVideo(requireVideo(id)))
  if (id && action === 'analyze' && req.method === 'POST') return handleAnalyze(res, requireVideo(id))
  if (id && action === 'chat' && req.method === 'POST') return handleChat(req, res, requireVideo(id))

  throw new GeminiError(404, 'Ruta no encontrada.')
}

async function handleStatic(res, pathname) {
  const entry = STATIC_FILES[pathname]
  if (!entry) return sendJson(res, 404, { error: 'No encontrado.' })
  const [file, contentType] = entry
  const body = await readFile(path.join(here, 'public', file))
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url)
    else await handleStatic(res, url.pathname)
  } catch (error) {
    if (!(error instanceof GeminiError)) console.error(error)
    if (res.headersSent) return res.end()
    sendJson(res, error.status ?? 500, { error: error instanceof GeminiError ? error.message : 'Error interno del servidor.' })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Video Gemini en http://${HOST}:${PORT} (modelo: ${MODEL})`)
})
