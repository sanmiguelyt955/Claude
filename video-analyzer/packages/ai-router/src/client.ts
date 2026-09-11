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
  cached = new GoogleGenAI({ apiKey })
  return cached
}
