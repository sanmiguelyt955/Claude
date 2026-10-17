// Usage: npx tsx packages/perception/src/cli.ts <video> <workDir> [--fps 120] [--every-frame]
//   --fps N        sampling grid (default 120)
//   --every-frame  keep every frame of that grid, not only scene changes;
//                  at 120 fps that is ~7200 frames per minute of video
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { perceive } from './perceive.js'
import { DEFAULT_FRAME_OPTIONS } from './frames.js'

const [video, workDir, ...rest] = process.argv.slice(2)
if (!video || !workDir) {
  console.error('Uso: tsx src/cli.ts <video> <workDir> [--fps N] [--every-frame]')
  process.exit(1)
}
const fpsFlag = rest.indexOf('--fps')
const fps = fpsFlag >= 0 ? Number(rest[fpsFlag + 1]) : DEFAULT_FRAME_OPTIONS.fps
if (!Number.isFinite(fps) || fps <= 0) {
  console.error('--fps debe ser un número mayor que 0')
  process.exit(1)
}
const everyFrame = rest.includes('--every-frame')

try {
  const result = await perceive(video, workDir, {
    frameOptions: {
      ...DEFAULT_FRAME_OPTIONS,
      fps,
      ...(everyFrame ? { keyframeEverySeconds: 1 / fps, maxFrames: Number.MAX_SAFE_INTEGER } : {}),
    },
    log: (m) => console.error(`[perception] ${m}`),
  })
  const out = path.join(workDir, 'result.json')
  await writeFile(out, JSON.stringify(result, null, 2))
  console.error(`listo: ${out}`)
} catch (err) {
  console.error(`error: ${(err as Error).message}`)
  process.exit(1)
}
