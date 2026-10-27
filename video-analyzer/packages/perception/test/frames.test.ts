import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DEFAULT_FRAME_OPTIONS, capFrames, dedupFrames, extractFrames, framesAndCutsOnce } from '../src/frames.ts'

// 20 s: one red shot of 12 s, then 8 s of blue.
function staticVideo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'frames-'))
  const out = path.join(dir, 'static.mp4')
  execFileSync('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=12:r=30',
    '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=8:r=30',
    '-filter_complex', '[0][1]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out,
  ])
  return out
}

test('a static shot sends one frame, plus one every maxGapSeconds', { timeout: 120_000 }, async () => {
  const video = staticVideo()
  const out = mkdtempSync(path.join(tmpdir(), 'frames-out-'))
  const frames = await extractFrames(video, out, { ...DEFAULT_FRAME_OPTIONS, fps: 10 })
  // 0 s (red), 10 s (red, the gap rule), 12 s (blue); every 1 s keyframe in between is a duplicate.
  assert.deepEqual(frames.map((f) => Math.round(f.time)), [0, 10, 12])
  assert.equal(readdirSync(out).length, 3, 'dropped JPGs are deleted and the thumbnail strip is gone')

  const all = await extractFrames(video, mkdtempSync(path.join(tmpdir(), 'frames-all-')), { ...DEFAULT_FRAME_OPTIONS, fps: 10, dedupThreshold: 0 })
  assert.ok(all.length >= 20, `without dedup every keyframe stays: ${all.length}`)
})

test('dedupFrames keeps frames that changed and drops the rest', () => {
  const frames = [0, 1, 2, 3].map((time) => ({ path: '', time }))
  const thumbs = [new Uint8Array([0, 0]), new Uint8Array([1, 1]), new Uint8Array([90, 90]), new Uint8Array([91, 92])]
  assert.deepEqual([...dedupFrames(frames, (i) => thumbs[i]!, { dedupThreshold: 2, maxGapSeconds: 10 })], [0, 2])
  assert.deepEqual([...dedupFrames(frames, (i) => thumbs[i]!, { dedupThreshold: 2, maxGapSeconds: 2 })], [0, 2])
  assert.deepEqual([...dedupFrames(frames, (i) => thumbs[i]!, { dedupThreshold: 2, maxGapSeconds: 1 })], [0, 1, 2, 3])
})

test('a small text on a still shot is a new frame even if the average barely moves', () => {
  const still = new Uint8Array(32 * 32 * 3).fill(100)
  const caption = Uint8Array.from(still)
  for (let i = 0; i < 30; i++) caption[i] = 250 // a few bright cells: mean change about 1.5
  const frames = [0, 1, 2].map((t) => ({ path: `${t}.jpg`, time: t }))
  const thumbs = [still, caption, caption]
  assert.deepEqual([...dedupFrames(frames, (i) => thumbs[i]!, { dedupThreshold: 2, maxGapSeconds: 10 })], [0, 1])
})

test('when frames must be cut, every shot keeps the frame right after its cut', () => {
  const frames = Array.from({ length: 1000 }, (_, i) => ({ path: `${i}.jpg`, time: i * 0.5 }))
  const cuts = Array.from({ length: 120 }, (_, i) => ({ time: 3.25 + i * 4, score: 20 }))
  const keep = capFrames(frames, cuts, 300)
  assert.equal(keep.size, 300)
  assert.ok(keep.has(0))
  for (const c of cuts) assert.ok(keep.has(frames.findIndex((f) => f.time >= c.time)), `cut at ${c.time}`)
  assert.equal(capFrames(frames, cuts, 50).size, 50, 'more cuts than room: cut frames spread evenly')
})

test('frames are never enlarged, and a vertical video is bounded by its long side', { timeout: 120_000 }, async () => {
  const size = (file: string) =>
    execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim()
  const clip = (s: string) => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'frames-size-')), `${s}.mp4`)
    execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=s=${s}:d=2:r=10`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out])
    return out
  }
  const first = async (video: string, width: number) =>
    size((await extractFrames(video, mkdtempSync(path.join(tmpdir(), 'frames-size-out-')), { ...DEFAULT_FRAME_OPTIONS, fps: 10, width }))[0]!.path)
  const wide = clip('320x180')
  const tall = clip('180x320')
  assert.equal(await first(wide, 768), '320,180', 'a 320 px source stays 320 px (it was enlarged to 768)')
  assert.equal(await first(wide, 128), '128,72')
  assert.equal(await first(tall, 128), '72,128', 'vertical: the height is the long side (it was 128x228)')
})

test('a retry takes the frames the first attempt left, unless the options changed or one is missing', { timeout: 120_000 }, async () => {
  const video = staticVideo()
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'frames-once-')), 'frames')
  const opts = { ...DEFAULT_FRAME_OPTIONS, fps: 10 }
  const first = await framesAndCutsOnce(video, out, opts)
  assert.equal(first.reused, false)
  const written = statSync(first.frames[0]!.path).mtimeMs
  const again = await framesAndCutsOnce(video, out, opts)
  assert.equal(again.reused, true)
  assert.deepEqual(again.frames, first.frames)
  assert.deepEqual(again.cuts, first.cuts)
  assert.equal(statSync(again.frames[0]!.path).mtimeMs, written, 'nothing decoded again')

  assert.equal((await framesAndCutsOnce(video, out, { ...opts, maxGapSeconds: 5 })).reused, false, 'other options: extracted again')
  const now = await framesAndCutsOnce(video, out, { ...opts, maxGapSeconds: 5 })
  assert.equal(now.reused, true)
  unlinkSync(now.frames[1]!.path)
  const redone = await framesAndCutsOnce(video, out, { ...opts, maxGapSeconds: 5 })
  assert.equal(redone.reused, false, 'a missing frame: extracted again')
  assert.deepEqual(redone.frames, now.frames)
})
