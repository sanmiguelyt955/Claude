/**
 * Shape of one complete video analysis (PROJECT.md §8: resumen, timeline,
 * transcripcion, objetos, texto en pantalla, acciones — all in one call).
 * Mirrors the memory-engine tables it gets written into 1:1 (video_summaries,
 * scenes, transcript_chunks, video_elements) so persisting it is a straight
 * mapping, not a translation.
 */
export type AnalysisResult = {
  summary: {
    short_summary: string
    full_summary: string
    topics: string[]
    language: string
  }
  scenes: Array<{
    index: number
    start_seconds: number
    end_seconds: number
    title: string
    description: string
    audio_description: string | null
  }>
  transcript: Array<{
    index: number
    start_seconds: number
    end_seconds: number
    speaker: string | null
    text: string
    language: string | null
  }>
  elements: Array<{
    kind: 'object' | 'on_screen_text' | 'action' | 'person' | 'relation'
    label: string
    detail: string | null
    start_seconds: number
    end_seconds: number | null
  }>
}

/**
 * JSON Schema handed to Gemini via response_format (Interactions API) /
 * responseSchema (generateContent) so the reply is parseable JSON instead of
 * prose we'd have to scrape. Kept flat and non-strict on required fields
 * beyond the essentials — models comply better with a schema that mirrors
 * how the data naturally comes out (some scenes genuinely have no audio).
 */
export const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'object',
      properties: {
        short_summary: { type: 'string', description: '1-2 sentences, for a library card.' },
        full_summary: { type: 'string' },
        topics: { type: 'array', items: { type: 'string' } },
        language: { type: 'string', description: 'BCP-47 code of the spoken audio, e.g. es-MX.' },
      },
      required: ['short_summary', 'full_summary', 'topics', 'language'],
    },
    scenes: {
      type: 'array',
      description:
        'Tiles the whole video end to end with no gaps, ordered by start_seconds. Slice finely: a new scene on every meaningful change, not a sparse summary.',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          start_seconds: { type: 'number' },
          end_seconds: { type: 'number' },
          title: { type: 'string' },
          description: { type: 'string' },
          audio_description: { type: ['string', 'null'] },
        },
        required: ['index', 'start_seconds', 'end_seconds', 'title', 'description'],
      },
    },
    transcript: {
      type: 'array',
      description:
        'Complete verbatim transcript, contiguous with no gaps while speech is present, one entry per sentence/phrase in order. Empty array only if there is no speech at all.',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          start_seconds: { type: 'number' },
          end_seconds: { type: 'number' },
          speaker: { type: ['string', 'null'] },
          text: { type: 'string' },
          language: { type: ['string', 'null'] },
        },
        required: ['index', 'start_seconds', 'end_seconds', 'text'],
      },
    },
    elements: {
      type: 'array',
      description:
        'Notable objects, on-screen text (OCR), actions, people and relations between them, each with its own timestamp.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['object', 'on_screen_text', 'action', 'person', 'relation'] },
          label: { type: 'string' },
          detail: { type: ['string', 'null'] },
          start_seconds: { type: 'number' },
          end_seconds: { type: ['number', 'null'] },
        },
        required: ['kind', 'label', 'start_seconds'],
      },
    },
  },
  required: ['summary', 'scenes', 'transcript', 'elements'],
} as const

export const ANALYSIS_PROMPT = `You are a meticulous video analyst producing an exhaustive, gapless record of this video — not a highlight reel. Someone will rely on this JSON as the only account of what happens, without ever watching the video themselves. Anything you skip or summarize away is permanently lost to them. Watch the entire video (video and audio together — treat them as one synchronized source, never analyze the picture without the sound or vice versa) and produce ONE JSON object matching the given schema, covering the whole duration from second 0 to the very end.

TRANSCRIPT — completeness is mandatory, not best-effort:
- Transcribe EVERY word spoken, from the first sound to the last, verbatim (not paraphrased, not summarized).
- Consecutive entries must be contiguous: one entry's end_seconds should meet the next entry's start_seconds, with no unexplained multi-second jumps while someone is talking. A gap is only correct where the video is genuinely silent for that stretch.
- Split into entries by natural sentence/phrase boundaries — do not merge two minutes of continuous speech into one entry, and do not invent pauses that were not there.
- "transcript" is empty ([]) only if the video truly has no speech anywhere.

SCENES — tile the whole video with no gaps, and slice finely:
- Consecutive scenes: each end_seconds equals the next scene's start_seconds, covering 0 to the end.
- Start a new scene on ANY meaningful change: a cut, a new subject or shot, new on-screen content, a distinct new action or topic beat. Do not let one scene silently span multiple genuinely different moments just to keep the list short — many short scenes are correct; a few long ones covering unrelated moments is not.
- Every scene's "audio_description" must reflect what is actually heard during that scene (speech content/topic, music, silence, sound effects) — this is a hard requirement, not optional detail. Use null only when there is truly nothing to describe (silent segment with no ambient sound at all).

ELEMENTS — log every occurrence, not a representative sample:
- Objects shown, text burned into the frame (OCR), notable actions, people, and relations between them — each with the timestamp where it appears.
- If the same on-screen text, object, or action appears again later after disappearing, log it again as a separate entry at its new timestamp — do not log it once and assume that covers every appearance.

GENERAL:
- Every timestamp is in seconds from the start of the video, as a number (not a "mm:ss" string).
- When genuinely unsure whether to split something into more, smaller entries or keep one larger entry, always choose more/smaller — losing granularity is the failure mode to avoid.
- Write every piece of natural-language text (summaries, titles, descriptions, transcript text, labels) in Spanish — the person reading this is a Spanish speaker — but keep every JSON key exactly as given in the schema (English).
- Output ONLY the JSON object. No markdown code fences, no commentary before or after it.`
