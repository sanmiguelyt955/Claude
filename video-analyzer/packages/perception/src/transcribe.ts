import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const run = promisify(execFile)
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'transcribe.py')

export type Segment = { start: number; end: number; text: string }
export type Transcript = { language: string; segments: Segment[] }

/**
 * "Escuchar": speech-to-text on a WAV file. The engine is isolated in
 * scripts/transcribe.py so it can be replaced (e.g. by our own Whisper
 * implementation) without touching the pipeline.
 */
export async function transcribe(wavPath: string, opts: { model?: string; language?: string } = {}): Promise<Transcript> {
  const python = process.env.PYTHON_BIN || 'python3'
  const args = [SCRIPT, wavPath, '--model', opts.model || process.env.WHISPER_MODEL || 'small']
  if (opts.language) args.push('--language', opts.language)
  const { stdout } = await run(python, args, { maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(String(stdout)) as Transcript
}
