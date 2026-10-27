'use client'

import { useEffect, useState } from 'react'

/**
 * The video's library folder, editable in place. Existing folders are
 * offered as suggestions; an empty name takes the video out of its folder.
 */
export function FolderField({ videoId, folder }: { videoId: string; folder: string | null }) {
  const [value, setValue] = useState(folder ?? '')
  const [saved, setSaved] = useState(folder ?? '')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/videos', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { videos: [] }))
      .then((body: { videos?: Array<{ folder: string | null }> }) =>
        setSuggestions([...new Set((body.videos ?? []).map((v) => v.folder).filter((f): f is string => !!f))].sort()),
      )
      .catch(() => setSuggestions([]))
  }, [])

  async function save() {
    if (value.trim() === saved) return
    setError(null)
    const res = await fetch(`/api/videos/${videoId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ folder: value }),
    }).catch(() => null)
    const body = res ? ((await res.json().catch(() => ({}))) as { folder?: string | null; error?: string }) : {}
    if (!res?.ok) {
      setError(body.error ?? 'No se pudo guardar la carpeta.')
      return
    }
    setValue(body.folder ?? '')
    setSaved(body.folder ?? '')
  }

  return (
    <label className="flex items-center gap-2 text-xs text-(--color-ink-soft)">
      📁
      <input
        type="text"
        value={value}
        list={`folders-${videoId}`}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        placeholder="Sin carpeta"
        maxLength={60}
        aria-label="Carpeta"
        className="w-44 rounded border border-transparent bg-transparent px-1 py-0.5 outline-none hover:border-(--color-line) focus:border-(--color-accent)"
      />
      <datalist id={`folders-${videoId}`}>
        {suggestions.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {error && <span role="alert">{error}</span>}
    </label>
  )
}
