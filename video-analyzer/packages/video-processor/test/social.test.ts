import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { downloadWithYtDlp, explainYtDlpError, isSocialVideoUrl, pickCaptionTrack, socialPlatformOf } from '../src/social.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const speech = path.resolve(here, '..', '..', 'perception', 'test', 'fixtures-speech.wav')

test('recognizes TikTok and Instagram links, including short ones', () => {
  assert.equal(socialPlatformOf('https://www.tiktok.com/@user/video/7300000000000000000'), 'tiktok')
  assert.equal(socialPlatformOf('https://vm.tiktok.com/ZMabc123/'), 'tiktok')
  assert.equal(socialPlatformOf('https://www.instagram.com/reel/C2vYhQ3t9cS/'), 'instagram')
  assert.equal(socialPlatformOf('https://instagr.am/p/abc/'), 'instagram')
  assert.equal(isSocialVideoUrl('https://example.com/video.mp4'), false)
  assert.equal(isSocialVideoUrl('https://nottiktok.com/x'), false) // only the real domain and its subdomains
  assert.equal(isSocialVideoUrl('no es una url'), false)
})

test('explains yt-dlp errors in terms of what the user can do', () => {
  const ig = 'https://www.instagram.com/reel/abc/'
  assert.match(
    explainYtDlpError('ERROR: [Instagram] abc: Instagram sent an empty media response. Check if this post is accessible in your browser without being logged-in.', ig),
    /Instagram no deja descargar este video sin iniciar sesión.*YTDLP_COOKIES_FROM_BROWSER/,
  )
  assert.match(explainYtDlpError('ERROR: [TikTok] 1: Video not available', 'https://www.tiktok.com/@a/video/1'), /no está disponible/)
  assert.match(explainYtDlpError('ERROR: HTTP Error 429: Too Many Requests', 'https://www.tiktok.com/@a/video/1'), /limitando las descargas/)
  assert.match(explainYtDlpError('/usr/bin/python3: No module named yt_dlp', 'https://www.tiktok.com/@a/video/1'), /Falta yt-dlp/)
})

test('downloads with yt-dlp into <dir>/source.mp4 with audio, using the app ffmpeg', { timeout: 120_000 }, async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-'))
  const clip = path.join(work, 'clip.mp4')
  execFileSync('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=320x180:d=3:r=30', '-i', speech,
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip,
  ])
  // A plain web server: yt-dlp's generic extractor handles it, so the test
  // checks our invocation (python -m yt_dlp, ffmpeg, output, title) offline.
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'video/mp4' })
    fs.createReadStream(clip).pipe(res)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const out = path.join(work, 'out')
  fs.mkdirSync(out)
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/mi-clip.mp4`
    const got = await downloadWithYtDlp(url, out)
    assert.equal(got.filePath, path.join(out, 'source.mp4'))
    assert.ok(got.sizeBytes > 10_000)
    assert.equal(got.title, 'mi-clip')
    const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', got.filePath]).toString()
    assert.match(streams, /video/)
    assert.match(streams, /audio/)
  } finally {
    server.close()
  }
})

test('picks written captions in the spoken language, else the original automatic track', () => {
  const t = [{ ext: 'vtt' }]
  assert.deepEqual(pickCaptionTrack({ language: 'es', subtitles: { en: t, 'es-419': t }, automatic_captions: { 'es-orig': t } }), { lang: 'es-419', auto: false })
  assert.deepEqual(pickCaptionTrack({ language: 'en', subtitles: { es: t }, automatic_captions: { es: t, 'en-orig': t, en: t } }), { lang: 'en-orig', auto: true })
  assert.deepEqual(pickCaptionTrack({ language: 'pt', automatic_captions: { en: t, pt: t } }), { lang: 'pt', auto: true })
  assert.deepEqual(pickCaptionTrack({ subtitles: { 'eng-US': t } }), { lang: 'eng-US', auto: false }, 'TikTok gives no language')
  assert.equal(pickCaptionTrack({ language: 'en', automatic_captions: { fr: t, de: t } }), null, 'only translations')
  assert.equal(pickCaptionTrack({ subtitles: { live_chat: t } }), null)
  assert.equal(pickCaptionTrack({}), null)
})

test('saves the page captions as captions.vtt next to the video', { timeout: 120_000 }, async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-subs-'))
  const clip = path.join(work, 'clip.mp4')
  execFileSync('ffmpeg', [
    '-hide_banner', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=green:s=320x180:d=3:r=30', '-i', speech,
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clip,
  ])
  const vtt = 'WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nHola desde los subtítulos\n'
  // A page with an HTML5 <video> and a <track>: yt-dlp's generic extractor
  // lists the track as a subtitle, like a TikTok or YouTube page would.
  const server = http.createServer((req, res) => {
    if (req.url === '/clip.mp4') {
      res.writeHead(200, { 'content-type': 'video/mp4' })
      return fs.createReadStream(clip).pipe(res)
    }
    if (req.url === '/subs.vtt') {
      res.writeHead(200, { 'content-type': 'text/vtt' })
      return res.end(vtt)
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<html><head><title>Con subtitulos</title></head><body><video controls><source src="/clip.mp4" type="video/mp4"><track kind="subtitles" srclang="es" src="/subs.vtt"></video></body></html>')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const out = path.join(work, 'out')
  fs.mkdirSync(out)
  try {
    const got = await downloadWithYtDlp(`http://127.0.0.1:${(server.address() as { port: number }).port}/pagina`, out)
    assert.equal(got.captionsPath, path.join(out, 'captions.vtt'))
    assert.match(fs.readFileSync(got.captionsPath!, 'utf8'), /Hola desde los subtítulos/)
    assert.deepEqual(fs.readdirSync(out).sort(), ['captions.vtt', 'source.mp4'], 'the info JSON is removed')

    // Turned off: same page, no captions.
    process.env.USE_PLATFORM_CAPTIONS = '0'
    const plain = path.join(work, 'plain')
    fs.mkdirSync(plain)
    const again = await downloadWithYtDlp(`http://127.0.0.1:${(server.address() as { port: number }).port}/pagina`, plain)
    assert.equal(again.captionsPath, null)
  } finally {
    delete process.env.USE_PLATFORM_CAPTIONS
    server.close()
  }
})

test('a missing yt-dlp gives the install hint', async () => {
  const saved = process.env.PYTHON_BIN
  process.env.PYTHON_BIN = process.execPath // node, not python: "-m yt_dlp" fails
  try {
    await assert.rejects(downloadWithYtDlp('https://www.tiktok.com/@a/video/1', os.tmpdir()), /descargar el video de TikTok|Falta yt-dlp/)
  } finally {
    if (saved === undefined) delete process.env.PYTHON_BIN
    else process.env.PYTHON_BIN = saved
  }
})

// Real TikTok download. TikTok blocks some networks, so it only runs on demand:
// LIVE_SOCIAL_TESTS=1 npm run test:video-processor
test('downloads a real TikTok', { skip: !process.env.LIVE_SOCIAL_TESTS, timeout: 180_000 }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-'))
  const got = await downloadWithYtDlp('https://www.tiktok.com/@scout2015/video/6718335390845095173', out)
  assert.ok(got.sizeBytes > 100_000)
  assert.ok(got.title && got.title.length > 3, `title: ${got.title}`)
})
