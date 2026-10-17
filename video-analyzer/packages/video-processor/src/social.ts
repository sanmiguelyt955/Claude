import path from 'node:path'
import { readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { execa } from 'execa'

/**
 * Social platforms whose pages are not a video file: the video has to be
 * extracted from the page, which is what yt-dlp does. Matched by host so
 * short links (vm.tiktok.com, instagr.am) work too.
 */
const SOCIAL_HOSTS: Array<{ platform: 'tiktok' | 'instagram'; hosts: RegExp }> = [
  { platform: 'tiktok', hosts: /(^|\.)tiktok\.com$/ },
  { platform: 'instagram', hosts: /(^|\.)(instagram\.com|instagr\.am)$/ },
]

export type SocialPlatform = 'tiktok' | 'instagram'

export function socialPlatformOf(url: string): SocialPlatform | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  return SOCIAL_HOSTS.find((s) => s.hosts.test(host))?.platform ?? null
}

export function isSocialVideoUrl(url: string): boolean {
  return socialPlatformOf(url) !== null
}

const PLATFORM_NAME: Record<string, string> = { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }

/**
 * Turns yt-dlp's English errors into what the user can do about them.
 * The raw message is kept at the end for the logs.
 */
export function explainYtDlpError(stderr: string, url: string): string {
  const platform = PLATFORM_NAME[socialPlatformOf(url) ?? ''] ?? 'la plataforma'
  const raw = stderr.split('\n').filter((l) => l.startsWith('ERROR')).pop()?.slice(0, 300) ?? stderr.slice(-300)
  if (/No module named yt_dlp/i.test(stderr)) {
    return 'Falta yt-dlp para descargar de redes sociales: pip install -r packages/perception/scripts/requirements.txt'
  }
  if (/log(ged)?[ -]?in|cookies|empty media response|not granting access|private/i.test(stderr)) {
    return (
      `${platform} no deja descargar este video sin iniciar sesión (o es privado). ` +
      'Configura YTDLP_COOKIES_FROM_BROWSER con el navegador donde tienes la sesión abierta ' +
      '(firefox, edge, chrome o safari) y vuelve a intentarlo. Detalle: ' + raw
    )
  }
  if (/unavailable|not available|removed|404|does not exist/i.test(stderr)) {
    return `El video de ${platform} no está disponible (borrado, privado o restringido en tu país). Detalle: ${raw}`
  }
  if (/rate.?limit|429|too many requests/i.test(stderr)) {
    return `${platform} está limitando las descargas por ahora. Espera unos minutos y reintenta. Detalle: ${raw}`
  }
  return `No se pudo descargar el video de ${platform}. Detalle: ${raw}`
}

export type SocialDownload = {
  filePath: string
  title: string | null
  sizeBytes: number
  /** `<dir>/captions.vtt` when the platform has subtitles for the video. */
  captionsPath: string | null
}

/**
 * Downloads the video behind a TikTok/Instagram/YouTube page with yt-dlp,
 * run as `python -m yt_dlp` so it travels inside the same Python as our
 * Whisper (no extra program to install). The result is always an MP4 with
 * audio at `<dir>/source.mp4`, merged and remuxed with the app's FFmpeg.
 *
 * Instagram (and some TikToks) only serve logged-in users; setting
 * YTDLP_COOKIES_FROM_BROWSER=firefox (or edge/chrome/safari) reuses the
 * session of that browser.
 */
export async function downloadWithYtDlp(url: string, dir: string): Promise<SocialDownload> {
  const python = process.env.PYTHON_BIN || 'python3'
  const args = [
    ...ytDlpBase(),
    '--no-playlist',
    '--no-progress',
    '--no-simulate',
    '--quiet',
    '--no-warnings',
    '--restrict-filenames',
    // Best MP4 video + M4A audio, else the best single file; always MP4 at the end.
    '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
    '--merge-output-format', 'mp4',
    '--remux-video', 'mp4',
    '-o', path.join(dir, 'source.%(ext)s'),
    '--print', 'after_move:%(title).200s',
    // The page's metadata, kept so the captions step does not extract it again.
    '--write-info-json',
    '-o', `infojson:${path.join(dir, 'info')}`,
  ]
  args.push('--', url)

  const result = await execa(python, args, { reject: false, timeout: 10 * 60_000, windowsHide: true })
  if (result.exitCode !== 0) {
    throw new Error(explainYtDlpError(`${result.stderr ?? ''}\n${result.stdout ?? ''}`, url))
  }

  const files = (await readdir(dir)).filter((f) => f.startsWith('source.') && !f.endsWith('.part') && !f.endsWith('.json'))
  const file = files.find((f) => f === 'source.mp4') ?? files[0]
  if (!file) throw new Error(`yt-dlp terminó sin dejar el video en ${dir}`)
  const filePath = path.join(dir, file)
  const title = String(result.stdout ?? '').trim().split('\n').pop()?.trim() || null
  const captionsPath = await downloadCaptions(dir).catch(() => null)
  return { filePath, title: title && title !== 'NA' ? title : null, sizeBytes: (await stat(filePath)).size, captionsPath }
}

