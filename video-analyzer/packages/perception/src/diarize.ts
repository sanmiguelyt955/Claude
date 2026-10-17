import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Transcript } from './transcribe.js'

const run = promisify(execFile)
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'diarize.py')

/**
 * "Quién habla": labels every transcript segment with "Hablante N" via
 * scripts/diarize.py (WeSpeaker voice prints + spectral clustering, see
 * scripts/nuestras_voces). The speakers are numbered by first appearance;
 * one voice gives "Hablante 1" everywhere.
 */
export async function diarize(wavPath: string, transcript: Transcript): Promise<Transcript> {
  if (transcript.segments.length === 0) return transcript
  const dir = await mkdtemp(path.join(tmpdir(), 'diarize-'))
  try {
    const segmentsPath = path.join(dir, 'segments.json')
    await writeFile(segmentsPath, JSON.stringify(transcript.segments.map((s) => ({ start: s.start, end: s.end }))))
    const python = process.env.PYTHON_BIN || 'python3'
    const { stdout } = await run(python, [SCRIPT, wavPath, segmentsPath], { maxBuffer: 64 * 1024 * 1024 })
    const speakers = JSON.parse(String(stdout)) as Array<string | null>
    if (speakers.length !== transcript.segments.length) throw new Error('diarize.py devolvió otro número de segmentos')
    return { ...transcript, segments: transcript.segments.map((s, i) => ({ ...s, speaker: speakers[i] ?? null })) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
