import { GoogleGenAI } from '@google/genai'

let cached: GoogleGenAI | undefined

/**
 * Single shared client, built lazily so importing this package never throws
 * before GEMINI_API_KEY is actually needed (e.g. type-checking, or worker
 * job types that don't touch Gemini).
 */
export function getGeminiClient(): GoogleGenAI {
  if (cached) return cached
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      'Falta GEMINI_API_KEY. Copia .env.example a .env.local y agrega tu clave de https://aistudio.google.com/apikey.',
    )
  }
  // GEMINI_BASE_URL points at a local stand-in (tests), as in @cva/perception:
  // without it skills, embeddings and batches still went to Google.
  const baseUrl = process.env.GEMINI_BASE_URL?.trim()
  cached = new GoogleGenAI({ apiKey, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) })
  return cached
}
