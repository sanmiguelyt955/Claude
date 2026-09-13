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

/**
 * The describing voice both prompts share: a professional audio-description
 * narrator working for a blind viewer (PROJECT.md's accessibility bar for
 * this tool — see CLAUDE.md's memory on the topic). This is a STYLE
 * instruction, not a granularity one: it governs how densely each second is
 * described once the caller has decided how many seconds go in the call
 * (buildAnalysisPrompt for a short video, buildWindowAnalysisPrompt for one
 * slice of a windowed long one) — it says nothing about scene length itself.
 */
const AUDIO_DESCRIPTION_VOICE = `You are a professional audio-description narrator, the kind broadcasters hire to describe a program for a blind viewer who cannot see the screen at all. Everything visual has to be said out loud, in words, with the same precision a sighted expert would use if asked to guide someone through the video second by second: exact colors, textures, spatial position ("top-left of frame", "he steps forward and to the right"), facial expressions, body language, camera movement (pan, zoom, cut), on-screen text read verbatim, lighting and mood — never a vague "something happens", always the concrete visual fact. Apply the exact same rigor to sound: describe voice tone and delivery, not just words; name music genre/mood and how it changes; call out sound effects, silence, and background noise explicitly. Someone will rely on this JSON as the only account of what happens, without ever watching or hearing the video themselves — a detail you skip is permanently lost to them.`

export const ANALYSIS_PROMPT = `${AUDIO_DESCRIPTION_VOICE} Watch the entire video (video and audio together — treat them as one synchronized source, never analyze the picture without the sound or vice versa) and produce ONE JSON object matching the given schema, covering the whole duration from second 0 to the very end.

TRANSCRIPT — completeness is mandatory, not best-effort:
- Transcribe EVERY word spoken, from the first sound to the last, verbatim (not paraphrased, not summarized).
- Consecutive entries must be contiguous: one entry's end_seconds should meet the next entry's start_seconds, with no unexplained multi-second jumps while someone is talking. A gap is only correct where the video is genuinely silent for that stretch.
- Split into entries by natural sentence/phrase boundaries — do not merge two minutes of continuous speech into one entry, and do not invent pauses that were not there.
- "transcript" is empty ([]) only if the video truly has no speech anywhere.

SCENES — describe SECOND BY SECOND, not in sparse summary blocks:
- Consecutive scenes: each end_seconds equals the next scene's start_seconds, covering 0 to the end, with no gaps.
- Each scene must span only 1 to 4 seconds. A shot that holds still for 10 seconds is still 3-4 separate scene entries, one per moment worth narrating (a gesture completing, a new word of on-screen text appearing, a shift in expression) — never one entry silently covering many seconds of continuous action. If truly nothing changes for a stretch, split it anyway at a natural ~2-3 second boundary and describe what is still happening in each ("sigue sosteniendo el producto frente a la camara, sin moverse") rather than collapsing it into a long single entry.
- Every scene's "description" narrates that 1-4 second slice with full audio-description detail as instructed above — never a generic one-liner.
- Every scene's "audio_description" must reflect what is actually heard during that exact slice (speech content, music, silence, sound effects) with the same second-level precision — this is a hard requirement, not optional detail. Use null only when there is truly nothing to describe (silent segment with no ambient sound at all).

ELEMENTS — log every occurrence, not a representative sample:
- Objects shown, text burned into the frame (OCR), notable actions, people, and relations between them — each with the timestamp where it appears.
- If the same on-screen text, object, or action appears again later after disappearing, log it again as a separate entry at its new timestamp — do not log it once and assume that covers every appearance.

GENERAL:
- Every timestamp is in seconds from the start of the video, as a number (not a "mm:ss" string).
- When genuinely unsure whether to split something into more, smaller entries or keep one larger entry, always choose more/smaller — losing granularity is the failure mode to avoid.
- Write every piece of natural-language text (summaries, titles, descriptions, transcript text, labels) in Spanish — the person reading this is a Spanish speaker — but keep every JSON key exactly as given in the schema (English).
- Output ONLY the JSON object. No markdown code fences, no commentary before or after it.`

/**
 * The analysis prompt with the video's real length pinned to it.
 *
 * Without the number, Gemini derives its own timeline on long videos and
 * drifts: an 11:29 video came back with scenes and transcript correct but
 * `elements` timestamped up to 15:24 — minutes that do not exist. The model
 * cannot check itself against a duration it was never told, so telling it is
 * the fix, and the ceiling is restated where the drift actually happens.
 */
