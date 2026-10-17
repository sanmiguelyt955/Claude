import type { Segment, Transcript } from './transcribe.js'

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/
const seconds = (t: string): number => {
  const m = TIME.exec(t)
  if (!m) return NaN
  // Whole milliseconds first, so 2.28 stays 2.28 and not 2.2800000000000002.
  return (Number(m[1] ?? 0) * 3_600_000 + Number(m[2]) * 60_000 + Number(m[3]) * 1000 + Number(m[4]!.padEnd(3, '0'))) / 1000
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&quot;': '"', '&#39;': "'" }
const clean = (line: string) =>
  line
    .replace(/<[^>]*>/g, '') // <c>, <i>, <00:00:01.000> word timings, <v Speaker>
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Platform captions (WebVTT, as yt-dlp saves them) as a Transcript, so the
 * analysis can skip Whisper. YouTube's automatic captions roll: each cue
 * repeats the line before it and adds the new words, with 10 ms cues in
 * between that repeat everything; a line already shown by the previous cue
 * is dropped so every sentence appears once.
 */
export function parseVtt(vtt: string, fallbackLanguage: string): Transcript {
  // YouTube writes "Language: en" in the header; other platforms don't.
  const language = /^Language:\s*([\w-]+)/m.exec(vtt.split(/\n\s*\n/)[0] ?? '')?.[1] ?? fallbackLanguage
  const segments: Segment[] = []
  let previous: string[] = []
  for (const block of vtt.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const timing = lines.findIndex((l) => l.includes('-->'))
    if (timing < 0) continue
    const [from, to] = lines[timing]!.split('-->')
    const start = seconds(from ?? '')
    const end = seconds((to ?? '').trim().split(/\s+/)[0] ?? '')
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue

    const text = lines.slice(timing + 1).map(clean).filter(Boolean)
    const fresh = text.filter((l) => !previous.includes(l))
    previous = text
    if (fresh.length === 0) continue
    segments.push({ start, end: Math.max(end, start), text: fresh.join(' ') })
  }
  return { language, segments }
}

/**
 * Share of the video (0..1) the captions actually cover, counting overlaps
 * once. Platform captions are sometimes only the first minute or a lyric
 * snippet; below half the video they are worse than transcribing.
 */
export function captionCoverage(segments: Segment[], duration: number): number {
  if (!(duration > 0)) return segments.length ? 1 : 0
  let covered = 0
  let reach = 0
  for (const s of [...segments].sort((a, b) => a.start - b.start)) {
    const start = Math.max(s.start, reach)
    if (s.end > start) covered += s.end - start
    reach = Math.max(reach, s.end)
  }
  return Math.min(1, covered / duration)
}

/** Minimum coverage for captions to replace Whisper (rule from claude-video-vision, MIT). */
export const MIN_CAPTION_COVERAGE = 0.5
