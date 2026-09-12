'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { SegmentedControl } from './SegmentedControl'
import { AnalyzingProgress } from './AnalyzingProgress'
import { formatDuration, formatSize } from '@/lib/format'
import { ELEMENT_KIND_LABEL, IMPROVEMENT_KIND_LABEL } from '@/lib/status'
import type { VideoDetailResponse, SemanticSearchResult, SkillDetail } from '@/lib/types'

type Tab = 'resumen' | 'timeline' | 'transcripcion' | 'objetos' | 'texto' | 'skills' | 'detalles'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'transcripcion', label: 'Transcripcion' },
  { value: 'objetos', label: 'Objetos' },
  { value: 'texto', label: 'Texto' },
  { value: 'skills', label: 'Skills' },
  { value: 'detalles', label: 'Detalles' },
]

const OBJECT_KINDS = new Set(['object', 'person', 'action', 'relation'])

export function VideoDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<VideoDetailResponse | null>(null)
  const [tab, setTab] = useState<Tab>('resumen')
  const [actionBusy, setActionBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [generatedSkills, setGeneratedSkills] = useState<SkillDetail[]>([])
  const [exportedNote, setExportedNote] = useState<string | null>(null)
  const [improveSkillId, setImproveSkillId] = useState('')
  const [improveExternalPath, setImproveExternalPath] = useState('')

  async function refresh() {
    try {
      const res = await fetch(`/api/videos/${id}`, { cache: 'no-store' })
      if (!res.ok) return
      const detail = (await res.json()) as VideoDetailResponse
      setData(detail)
    } catch {
      // Transient network hiccup during polling: keep the last known state.
    }
  }

  useEffect(() => {
    void refresh()
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    fetch('/api/skills')
      .then((res) => res.json())
      .then((body: { skills?: SkillDetail[] }) => setGeneratedSkills(body.skills ?? []))
      .catch(() => {
        // The "Mejorar Skill" dropdown just stays empty; not worth surfacing an error for.
      })
  }, [])

  async function handleAnalyze() {
    setActionBusy(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/videos/${id}/analyze`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo iniciar el analisis.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleExportVault() {
    setActionBusy(true)
    setErrorMessage(null)
    setExportedNote(null)
    try {
      const res = await fetch(`/api/videos/${id}/export-vault`, { method: 'POST' })
      const body = (await res.json()) as { error?: string; noteName?: string; notePath?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo exportar al vault.')
      setExportedNote(body.noteName ?? 'Nota creada')
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDetectSkills() {
    setActionBusy(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/videos/${id}/detect-skills`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo iniciar la deteccion de skills.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleGenerateSkill(skillId: string) {
    setActionBusy(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/skills/${skillId}/generate`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo generar la skill.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDiscardSkill(skillId: string) {
    setActionBusy(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/skills/${skillId}/discard`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo descartar la skill.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleImproveSkill() {
    setActionBusy(true)
    setErrorMessage(null)
    try {
      const body = improveSkillId ? { skillId: improveSkillId } : { sourceSkillPath: improveExternalPath.trim() }
      const res = await fetch(`/api/videos/${id}/improve-skill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const resBody = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(resBody.error ?? 'No se pudo iniciar la comparacion.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleApplyImprovement(improvementId: string) {
    setActionBusy(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/skill-improvements/${improvementId}/apply`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo aplicar la mejora.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleIgnoreImprovement(improvementId: string) {
    setActionBusy(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/skill-improvements/${improvementId}/ignore`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo ignorar la mejora.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleRetry() {
    setActionBusy(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/videos/${id}/retry`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo reintentar.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!searchValue.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/videos/${id}/search?q=${encodeURIComponent(searchValue.trim())}`)
      const body = (await res.json()) as { results?: SemanticSearchResult[]; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo buscar.')
      setSearchResults(body.results ?? [])
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setSearching(false)
    }
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-(--color-ink-soft)">Cargando...</p>
      </main>
    )
  }

  const { video, summary, scenes, transcript, elements, analysisRuns, skills, skillImprovements } = data
  const objectElements = elements.filter((e) => OBJECT_KINDS.has(e.kind))
  const textElements = elements.filter((e) => e.kind === 'on_screen_text')
  const topics = summary ? (JSON.parse(summary.topics_json) as string[]) : []

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <Link href="/" className="text-sm text-(--color-ink-soft) hover:text-(--color-ink)">
        ← Biblioteca
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{video.title}</h1>
          <StatusBadge status={video.status} />
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
        </div>
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

      {(video.status === 'pending' || video.status === 'probing') && (
        <p className="text-sm text-(--color-ink-soft)">FFmpeg esta leyendo la metadata del video...</p>
      )}

      {video.status === 'queued' && (
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={actionBusy}
          className="w-fit rounded-full bg-(--color-accent) px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {actionBusy ? 'Iniciando...' : 'Generar analisis del video'}
        </button>
      )}

      {video.status === 'analyzing' && (
        <AnalyzingProgress label={video.activeJob?.progressLabel ?? null} startedAt={video.updated_at} />
      )}

      {video.status === 'failed' && (
        <div className="flex flex-col gap-3 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-4">
          <p className="text-sm" style={{ color: 'oklch(0.62 0.22 25)' }}>
            {video.error_message}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            disabled={actionBusy}
            className="w-fit rounded-full border border-(--color-line) px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {actionBusy ? 'Reintentando...' : 'Reintentar'}
          </button>
        </div>
      )}

      {video.status === 'ready' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportVault}
              disabled={actionBusy}
              className="w-fit rounded-full border border-(--color-line) px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {actionBusy ? 'Exportando...' : 'Exportar todo a Obsidian'}
            </button>
            {exportedNote && (
              <span className="text-sm" style={{ color: 'var(--color-ok)' }}>
                Guardado en el vault: {exportedNote}
              </span>
            )}
          </div>

          <SegmentedControl options={TABS} value={tab} onChange={setTab} />

          {tab === 'resumen' && summary && (
            <div className="flex flex-col gap-3">
              <p className="font-medium">{summary.short_summary}</p>
              <p className="text-(--color-ink-soft)">{summary.full_summary}</p>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((topic) => (
                  <span key={topic} className="rounded-full border border-(--color-line) px-2.5 py-1 text-xs">
                    {topic}
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-1 border-t border-(--color-line) pt-3">
                {analysisRuns
                  .filter((r) => r.succeeded)
                  .map((run, i) => (
                    <p key={i} className="font-mono text-xs text-(--color-ink-soft)">
                      {run.phase} · {run.model} ({run.processing_mode ?? '?'}):{' '}
                      {(run.input_tokens ?? 0) + (run.output_tokens ?? 0)} tokens · $
                      {(run.estimated_cost_usd ?? 0).toFixed(4)}
                    </p>
                  ))}
              </div>
            </div>
          )}

          {tab === 'timeline' && (
            <ol className="flex flex-col gap-3">
              {scenes.map((scene) => (
                <li key={scene.scene_index} className="border-l-2 border-(--color-accent) pl-3">
                  <p className="font-mono text-xs text-(--color-ink-soft)">
                    {formatDuration(scene.start_seconds)} – {formatDuration(scene.end_seconds)}
                  </p>
                  <p className="font-medium">{scene.title}</p>
                  <p className="text-(--color-ink-soft)">{scene.description}</p>
                  {scene.audio_description && (
                    <p className="text-xs italic text-(--color-ink-soft)">Audio: {scene.audio_description}</p>
                  )}
                </li>
              ))}
            </ol>
          )}

          {tab === 'transcripcion' && (
            <div className="flex flex-col gap-2">
              {transcript.map((chunk) => (
                <p key={chunk.chunk_index}>
                  <span className="font-mono text-xs text-(--color-ink-soft)">
                    {formatDuration(chunk.start_seconds)}
                  </span>{' '}
                  {chunk.speaker && <span className="font-medium">{chunk.speaker}: </span>}
                  {chunk.text}
                </p>
              ))}
              {transcript.length === 0 && (
                <p className="text-sm text-(--color-ink-soft)">Este video no tiene dialogo detectado.</p>
              )}
            </div>
          )}

          {tab === 'objetos' && (
            <ul className="flex flex-col gap-2">
              {objectElements.map((el, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-xs text-(--color-ink-soft)">
                    {formatDuration(el.start_seconds)}
                  </span>
                  <span className="rounded-full border border-(--color-line) px-1.5 py-0.5 text-xs">
                    {ELEMENT_KIND_LABEL[el.kind]}
                  </span>
                  <span className="font-medium">{el.label}</span>
                  {el.detail && <span className="text-(--color-ink-soft)">— {el.detail}</span>}
                </li>
              ))}
              {objectElements.length === 0 && (
                <p className="text-sm text-(--color-ink-soft)">No se detectaron objetos, personas o acciones.</p>
              )}
            </ul>
          )}

          {tab === 'texto' && (
            <ul className="flex flex-col gap-2">
              {textElements.map((el, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-xs text-(--color-ink-soft)">
                    {formatDuration(el.start_seconds)}
                  </span>
                  <span className="font-medium">{el.label}</span>
                  {el.detail && <span className="text-(--color-ink-soft)">— {el.detail}</span>}
                </li>
              ))}
              {textElements.length === 0 && (
                <p className="text-sm text-(--color-ink-soft)">No se detecto texto en pantalla.</p>
              )}
            </ul>
          )}

          {tab === 'skills' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-(--color-ink-soft)">
                  Procesos o metodos reutilizables detectados en este video (PROJECT.md §12).
                </p>
                <button
                  type="button"
                  onClick={handleDetectSkills}
                  disabled={actionBusy}
                  className="w-fit shrink-0 rounded-full border border-(--color-line) px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {actionBusy ? 'Procesando...' : 'Detectar skills'}
                </button>
              </div>

              {skills.length === 0 && (
                <p className="text-sm text-(--color-ink-soft)">
                  Todavia no se ha buscado. Cada busqueda gasta una peticion del cupo diario de Gemini.
                </p>
              )}

              <ul className="flex flex-col gap-3">
                {skills
                  .filter((s) => s.status !== 'discarded')
                  .map((skill) => (
                    <li key={skill.id} className="flex flex-col gap-2 rounded-(--radius-card) border border-(--color-line) p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-xs text-(--color-ink-soft)">
                            {skill.start_seconds !== null && formatDuration(skill.start_seconds)}
                            {skill.end_seconds !== null && ` – ${formatDuration(skill.end_seconds)}`}
                          </p>
                          <p className="font-medium">{skill.name}</p>
                        </div>
                        {skill.confidence !== null && (
                          <span className="shrink-0 rounded-full border border-(--color-line) px-2 py-0.5 text-xs">
                            {Math.round(skill.confidence * 100)}% confianza
                          </span>
                        )}
                      </div>
                      <p className="text-(--color-ink-soft)">{skill.description}</p>

                      {skill.status === 'detected' && (
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleGenerateSkill(skill.id)}
                            disabled={actionBusy}
                            className="rounded-full bg-(--color-accent) px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                          >
                            Crear Skill
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDiscardSkill(skill.id)}
                            disabled={actionBusy}
                            className="rounded-full border border-(--color-line) px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                          >
                            Descartar
                          </button>
                        </div>
                      )}

                      {skill.status === 'generating' && (
                        <p className="text-sm text-(--color-ink-soft)">Generando SKILL.md...</p>
                      )}

                      {skill.status === 'generated' && (
                        <p className="rounded-md bg-(--color-surface) px-3 py-2 font-mono text-xs">
                          Guardada en: {skill.output_path}
                        </p>
                      )}
                    </li>
                  ))}
              </ul>

              <div className="mt-2 flex flex-col gap-3 border-t border-(--color-line) pt-4">
                <h2 className="text-sm font-semibold">Mejorar una skill existente con este video</h2>
                <p className="text-sm text-(--color-ink-soft)">
                  Compara una Skill ya generada (de este video o de otro) contra lo que este video ensena, y
                  propone mejoras concretas (PROJECT.md §13).
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={improveSkillId}
                    onChange={(e) => {
                      setImproveSkillId(e.target.value)
                      if (e.target.value) setImproveExternalPath('')
                    }}
                    className="flex-1 rounded-md border border-(--color-line) bg-transparent px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
                  >
                    <option value="">— Elegir una skill generada —</option>
                    {generatedSkills.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="self-center text-xs text-(--color-ink-soft)">o</span>
                  <input
                    type="text"
                    value={improveExternalPath}
                    onChange={(e) => {
                      setImproveExternalPath(e.target.value)
                      if (e.target.value) setImproveSkillId('')
                    }}
                    placeholder="Ruta a un SKILL.md en el disco..."
                    className="flex-1 rounded-md border border-(--color-line) bg-transparent px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleImproveSkill}
                  disabled={actionBusy || (!improveSkillId && !improveExternalPath.trim())}
                  className="w-fit rounded-full bg-(--color-accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {actionBusy ? 'Comparando...' : 'Comparar'}
                </button>

                <ul className="flex flex-col gap-3">
                  {skillImprovements
                    .filter((imp) => imp.status !== 'ignored')
                    .map((imp) => (
                      <li key={imp.id} className="flex flex-col gap-2 rounded-(--radius-card) border border-(--color-line) p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="rounded-full border border-(--color-line) px-2 py-0.5 text-xs">
                              {IMPROVEMENT_KIND_LABEL[imp.kind]}
                            </span>
                            <p className="mt-1 font-medium">{imp.title}</p>
                          </div>
                          {imp.start_seconds !== null && (
                            <span className="shrink-0 font-mono text-xs text-(--color-ink-soft)">
                              {formatDuration(imp.start_seconds)}
                              {imp.end_seconds !== null && ` – ${formatDuration(imp.end_seconds)}`}
                            </span>
                          )}
                        </div>
                        <p className="text-(--color-ink-soft)">{imp.rationale}</p>
                        {imp.status === 'proposed' && (
                          <div className="mt-1 flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleApplyImprovement(imp.id)}
                              disabled={actionBusy}
                              className="rounded-full bg-(--color-accent) px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                            >
                              Aplicar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleIgnoreImprovement(imp.id)}
                              disabled={actionBusy}
                              className="rounded-full border border-(--color-line) px-4 py-1.5 text-sm font-medium disabled:opacity-50"
                            >
                              Ignorar
                            </button>
                          </div>
                        )}
                        {imp.status === 'applied' && (
                          <p className="text-sm" style={{ color: 'var(--color-ok)' }}>
                            Aplicada — el SKILL.md ya se actualizo.
                          </p>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'detalles' && (
            <dl className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
              {[
                ['Contenedor', video.container ?? '—'],
                ['Codec de video', video.video_codec ?? '—'],
                ['Codec de audio', video.audio_codec ?? '—'],
                ['Tiene audio', video.has_audio ? 'Si' : 'No'],
                ['Tamano', formatSize(video.size_bytes)],
                ['Hash (SHA-256)', video.content_hash ?? '—'],
                ['Creado', new Date(video.created_at).toLocaleString('es')],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <dt className="text-(--color-ink-soft)">{label}</dt>
                  <dd className="truncate font-mono text-xs">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-4 flex flex-col gap-3 border-t border-(--color-line) pt-4">
            <h2 className="text-sm font-semibold">Buscar en este video</h2>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Ej: donde habla del precio..."
                className="flex-1 rounded-md border border-(--color-line) bg-transparent px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
              />
              <button
                type="submit"
                disabled={searching || !searchValue.trim()}
                className="rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {searching ? 'Buscando...' : 'Buscar'}
              </button>
            </form>
            {searchResults && (
              <ul className="flex flex-col gap-2">
                {searchResults.map((result) => (
                  <li key={result.id} className="rounded-md border border-(--color-line) p-2.5 text-sm">
                    <p className="font-mono text-xs text-(--color-ink-soft)">
                      {result.source}
                      {result.start_seconds !== null && ` · ${formatDuration(result.start_seconds)}`}
                    </p>
                    <p>{result.text}</p>
                  </li>
                ))}
                {searchResults.length === 0 && (
                  <p className="text-sm text-(--color-ink-soft)">Sin resultados.</p>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
