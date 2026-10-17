// Usage: npx tsx packages/perception/src/cli.ts <video> <workDir> [--fps 120]
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { perceive } from './perceive.js'
import { DEFAULT_FRAME_OPTIONS } from './frames.js'

const [video, workDir, ...rest] = process.argv.slice(2)
if (!video || !workDir) {
  console.error('Uso: tsx src/cli.ts <video> <workDir> [--fps N]')
  process.exit(1)
}
const fpsFlag = rest.indexOf('--fps')
const fps = fpsFlag >= 0 ? Number(rest[fpsFlag + 1]) : DEFAULT_FRAME_OPTIONS.fps

const result = await perceive(video, workDir, {
  frameOptions: { ...DEFAULT_FRAME_OPTIONS, fps },
  log: (m) => console.error(m),
})
const out = path.join(workDir, 'result.json')
await writeFile(out, JSON.stringify(result, null, 2))
console.error(`listo: ${out}`)
