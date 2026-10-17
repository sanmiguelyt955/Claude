// Lo que se le pide a Gemini sobre el video: qué se ve, qué se dice y qué se escucha,
// con marcas de tiempo en segundos para poder ubicar cada cosa en el video.

const seconds = { type: 'NUMBER' }
const text = { type: 'STRING' }

export const ANALYSIS_PROMPT = `Analiza este video completo, con su audio.
- Describe lo que se ve en cada escena, con marcas de tiempo en segundos.
- Transcribe todo lo que se dice, con el tiempo de inicio y fin de cada frase.
  Indica el hablante cuando puedas distinguirlo (Hablante 1, Hablante 2...).
- Anota el texto que aparece en pantalla.
- Describe la música, los efectos de sonido y el tono de la voz.
Responde solo con el JSON pedido, en el idioma original del video.`

export const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: text,
    duration_seconds: seconds,
    language: text,
    scenes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { start: seconds, end: seconds, visual: text, on_screen_text: text },
        required: ['start', 'end', 'visual'],
      },
    },
    transcript: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { start: seconds, end: seconds, speaker: text, text },
        required: ['start', 'end', 'text'],
      },
    },
    audio: {
      type: 'OBJECT',
      properties: { music: text, sound_effects: text, voice_tone: text },
    },
  },
  required: ['summary', 'scenes', 'transcript', 'audio'],
}
