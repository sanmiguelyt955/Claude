'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { formatDuration, formatRelativeTime } from '@/lib/format'
import type { VideoRow } from '@/lib/types'

export function BibliotecaGrid() {
  const [videos, setVideos] = useState<VideoRow[] | null>(null)

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
      <div className="flex flex-col items-center gap-3 rounded-(--radius-card) border border-dashed border-(--color-line) py-16 text-center">
        <p className="text-(--color-ink-soft)">Todavia no analizaste ningun video.</p>
        <Link
          href="/cargar"
          className="rounded-full bg-(--color-accent) px-4 py-2 text-sm font-medium text-white"
        >
          Cargar tu primer video
        </Link>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {videos.map((video) => (
        <li key={video.id}>
          <Link
            href={`/videos/${video.id}`}
            className="flex h-full flex-col gap-2 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-sm font-medium">{video.title}</p>
              <StatusBadge status={video.status} />
            </div>
            <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-(--color-ink-soft)">
              {video.duration_seconds !== null && <span>{formatDuration(video.duration_seconds)}</span>}
              {video.width && video.height && (
                <span>
                  {video.width}x{video.height}
                </span>
              )}
              <span>{formatRelativeTime(video.created_at)}</span>
            </div>
            {video.activeJob?.progressLabel && (
              <p className="text-xs" style={{ color: 'var(--color-warn)' }}>
                {video.activeJob.progressLabel}
              </p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
