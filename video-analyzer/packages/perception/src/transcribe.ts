import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const run = promisify(execFile)
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'transcribe.py')

export type Segment = {
  start: number
  end: number
  text: string
  /** "Hablante N" once diarize() ran; absent before or when nobody could be told apart. */
  speaker?: string | null
}
export type Transcript = {
  language: string
  segments: Segment[]
  /** Where faster-whisper ran: "cuda" (NVIDIA card) or "cpu". Absent for captions and our NumPy engine. */
  device?: string
}

/**
 * "Escuchar": speech-to-text on a WAV file via scripts/transcribe.py.
 * Default engine is faster-whisper when installed, on the NVIDIA card if
 * there is one; WHISPER_ENGINE=propio forces our NumPy Whisper. A crash on
 * the card that Python cannot catch (a missing CUDA DLL can abort the
 * process) is retried once on the CPU.
 */
export async function transcribe(
  wavPath: string,
  opts: { model?: string; language?: string; engine?: 'propio' | 'faster-whisper' } = {},
): Promise<Transcript> {
  const python = process.env.PYTHON_BIN || 'python3'
  const args = [SCRIPT, wavPath, '--model', opts.model || process.env.WHISPER_MODEL || 'small']
  if (opts.language) args.push('--language', opts.language)
  const engine = opts.engine || process.env.WHISPER_ENGINE
  if (engine) args.push('--engine', engine)
  const forced = process.env.WHISPER_DEVICE
  try {
    const { stdout } = await run(python, args, { maxBuffer: 64 * 1024 * 1024 })
    return JSON.parse(String(stdout)) as Transcript
  } catch (err) {
    if (forced && forced !== 'auto') throw err
    const { stdout } = await run(python, [...args, '--device', 'cpu'], { maxBuffer: 64 * 1024 * 1024 })
    return JSON.parse(String(stdout)) as Transcript
  }
}
