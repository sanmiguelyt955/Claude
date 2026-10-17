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
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const q = value.trim()
    if (!q) return
    setSearching(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const body = (await res.json()) as { results?: LibrarySearchResult[]; error?: string; notice?: string | null }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo buscar.')
      setResults(body.results ?? [])
      setNotice(body.notice ?? null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={handleSubmit}
        className="card flex items-center gap-2 !rounded-full p-1.5 pl-4 focus-within:border-(--color-accent)"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 text-(--color-ink-soft)" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Busca en todos tus videos…"
          aria-label="Buscar en toda la biblioteca"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-(--color-ink-soft)"
        />
        <button type="submit" disabled={searching || !value.trim()} className="btn-primary !py-2">
          {searching ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {notice && <p className="text-sm text-(--color-ink-soft)">{notice}</p>}
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {results && (
        <ul className="flex flex-col gap-2">
          {results.map((result) => (
            <li key={result.id} className="card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/videos/${result.video_id}${result.start_seconds !== null ? `?t=${Math.floor(result.start_seconds)}` : ''}`}
                  className="font-semibold hover:text-(--color-accent)"
                >
                  {result.video_title}
                </Link>
                <StatusBadge status={result.video_status} />
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-(--color-ink-soft)">
                {result.start_seconds !== null && <span className="timestamp">{formatDuration(result.start_seconds)}</span>}
                <span>{SOURCE_LABEL[result.source]}</span>
                <span>· {MATCH_LABEL[result.match_type]}</span>
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
