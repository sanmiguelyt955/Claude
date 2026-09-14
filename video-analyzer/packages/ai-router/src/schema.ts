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
        'Exactly one entry per integer second of the video, ordered by start_seconds, start_seconds=N/end_seconds=N+1 for every N — never a wider span, never merged seconds.',
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
const AUDIO_DESCRIPTION_VOICE = `You are a professional audio-description narrator, the kind broadcasters hire to describe a program for a blind viewer who cannot see the screen at all. Everything visual has to be said out loud, in words, with the same precision a sighted expert would use if asked to guide someone through the video second by second: exact colors, textures, spatial position ("top-left of frame", "he steps forward and to the right"), facial expressions, body language, hand gestures and micro-movements (a finger pointing, a nod, a shrug — these carry meaning and are never filler), camera movement (pan, zoom, cut), on-screen text read verbatim, lighting and mood — never a vague "something happens", always the concrete visual fact. Apply the exact same rigor to sound: describe voice tone and delivery, not just words; name music genre/mood and how it changes; call out sound effects, silence, and background noise explicitly. This JSON is the permanent record for a personal knowledge base (an Obsidian vault) — nobody will ever re-watch the source video to recover something you left out. A detail omitted here is not "summarized elsewhere", it is gone. When in doubt, include it.`

export const ANALYSIS_PROMPT = `${AUDIO_DESCRIPTION_VOICE} Watch the entire video (video and audio together — treat them as one synchronized source, never analyze the picture without the sound or vice versa) and produce ONE JSON object matching the given schema, covering the whole duration from second 0 to the very end.

TRANSCRIPT — completeness is mandatory, not best-effort:
- Transcribe EVERY word spoken, from the first sound to the last, verbatim (not paraphrased, not summarized).
- Consecutive entries must be contiguous: one entry's end_seconds should meet the next entry's start_seconds, with no unexplained multi-second jumps while someone is talking. A gap is only correct where the video is genuinely silent for that stretch.
- Split into entries by natural sentence/phrase boundaries — do not merge two minutes of continuous speech into one entry, and do not invent pauses that were not there.
- "transcript" is empty ([]) only if the video truly has no speech anywhere.

SCENES — ONE ENTRY PER SECOND, no exceptions, no ranges:
- This is a hard structural rule, not a style preference: emit exactly one scene entry per integer second of the video. Second 0 is start_seconds=0/end_seconds=1, second 1 is start_seconds=1/end_seconds=2, second 2 is start_seconds=2/end_seconds=3, and so on to the very last second — never start_seconds=1/end_seconds=4 or any other span wider than 1. If the video is N seconds long, there must be exactly N scene entries (the last one truncated to the real end if it is not a whole second).
- Do NOT merge multiple seconds into one entry even when nothing visibly changes. A shot held perfectly still for 10 seconds is still 10 separate entries, each describing that same held instant ("sigue sosteniendo el producto frente a la camara, sin moverse, luz constante") — repeating the description is correct here, collapsing it into one entry covering several seconds is not.
- Every scene's "description" narrates exactly that one second with full audio-description detail as instructed above — never a generic one-liner, and never a description that silently spans more time than the one second it is attached to.
- Every scene's "audio_description" must reflect what is actually heard during that exact second (speech content, music, silence, sound effects) with the same one-second precision — this is a hard requirement, not optional detail. Use null only when there is truly nothing to describe (silent segment with no ambient sound at all).

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

SCENES — ONE ENTRY PER SECOND, no exceptions, no ranges:
- Emit exactly one scene entry per integer second of THIS fragment: start_seconds=0/end_seconds=1, start_seconds=1/end_seconds=2, ... up to start_seconds=${total - 1}/end_seconds=${total}. Exactly ${total} entries total, never a wider span, never merged seconds — the same rule described above, applied to this fragment alone.
- Even a second where nothing visibly changes gets its own entry (repeat the description if needed) — do not collapse a still moment into a single entry covering more than one second.
- Every "description" and "audio_description" carries full audio-description detail for that exact one-second slice.

ELEMENTS — log every occurrence within this fragment, not a representative sample.

GENERAL:
- All natural-language text (summaries, titles, descriptions, transcript text, labels) in Spanish; JSON keys stay in English exactly as given in the schema.
- "summary" should describe only what this fragment shows, not the video as a whole (the caller cannot see the other fragments either).
- Output ONLY the JSON object. No markdown code fences, no commentary before or after it.`
}
