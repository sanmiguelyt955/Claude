'use client'

import Link from 'next/link'
import { useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { formatDuration } from '@/lib/format'
import type { LibrarySearchResult } from '@/lib/types'

const SOURCE_LABEL: Record<LibrarySearchResult['source'], string> = {
  summary: 'Resumen',
  scene: 'Escena',
  transcript: 'Transcripcion',
  element: 'Objeto/texto',
  skill: 'Skill',
}

const MATCH_LABEL: Record<LibrarySearchResult['match_type'], string> = {
  semantic: 'similar',
  keyword: 'coincidencia exacta',
  both: 'similar + exacta',
}

/** Library-wide search box (PROJECT.md §28 bloque 8) — every video's memory, not just one. */
export function LibrarySearch() {
  const [value, setValue] = useState('')
  const [results, setResults] = useState<LibrarySearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const q = value.trim()
    if (!q) return
    setSearching(true)
    setError(null)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const body = (await res.json()) as { results?: LibrarySearchResult[]; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo buscar.')
      setResults(body.results ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Buscar en toda la biblioteca..."
          className="flex-1 rounded-md border border-(--color-line) bg-transparent px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
        />
        <button
          type="submit"
          disabled={searching || !value.trim()}
          className="rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {searching ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'oklch(0.62 0.22 25)' }}>
          {error}
        </p>
      )}

      {results && (
        <ul className="flex flex-col gap-2">
          {results.map((result) => (
            <li key={result.id} className="rounded-(--radius-card) border border-(--color-line) p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/videos/${result.video_id}`}
                  className="font-medium hover:text-(--color-accent)"
                >
                  {result.video_title}
                </Link>
                <StatusBadge status={result.video_status} />
              </div>
              <p className="mt-1 font-mono text-xs text-(--color-ink-soft)">
                {SOURCE_LABEL[result.source]}
                {result.start_seconds !== null && ` · ${formatDuration(result.start_seconds)}`}
                {' · '}
                {MATCH_LABEL[result.match_type]}
              </p>
              <p className="mt-1">{result.text}</p>
            </li>
          ))}
          {results.length === 0 && <p className="text-sm text-(--color-ink-soft)">Sin resultados.</p>}
        </ul>
      )}
    </div>
  )
}
