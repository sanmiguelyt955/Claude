'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Functional but intentionally plain: this is the bloque 2 surface to prove
 * the ingestion pipeline works end to end (upload/URL -> FFmpeg -> job). The
 * real iOS-style biblioteca/carga/resultados screens are bloque 5.
 */

type VideoStatus = 'pending' | 'probing' | 'queued' | 'analyzing' | 'ready' | 'failed'

type VideoRow = {
  id: string
  title: string
  source_kind: 'file' | 'url'
  source_url: string | null
  status: VideoStatus
  duration_seconds: number | null
  width: number | null
  height: number | null
  fps: number | null
  container: string | null
  video_codec: string | null
  audio_codec: string | null
  has_audio: 0 | 1 | null
  size_bytes: number | null
  error_message: string | null
  created_at: string
}

const STATUS_LABEL: Record<VideoStatus, string> = {
  pending: 'En cola',
  probing: 'Leyendo metadata...',
  queued: 'Listo para analizar',
  analyzing: 'Analizando...',
  ready: 'Analizado',
  failed: 'Fallo',
}

const STATUS_COLOR: Record<VideoStatus, string> = {
  pending: 'var(--color-ink-soft)',
  probing: 'var(--color-warn)',
  queued: 'var(--color-ok)',
  analyzing: 'var(--color-accent)',
  ready: 'var(--color-ok)',
  failed: 'oklch(0.62 0.22 25)',
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—'
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

export default function IngestaPage() {
  const [videos, setVideos] = useState<VideoRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [urlSubmitting, setUrlSubmitting] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [actionVideoId, setActionVideoId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    try {
      const res = await fetch('/api/videos', { cache: 'no-store' })
      const data = (await res.json()) as { videos: VideoRow[] }
      setVideos(data.videos)
    } catch {
      // Transient network hiccup during polling: keep the last known list.
    }
  }

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 2000)
    return () => clearInterval(interval)
  }, [])

  async function handleFileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file) return

    setUploading(true)
    setErrorMessage(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/videos/upload', { method: 'POST', body: formData })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al subir el archivo.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function handleUrlSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!urlValue.trim()) return

    setUrlSubmitting(true)
    setErrorMessage(null)
    try {
      const res = await fetch('/api/videos/from-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: urlValue.trim() }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error al aceptar la URL.')
      setUrlValue('')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setUrlSubmitting(false)
    }
  }

  async function handleRetry(id: string) {
    setActionVideoId(id)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/videos/${id}/retry`, { method: 'POST' })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo reintentar.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionVideoId(null)
    }
  }

  async function handleAnalyze(id: string) {
    setActionVideoId(id)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/videos/${id}/analyze`, { method: 'POST' })
      const data = (await res.json()) as { error?: string }
      // A 501 here is expected until bloque 3 exists — surfaced as info, not
      // as a failure, so it doesn't look like something broke.
      if (!res.ok) throw new Error(data.error ?? 'No se pudo iniciar el analisis.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionVideoId(null)
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-(--color-accent)">Bloque 2 · Ingesta</p>
        <h1 className="text-3xl font-semibold tracking-tight">Cargar video</h1>
        <p className="text-(--color-ink-soft)">
          Archivo local o URL directa. FFmpeg extrae la metadata en segundo plano; el analisis con
          Gemini llega en el bloque 3.
        </p>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-(--radius-card) border px-4 py-3 text-sm"
          style={{ borderColor: 'oklch(0.62 0.22 25)', color: 'oklch(0.62 0.22 25)' }}
        >
          {errorMessage}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5">
        <h2 className="text-sm font-semibold">Subir archivo</h2>
        <form onSubmit={handleFileSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*"
            className="flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-(--color-accent) file:px-3 file:py-1.5 file:text-white"
            disabled={uploading}
          />
          <button
            type="submit"
            disabled={uploading}
            className="shrink-0 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {uploading ? 'Subiendo...' : 'Subir'}
          </button>
        </form>
        <p className="text-xs text-(--color-ink-soft)">MP4, MOV, MKV, AVI, WebM, MP3, WAV, M4A, AAC, OGG, FLAC.</p>
      </section>

      <section className="flex flex-col gap-4 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5">
        <h2 className="text-sm font-semibold">Pegar URL</h2>
        <form onSubmit={handleUrlSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://..."
            className="flex-1 rounded-md border border-(--color-line) bg-transparent px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
            disabled={urlSubmitting}
          />
          <button
            type="submit"
            disabled={urlSubmitting}
            className="shrink-0 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {urlSubmitting ? 'Enviando...' : 'Agregar'}
          </button>
        </form>
        <p className="text-xs text-(--color-ink-soft)">
          Una URL de YouTube se acepta sin descargarla localmente: Gemini la procesa directo en el
          bloque 3.
        </p>
      </section>

      <section className="overflow-hidden rounded-(--radius-card) border border-(--color-line) bg-(--color-surface)">
        <h2 className="border-b border-(--color-line) px-5 py-3 text-sm font-semibold">
          Biblioteca ({videos.length})
        </h2>
        {videos.length === 0 ? (
          <p className="px-5 py-6 text-sm text-(--color-ink-soft)">Todavia no hay videos.</p>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {videos.map((video) => (
              <li key={video.id} className="flex flex-col gap-1 px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">{video.title}</span>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ color: STATUS_COLOR[video.status], background: 'color-mix(in oklch, currentColor 15%, transparent)' }}
                  >
                    {STATUS_LABEL[video.status]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-(--color-ink-soft)">
                  <span>{video.source_kind === 'url' ? video.source_url : 'archivo local'}</span>
                  {video.duration_seconds !== null && <span>{formatDuration(video.duration_seconds)}</span>}
                  {video.width && video.height && (
                    <span>
                      {video.width}x{video.height}
                      {video.fps ? ` @ ${video.fps.toFixed(1)}fps` : ''}
                    </span>
                  )}
                  {video.container && <span>{video.container.split(',')[0]}</span>}
                  {video.video_codec && <span>video: {video.video_codec}</span>}
                  {video.audio_codec && <span>audio: {video.audio_codec}</span>}
                  {video.size_bytes !== null && <span>{formatSize(video.size_bytes)}</span>}
                </div>
                {video.error_message && (
                  <p className="text-xs" style={{ color: 'oklch(0.62 0.22 25)' }}>
                    {video.error_message}
                  </p>
                )}
                {(video.status === 'queued' || video.status === 'failed') && (
                  <div className="mt-1">
                    {video.status === 'queued' && (
                      <button
                        type="button"
                        onClick={() => handleAnalyze(video.id)}
                        disabled={actionVideoId === video.id}
                        className="rounded-md bg-(--color-accent) px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {actionVideoId === video.id ? 'Procesando...' : 'Analizar'}
                      </button>
                    )}
                    {video.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => handleRetry(video.id)}
                        disabled={actionVideoId === video.id}
                        className="rounded-md border border-(--color-line) px-3 py-1 text-xs font-medium disabled:opacity-50"
                      >
                        {actionVideoId === video.id ? 'Reintentando...' : 'Reintentar'}
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
