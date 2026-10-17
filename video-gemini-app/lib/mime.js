import { GeminiError } from './errors.js'

// Formatos que la API de Gemini acepta para video y audio.
// Un .mkv no está en la lista: se rechaza con un mensaje claro en vez de fallar en Gemini.
const BY_EXTENSION = {
  mp4: 'video/mp4',
  mov: 'video/mov',
  mpeg: 'video/mpeg',
  mpg: 'video/mpg',
  avi: 'video/avi',
  wmv: 'video/wmv',
  webm: 'video/webm',
  flv: 'video/x-flv',
  '3gp': 'video/3gpp',
  mp3: 'audio/mp3',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
}

// La extensión manda: el tipo que declara el navegador (p. ej. video/x-matroska) puede
// ser un formato que Gemini no acepta. El tipo declarado solo se usa si la extensión es desconocida.
export function mimeFromName(name, declaredType = '') {
  const extension = name.split('.').pop().toLowerCase()
  const mimeType = BY_EXTENSION[extension]
  if (mimeType) return mimeType

  if (/^(video|audio)\//.test(declaredType) && extension !== 'mkv') return declaredType

  throw new GeminiError(
    415,
    `Formato no compatible (.${extension}). Gemini acepta mp4, mov, mpeg, avi, wmv, webm, flv o 3gp; convierte el archivo a mp4.`,
  )
}