/** `python -m yt_dlp` plus the options every call shares (ffmpeg, cookies). */
function ytDlpBase(): string[] {
  const args = ['-m', 'yt_dlp']
  if (process.env.FFMPEG_PATH) args.push('--ffmpeg-location', process.env.FFMPEG_PATH)
  if (process.env.YTDLP_COOKIES_FROM_BROWSER) args.push('--cookies-from-browser', process.env.YTDLP_COOKIES_FROM_BROWSER)
  if (process.env.YTDLP_COOKIES_FILE) args.push('--cookies', process.env.YTDLP_COOKIES_FILE)
  return args
}

type SubtitleTracks = Record<string, Array<{ ext?: string }> | undefined>
type VideoInfo = { language?: string | null; subtitles?: SubtitleTracks; automatic_captions?: SubtitleTracks }

/**
 * The caption track worth reading instead of transcribing, in /watch's
 * order: subtitles someone wrote beat automatic ones, and the video's own
 * language beats a translation. Automatic captions only count in the
 * original language (YouTube offers machine translations into every other
 * one, and "<lang>-orig" is the untranslated track). Live chat replays are
 * not captions.
 */
export function pickCaptionTrack(info: VideoInfo): { lang: string; auto: boolean } | null {
  const usable = (tracks: SubtitleTracks | undefined) =>
    Object.keys(tracks ?? {}).filter((l) => l !== 'live_chat' && (tracks?.[l]?.length ?? 0) > 0)
  const base = (l: string) => l.toLowerCase().split(/[-_]/)[0]!
  const spoken = info.language ? base(info.language) : null

  const manual = usable(info.subtitles)
  const manualPick = (spoken && manual.find((l) => base(l) === spoken)) || (spoken ? null : manual[0])
  if (manualPick) return { lang: manualPick, auto: false }

  const auto = usable(info.automatic_captions)
  const autoPick = auto.find((l) => l.endsWith('-orig')) ?? (spoken ? auto.find((l) => l.toLowerCase() === spoken) : undefined)
  return autoPick ? { lang: autoPick, auto: true } : null
}

/**
 * Saves the platform's captions next to the video as `<dir>/captions.vtt`,
 * so the analysis can read what is said instead of transcribing it. Best
 * effort and separate from the video download: a caption request that fails
 * (YouTube rate-limits them on its own) never costs the video. Returns null
 * when there is no usable track or USE_PLATFORM_CAPTIONS=0.
 */
export async function downloadCaptions(dir: string): Promise<string | null> {
  const infoName = (await readdir(dir)).find((f) => f.endsWith('.info.json'))
  if (!infoName) return null
  const infoPath = path.join(dir, infoName)
  try {
    if (process.env.USE_PLATFORM_CAPTIONS === '0') return null
    const track = pickCaptionTrack(JSON.parse(await readFile(infoPath, 'utf8')) as VideoInfo)
    if (!track) return null

    const python = process.env.PYTHON_BIN || 'python3'
    const result = await execa(
      python,
      [
        ...ytDlpBase(),
        '--load-info-json', infoPath,
        '--skip-download', '--quiet', '--no-warnings',
        track.auto ? '--write-auto-subs' : '--write-subs',
        '--sub-langs', track.lang,
        '--sub-format', 'vtt/best',
        '--convert-subs', 'vtt',
        '-o', `subtitle:${path.join(dir, 'captions')}`,
      ],
      { reject: false, timeout: 2 * 60_000, windowsHide: true },
    )
    if (result.exitCode !== 0) return null
    const written = (await readdir(dir)).find((f) => f.startsWith('captions.') && f.endsWith('.vtt'))
    if (!written) return null
    const target = path.join(dir, 'captions.vtt')
    await rename(path.join(dir, written), target)
    return target
  } finally {
    await rm(infoPath, { force: true })
  }
}
