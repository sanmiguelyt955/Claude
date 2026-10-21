import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const run = promisify(execFile)
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'transcribe.py')
const MAX_BUFFER = 64 * 1024 * 1024

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
  /** "parakeet" when Parakeet transcribed instead of Whisper. */
  engine?: string
  /** Why the NVIDIA card was not used after all (it failed and the CPU took over). */
  gpu_error?: string
}

/**
 * The reason a transcribe.py run failed, in one line: the last line it left
 * on stderr without the Python exception name ("RuntimeError: FFmpeg no
 * pudo leer el audio: ..." -> "FFmpeg no pudo leer el audio: ..."), else how
 * the process ended.
 */
export function failureReason(err: unknown): string {
  const e = err as { stderr?: string | Buffer; code?: number | string; signal?: string | null }
  const last = String(e.stderr ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1)
  if (last) return last.replace(/^[\w.]*(Error|Exception): /, '').slice(0, 300)
  return e.signal ? `el proceso se cerró (${e.signal})` : `el proceso terminó con el código ${e.code ?? 'desconocido'}`
}

/**
 * "Escuchar": speech-to-text on a WAV file via scripts/transcribe.py.
 * Default engine is faster-whisper when installed, on the NVIDIA card if
 * there is one; WHISPER_ENGINE=propio forces our NumPy Whisper and
 * WHISPER_ENGINE=parakeet NVIDIA Parakeet (faster on the CPU, less exact). A crash on
 * the card that Python cannot catch (a missing CUDA DLL can abort the
 * process) is retried once on the CPU. An error Python itself reported (a
 * file FFmpeg cannot read...) is not: transcribe.py already falls back to
 * the CPU on its own, so a second run would only fail the same way later.
 */
export async function transcribe(
  wavPath: string,
  opts: { model?: string; language?: string; engine?: 'propio' | 'faster-whisper' | 'parakeet' } = {},
): Promise<Transcript> {
  const python = process.env.PYTHON_BIN || 'python3'
  const args = [SCRIPT, wavPath, '--model', opts.model || process.env.WHISPER_MODEL || 'small']
  if (opts.language) args.push('--language', opts.language)
  const engine = opts.engine || process.env.WHISPER_ENGINE
  if (engine) args.push('--engine', engine)
  const forced = process.env.WHISPER_DEVICE
  let first: string
  try {
    const { stdout } = await run(python, args, { maxBuffer: MAX_BUFFER })
    return JSON.parse(String(stdout)) as Transcript
  } catch (err) {
    first = failureReason(err)
    const pythonError = /Traceback \(most recent call last\)/.test(String((err as { stderr?: unknown }).stderr ?? ''))
    if ((forced && forced !== 'auto') || pythonError) throw new Error(`No se pudo transcribir el audio: ${first}`)
    console.warn(`[perception] la transcripción se cerró de golpe (${first}); se repite en el procesador`)
  }
  try {
    const { stdout } = await run(python, [...args, '--device', 'cpu'], { maxBuffer: MAX_BUFFER })
    return { ...(JSON.parse(String(stdout)) as Transcript), gpu_error: first }
  } catch (err) {
    throw new Error(`No se pudo transcribir el audio: ${failureReason(err)}`)
  }
}
