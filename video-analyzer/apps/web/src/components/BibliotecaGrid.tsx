'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { formatDuration, formatRelativeTime } from '@/lib/format'
import type { VideoRow } from '@/lib/types'

/** The video's still, or a placeholder until the file is on disk (or if FFmpeg cannot read it). */
function Thumbnail({ video }: { video: VideoRow }) {
  const [broken, setBroken] = useState(false)
  if (!video.stored_path || broken) {
    return (
      <div className="grid size-full place-items-center text-(--color-ink-soft)">
        <svg viewBox="0 0 24 24" className="size-10 opacity-40" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M10 9.5v5l4.5-2.5L10 9.5Z" fill="currentColor" />
        </svg>
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a local API route, nothing for next/image to optimise
    <img
      src={`/api/videos/${video.id}/thumbnail`}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
    />
  )
}

export function BibliotecaGrid() {
  const [videos, setVideos] = useState<VideoRow[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchMessage, setBatchMessage] = useState<string | null>(null)
  // null = todas; '' = sin carpeta; otherwise a folder name.
  const [folder, setFolder] = useState<string | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function analyzeTogether() {
    setBatchBusy(true)
    setBatchMessage(null)
    try {
      const res = await fetch('/api/videos/analyze-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: [...selected] }),
      })
      const body = (await res.json()) as { error?: string; separate?: boolean }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo encolar el lote.')
      setBatchMessage(
        body.separate
          ? `${selected.size} videos en cola: cada uno con su análisis completo, uno tras otro.`
          : `${selected.size} videos encolados en 1 sola petición.`,
      )
      setSelected(new Set())
    } catch (error) {
      setBatchMessage((error as Error).message)
    } finally {
      setBatchBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const res = await fetch('/api/videos', { cache: 'no-store' })
        const data = (await res.json()) as { videos: VideoRow[] }
        if (!cancelled) setVideos(data.videos)
      } catch {
        // Transient network hiccup during polling: keep the last known list.
      }
    }
    void refresh()
    const interval = setInterval(refresh, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (videos === null) {
    return <p className="text-sm text-(--color-ink-soft)">Cargando biblioteca...</p>
  }

  if (videos.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-4 border-dashed px-6 py-16 text-center">
        <span
          aria-hidden
          className="grid size-14 place-items-center rounded-2xl text-white"
          style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))' }}
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
          </svg>
        </span>
        <div>
          <p className="text-lg font-semibold">Tu biblioteca está vacía</p>
          <p className="mt-1 text-sm text-(--color-ink-soft)">Sube un video o pega un enlace de TikTok, Instagram o YouTube.</p>
        </div>
        <Link href="/cargar" className="btn-primary">
          Cargar tu primer video
        </Link>
      </div>
    )
  }

  const folders = [...new Set(videos.map((v) => v.folder).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b, 'es'))
  const activeFolder = folder !== null && folder !== '' && !folders.includes(folder) ? null : folder
  const shown = activeFolder === null ? videos : videos.filter((v) => (v.folder ?? '') === activeFolder)
  const selectable = shown.filter((v) => v.status === 'queued')

  const chip = (value: string | null, label: string, count: number) => (
    <button
      key={label}
      type="button"
      onClick={() => setFolder(value)}
      aria-pressed={activeFolder === value}
      className={
        activeFolder === value
          ? 'rounded-full bg-(--color-ink) px-3 py-1 text-xs font-medium text-(--color-canvas)'
          : 'rounded-full border border-(--color-line) bg-(--color-surface) px-3 py-1 text-xs hover:border-(--color-accent)'
      }
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  )
  const unfiled = videos.filter((v) => !v.folder).length

  return (
    <div className="flex flex-col gap-3">
      {folders.length > 0 && (
        <nav aria-label="Carpetas" className="flex flex-wrap gap-2">
          {chip(null, 'Todas', videos.length)}
          {folders.map((f) => chip(f, f, videos.filter((v) => v.folder === f).length))}
          {unfiled > 0 && chip('', 'Sin carpeta', unfiled)}
        </nav>
      )}

      {selectable.length > 1 && (
        <div className="card flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <span className="text-(--color-ink-soft)">
            {selected.size > 0
              ? `${selected.size} seleccionados`
              : `${selectable.length} videos listos para analizar`}
          </span>
          <button
            type="button"
            onClick={analyzeTogether}
            disabled={batchBusy || selected.size < 2}
            className="btn-primary !py-1.5"
          >
            {batchBusy ? 'Encolando…' : 'Analizar seleccionados'}
          </button>
          {batchMessage && <span className="text-(--color-ink-soft)">{batchMessage}</span>}
        </div>
      )}

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((video) => (
          <li key={video.id}>
            <Link
              href={`/videos/${video.id}`}
              className="card group flex h-full flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-lift)"
            >
              <div className="relative aspect-video overflow-hidden bg-(--color-surface-2)">
                <Thumbnail video={video} />
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
                {video.duration_seconds !== null && (
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white">
                    {formatDuration(video.duration_seconds)}
                  </span>
                )}
                <span className="absolute left-2 top-2">
                  <StatusBadge status={video.status} solid />
                </span>
                {video.status === 'queued' && (
                  <label
                    className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 text-[11px] text-white backdrop-blur"
                    onClick={(e) => {
                      // The whole card is a link; keep the click on the checkbox.
                      e.preventDefault()
                      e.stopPropagation()
                      toggle(video.id)
                    }}
                  >
                    <input type="checkbox" readOnly checked={selected.has(video.id)} className="accent-(--color-accent)" />
                    Lote
                  </label>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{video.title}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--color-ink-soft)">
                  <span>{formatRelativeTime(video.created_at)}</span>
                  {video.width && video.height && (
                    <span className="font-mono">
                      {video.width}×{video.height}
                    </span>
                  )}
                  {video.folder && activeFolder === null && <span className="chip">📁 {video.folder}</span>}
                </div>
                {video.activeJob?.progressLabel && (
                  <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-accent)' }}>
                    <span className="size-1.5 animate-pulse rounded-full bg-current" />
                    {video.activeJob.progressLabel}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
