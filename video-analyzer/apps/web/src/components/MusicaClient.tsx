'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatDuration } from '@/lib/format'

type Found = {
  source: string
  sourceId: string
  title: string
  artist: string
  license: { code: string; label: string; url: string | null }
  verdict: 'ok' | 'warn' | 'refused'
  verified: boolean
  durationSec: number | null
  audioUrl: string
  pageUrl: string | null
  credit: string
  saved: { id: string } | null
}
type Saved = {
  id: string
  source: string
  title: string
  artist: string
  license: { code: string; version: string | null; url: string | null }
  shareAlike: boolean
  verified: boolean
  credit: string
  pageUrl: string | null
  durationSec: number | null
}
type Problem = { source: string; label: string; message: string }

const SOURCE_LABEL: Record<string, string> = { archive: 'Internet Archive', incompetech: 'Incompetech', openverse: 'Openverse', jamendo: 'Jamendo' }

function CopyCredit({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  if (!text) return <span className="text-xs text-(--color-ink-soft)">Sin crédito obligatorio</span>
  return (
    <button
      type="button"
      className="btn-ghost !px-3 !py-1 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        } catch {
          window.prompt('Copia el crédito:', text)
        }
      }}
    >
      {done ? 'Copiado ✓' : 'Copiar crédito'}
    </button>
  )
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <span className="chip" style={tone === 'warn' ? { color: 'var(--color-warn)' } : undefined}>
      {children}
    </span>
  )
}

/** Search free-licence music, preview it, save it with its credit. */
export function MusicaClient() {
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<Found[] | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [library, setLibrary] = useState<Saved[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const loadLibrary = useCallback(async () => {
    const res = await fetch('/api/music')
    if (res.ok) setLibrary(((await res.json()) as { tracks: Saved[] }).tracks)
  }, [])
  useEffect(() => {
    void loadLibrary()
  }, [loadLibrary])

  async function search(event: React.FormEvent) {
    event.preventDefault()
    const text = q.trim()
    if (!text) return
    setSearching(true)
    setError(null)
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(text)}`)
      const body = (await res.json()) as { tracks?: Found[]; problems?: Problem[]; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo buscar.')
      setFound(body.tracks ?? [])
      setProblems(body.problems ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  async function save(t: Found) {
    const key = `${t.source}:${t.sourceId}`
    setBusy(key)
    setError(null)
    try {
      const res = await fetch('/api/music', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: t.source, sourceId: t.sourceId }) })
      const body = (await res.json()) as { track?: Saved; error?: string }
      if (!res.ok || !body.track) throw new Error(body.error ?? 'No se pudo guardar.')
      setFound((list) => list?.map((x) => (x.source === t.source && x.sourceId === t.sourceId ? { ...x, saved: { id: body.track!.id } } : x)) ?? null)
      await loadLibrary()
    } catch (e) {
      setError(`"${t.title}": ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function remove(t: Saved) {
    if (!window.confirm(`¿Quitar "${t.title}" de tu biblioteca? Se borra el archivo guardado.`)) return
    const res = await fetch(`/api/music/${t.id}`, { method: 'DELETE' })
    if (!res.ok) return setError('No se pudo quitar la pieza.')
    setFound((list) => list?.map((x) => (x.saved?.id === t.id ? { ...x, saved: null } : x)) ?? null)
    await loadLibrary()
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-label="Buscar música">
        <form onSubmit={search} className="card flex items-center gap-2 !rounded-full p-1.5 pl-4 focus-within:border-(--color-accent)">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Estilo, instrumento o ánimo: piano, medieval, tranquila…"
            aria-label="Buscar música libre"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-(--color-ink-soft)"
          />
          <button type="submit" disabled={searching || !q.trim()} className="btn-primary !py-2">
            {searching ? 'Buscando…' : 'Buscar'}
          </button>
        </form>

        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
        {problems.length > 0 && (
          <ul className="text-xs text-(--color-ink-soft)">
            {problems.map((p) => (
              <li key={p.source}>
                {p.label}: {p.message}
              </li>
            ))}
          </ul>
        )}

        {found && found.length === 0 && <p className="text-sm text-(--color-ink-soft)">No encontré piezas con licencia comercial para esa búsqueda.</p>}
        {found && found.length > 0 && (
          <ul className="flex flex-col gap-2">
            {found.map((t) => (
              <li key={`${t.source}:${t.sourceId}`} className="card flex flex-col gap-2 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="text-xs text-(--color-ink-soft)">
                      {t.artist}
                      {t.durationSec ? ` · ${formatDuration(t.durationSec)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip>{SOURCE_LABEL[t.source] ?? t.source}</Chip>
                    <Chip>{t.license.label}</Chip>
                    {t.verdict === 'warn' && <Chip tone="warn">Compartir igual</Chip>}
                  </div>
                </div>
                <audio controls preload="none" src={t.saved ? `/api/music/${t.saved.id}/file` : t.audioUrl} className="w-full" />
                {t.verdict === 'warn' && (
                  <p className="text-xs" style={{ color: 'var(--color-warn)' }}>
                    BY-SA: lo que hagas con esta pieza debe publicarse con la misma licencia. Evítala si no quieres eso.
                  </p>
                )}
                {!t.verified && (
                  <p className="text-xs text-(--color-ink-soft)">
                    Licencia declarada por quien la subió: confírmala en{' '}
                    {t.pageUrl ? (
                      <a href={t.pageUrl} target="_blank" rel="noreferrer" className="underline">
                        la página de la pieza
                      </a>
                    ) : (
                      'la fuente'
                    )}{' '}
                    antes de usarla en algo importante.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {t.saved ? <Chip>Guardada ✓</Chip> : (
                    <button type="button" className="btn-primary !px-3 !py-1 text-xs" disabled={busy === `${t.source}:${t.sourceId}`} onClick={() => void save(t)}>
                      {busy === `${t.source}:${t.sourceId}` ? 'Guardando…' : 'Guardar en mi biblioteca'}
                    </button>
                  )}
                  <CopyCredit text={t.credit} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-label="Mi biblioteca de música">
        <h2 className="text-lg font-semibold tracking-tight">Mi biblioteca ({library.length})</h2>
        {library.length === 0 && <p className="text-sm text-(--color-ink-soft)">Aún no guardas ninguna pieza.</p>}
        <ul className="flex flex-col gap-2">
          {library.map((t) => (
            <li key={t.id} className="card flex flex-col gap-2 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className="text-xs text-(--color-ink-soft)">
                    {t.artist}
                    {t.durationSec ? ` · ${formatDuration(t.durationSec)}` : ''} · {SOURCE_LABEL[t.source] ?? t.source}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a className="btn-ghost !px-3 !py-1 text-xs" href={`/api/music/${t.id}/file`} download>
                    Descargar
                  </a>
                  <CopyCredit text={t.credit} />
                  <button type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={() => void remove(t)}>
                    Quitar
                  </button>
                </div>
              </div>
              <audio controls preload="none" src={`/api/music/${t.id}/file`} className="w-full" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