export function buildAnalysisPrompt(durationSeconds?: number | null): string {
  if (!durationSeconds || !Number.isFinite(durationSeconds)) return ANALYSIS_PROMPT
  const total = Math.round(durationSeconds)
  const mm = Math.floor(total / 60)
  const ss = String(total % 60).padStart(2, '0')
  return `${ANALYSIS_PROMPT}

DURATION — this is a hard limit, not a hint:
- This video lasts EXACTLY ${total} seconds (${mm}:${ss}). It ends at second ${total}.
- No timestamp anywhere in the JSON may exceed ${total} — not in scenes, not in transcript, and not in elements. A start or end beyond ${total} is an error, not an approximation.
- Scenes, transcript and elements all share ONE timeline: the same moment must carry the same number in all three. Do not restart, rescale or estimate a separate timeline for elements.
- The last scene must end at or very near second ${total}.`
}

/**
 * Prompt for ONE slice of a long video that has been cut into windows
 * (see analyzeVideoWindowed in analyze-video.ts). Second-by-second audio
 * description makes even a short video's output large — see MAX_OUTPUT_TOKENS
 * — so a long video has to be split into several calls to stay under that
 * ceiling, each with a Gemini `videoMetadata.startOffset/endOffset` clipping
 * it to just this slice.
 *
 * Timestamps here are asked RELATIVE TO THIS SLICE (0 to its own duration),
 * not the full video — asking Gemini to compute and emit absolute offsets
 * across a clip it was only shown a fragment of is an extra place for drift
 * to creep back in (the exact bug buildAnalysisPrompt's DURATION section
 * exists to prevent). The caller adds `windowStartSeconds` back on
 * deterministically once the slice's own JSON comes back, which is simpler
 * and cannot drift.
 */
export function buildWindowAnalysisPrompt(input: {
  windowIndex: number
  windowCount: number
  windowStartSeconds: number
  windowDurationSeconds: number
  fullVideoDurationSeconds: number
}): string {
  const { windowIndex, windowCount, windowStartSeconds, windowDurationSeconds, fullVideoDurationSeconds } = input
  const total = Math.round(windowDurationSeconds)
  const fullTotal = Math.round(fullVideoDurationSeconds)
  const absoluteStart = Math.round(windowStartSeconds)
  const absoluteEnd = absoluteStart + total

  return `${AUDIO_DESCRIPTION_VOICE}

You are being shown ONE FRAGMENT of a longer video, fragment ${windowIndex + 1} of ${windowCount}. The full video is ${fullTotal} seconds long; this fragment covers seconds ${absoluteStart}-${absoluteEnd} of it, but you are only given THIS fragment's ${total} seconds of footage — you cannot see what came before or after it, and must not guess at or reference it.

Produce ONE JSON object matching the given schema, covering this fragment's ENTIRE duration from its own second 0 to its own second ${total} — treat this fragment as if it were the whole video for timestamp purposes:

TIMESTAMPS — relative to THIS FRAGMENT, not the full video:
- Second 0 is this fragment's first frame. Second ${total} is its last. Nothing may exceed ${total}.
- Do not try to compute or emit the fragment's position within the larger video — the caller adds that offset back afterward. Emitting ${absoluteStart}-${absoluteEnd} instead of 0-${total} would double the offset and corrupt the timeline.

TRANSCRIPT — completeness is mandatory, not best-effort:
- Transcribe EVERY word spoken in this fragment, from its first sound to its last, verbatim.
- Consecutive entries must be contiguous, with no unexplained multi-second jumps while someone is talking.
- "transcript" is empty ([]) only if this fragment truly has no speech.

SCENES — describe SECOND BY SECOND, not in sparse summary blocks:
- Tile this fragment's ${total} seconds with no gaps, each scene spanning only 1 to 4 seconds — the same second-level narration density described above, applied to this fragment alone.
- Every "description" and "audio_description" carries full audio-description detail for that exact 1-4 second slice.

ELEMENTS — log every occurrence within this fragment, not a representative sample.

GENERAL:
- All natural-language text (summaries, titles, descriptions, transcript text, labels) in Spanish; JSON keys stay in English exactly as given in the schema.
- "summary" should describe only what this fragment shows, not the video as a whole (the caller cannot see the other fragments either).
- Output ONLY the JSON object. No markdown code fences, no commentary before or after it.`
}
