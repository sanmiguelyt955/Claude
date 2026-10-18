'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { SegmentedControl } from './SegmentedControl'
import { AnalyzingProgress } from './AnalyzingProgress'
import { FolderField } from './FolderField'
import { VideoChat } from './VideoChat'
import { formatDuration, formatSize } from '@/lib/format'
import { ELEMENT_KIND_LABEL, IMPROVEMENT_KIND_LABEL } from '@/lib/status'
import type { VideoDetailResponse, SemanticSearchResult, SkillDetail } from '@/lib/types'

type Tab = 'resumen' | 'chat' | 'timeline' | 'transcripcion' | 'objetos' | 'texto' | 'skills' | 'detalles'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'chat', label: 'Chat' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'transcripcion', label: 'Transcripción' },
  { value: 'objetos', label: 'Objetos' },
  { value: 'texto', label: 'Texto' },
  { value: 'skills', label: 'Skills' },
  { value: 'detalles', label: 'Detalles' },
]

const OBJECT_KINDS = new Set(['object', 'person', 'action', 'relation'])

// One steady colour per "Hablante N", so a conversation reads at a glance.
const SPEAKER_COLORS = ['var(--color-accent)', 'oklch(0.66 0.16 155)', 'oklch(0.7 0.16 60)', 'var(--color-accent-2)', 'oklch(0.65 0.17 20)']
function speakerColor(speaker: string): string {
  const n = Number(/(\d+)/.exec(speaker)?.[1] ?? 0)
  return SPEAKER_COLORS[(Math.max(n, 1) - 1) % SPEAKER_COLORS.length]!
}

export function VideoDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<VideoDetailResponse | null>(null)
  const [tab, setTab] = useState<Tab>('resumen')
  const [actionBusy, setActionBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchNotice, setSearchNotice] = useState<string | null>(null)
  const [generatedSkills, setGeneratedSkills] = useState<SkillDetail[]>([])
  const [exportedNote, setExportedNote] = useState<string | null>(null)
  const [improveSkillId, setImproveSkillId] = useState('')
  const [improveExternalPath, setImproveExternalPath] = useState('')
  const playerRef = useRef<HTMLVideoElement>(null)
  // ?t=SECONDS (from a library search hit) opens the video at that moment.
  const startAt = useRef<number | null>(null)
  useEffect(() => {
    const t = Number(new URLSearchParams(window.location.search).get('t'))
    if (Number.isFinite(t) && t > 0) startAt.current = t
  }, [])

  /** Jumps the player to a moment cited anywhere on the page. */
  function seek(seconds: number) {
    const player = playerRef.current
    if (!player) return
    player.currentTime = Math.max(0, seconds)
    void player.play().catch(() => {})
    player.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  const At = ({ seconds }: { seconds: number | null }) =>
    seconds === null ? null : (
      <button type="button" className="timestamp" onClick={() => seek(seconds)} title="Ver en el video">
        {formatDuration(seconds)}
      </button>
    )

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
      const body = (await res.json()) as { results?: SemanticSearchResult[]; error?: string; notice?: string | null }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo buscar.')
      setSearchResults(body.results ?? [])
      setSearchNotice(body.notice ?? null)
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
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href="/" className="w-fit text-sm text-(--color-ink-soft) hover:text-(--color-ink)">
        ← Biblioteca
      </Link>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="card overflow-hidden bg-black">
          {video.stored_path ? (
            <video
              ref={playerRef}
              src={`/api/videos/${video.id}/media`}
              poster={`/api/videos/${video.id}/thumbnail`}
              controls
              preload="metadata"
              onLoadedMetadata={() => {
                if (startAt.current !== null) {
                  seek(startAt.current)
                  startAt.current = null
                }
              }}
              className="aspect-video w-full bg-black"
            />
          ) : (
            <div className="grid aspect-video place-items-center text-sm text-white/60">
              {video.source_kind === 'url' ? 'El video se ve desde su enlace original.' : 'Preparando el video…'}
            </div>
          )}
        </div>

        <header className="flex flex-col gap-4">
          <div className="flex flex-col items-start gap-3">
            <StatusBadge status={video.status} />
            <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{video.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-(--color-ink-soft)">
            {video.duration_seconds !== null && <span className="chip">⏱ {formatDuration(video.duration_seconds)}</span>}
            {video.width && video.height && (
              <span className="chip font-mono">
                {video.width}×{video.height}
                {video.fps ? ` · ${video.fps.toFixed(0)} fps` : ''}
              </span>
            )}
            <span className="chip max-w-full truncate">
              {video.source_kind === 'url' && video.source_url ? (
                <a href={video.source_url} target="_blank" rel="noreferrer" className="hover:text-(--color-accent)">
                  🔗 {new URL(video.source_url).hostname.replace(/^www\./, '')}
                </a>
              ) : (
                '💾 Archivo local'
              )}
            </span>
          </div>
          <FolderField videoId={video.id} folder={video.folder} />
          {video.status === 'ready' && summary && (
            <p className="text-[15px] leading-relaxed text-(--color-ink-soft)">{summary.short_summary}</p>
          )}
        </header>
      </section>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-(--radius-card) border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)', background: 'color-mix(in oklch, var(--color-danger) 8%, transparent)' }}
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
          className="btn-primary w-fit"
        >
          {actionBusy ? 'Iniciando…' : '✨ Analizar el video'}
        </button>
      )}

      {video.status === 'analyzing' && (
        <AnalyzingProgress
          label={video.activeJob?.progressLabel ?? null}
          startedAt={video.activeJob?.startedAt ?? video.updated_at}
          current={video.activeJob?.progressCurrent}
          total={video.activeJob?.progressTotal}
        />
      )}

      {video.status === 'failed' && (
        <div className="card flex flex-col gap-3 p-5" style={{ borderColor: 'color-mix(in oklch, var(--color-danger) 45%, var(--color-line))' }}>
          <p className="font-semibold" style={{ color: 'var(--color-danger)' }}>
            El análisis no se pudo completar
          </p>
          <p className="break-words font-mono text-xs leading-relaxed text-(--color-ink-soft)">{video.error_message}</p>
          <button type="button" onClick={handleRetry} disabled={actionBusy} className="btn-primary w-fit">
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
              className="btn-ghost w-fit"
            >
              {actionBusy ? 'Exportando…' : 'Exportar todo a Obsidian'}
            </button>
            {exportedNote && (
              <span className="text-sm" style={{ color: 'var(--color-ok)' }}>
                Guardado en el vault: {exportedNote}
              </span>
            )}
          </div>

          <SegmentedControl options={TABS} value={tab} onChange={setTab} />

          {tab === 'chat' && <VideoChat videoId={id} ready={video.status === 'ready'} onSeek={video.stored_path ? seek : undefined} />}

          {tab === 'resumen' && summary && (
            <div className="flex flex-col gap-3">
              <div className="card flex flex-col gap-3 p-5">
                <p className="text-lg font-semibold leading-snug">{summary.short_summary}</p>
                <p className="leading-relaxed text-(--color-ink-soft)">{summary.full_summary}</p>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((topic) => (
                    <span key={topic} className="chip">
                      #{topic}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs text-(--color-ink-soft)">
                {analysisRuns
                  .filter((r) => r.succeeded && r.model !== 'perception')
                  .map((run, i) => (
                    <span key={i} className="chip font-mono">
                      {run.model}
                      {run.processing_mode ? ` (${run.processing_mode})` : ''}
                      {(run.input_tokens ?? 0) + (run.output_tokens ?? 0) > 0
                        ? ` · ${(run.input_tokens ?? 0) + (run.output_tokens ?? 0)} tokens`
                        : ''}
                      {(run.estimated_cost_usd ?? 0) > 0 ? ` · $${(run.estimated_cost_usd ?? 0).toFixed(4)}` : ''}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {tab === 'timeline' && (
            <ol className="relative flex flex-col gap-4 border-l-2 border-(--color-line) pl-5">
              {scenes.map((scene) => {
                const inScene = (start: number, end: number | null) =>
                  start < scene.end_seconds && (end ?? start) >= scene.start_seconds
                const sceneText = textElements.filter((e) => inScene(e.start_seconds, e.end_seconds))
                const said = transcript.filter((t) => inScene(t.start_seconds, t.end_seconds))
                const middle = (scene.start_seconds + scene.end_seconds) / 2
                return (
                  <li key={scene.scene_index} className="relative">
                    <span
                      aria-hidden
                      className="absolute -left-[27px] top-1.5 size-3 rounded-full ring-4 ring-(--color-canvas)"
                      style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))' }}
                    />
                    <div className="card flex flex-col gap-3 p-3 sm:flex-row">
                      {video.stored_path && (
                        <button
                          type="button"
                          onClick={() => seek(scene.start_seconds)}
                          className="shrink-0 self-start overflow-hidden rounded-xl bg-black sm:w-48"
                          aria-label={`Ver la escena desde ${formatDuration(scene.start_seconds)}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/videos/${video.id}/frame?t=${middle.toFixed(1)}`}
                            alt={`Fotograma de «${scene.title}»`}
                            loading="lazy"
                            className="aspect-video w-full object-cover"
                          />
                        </button>
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <p className="flex items-center gap-1.5 text-xs text-(--color-ink-soft)">
                          <At seconds={scene.start_seconds} /> – {formatDuration(scene.end_seconds)}
                        </p>
                        <p className="font-semibold">{scene.title}</p>
                        <p className="text-sm">
                          <span className="font-medium">Imagen: </span>
                          <span className="text-(--color-ink-soft)">{scene.description}</span>
                        </p>
                        {(scene.audio_description || video.stored_path) && (
                          <div className="flex flex-col gap-1 text-sm">
                            {scene.audio_description && (
                              <p>
                                <span className="font-medium">Audio: </span>
                                <span className="text-(--color-ink-soft)">{scene.audio_description}</span>
                              </p>
                            )}
                            {video.stored_path && (
                              <audio
                                controls
                                preload="none"
                                src={`/api/videos/${video.id}/audio?start=${scene.start_seconds.toFixed(1)}&end=${scene.end_seconds.toFixed(1)}`}
                                className="h-8 w-full max-w-sm"
                                aria-label={`Escuchar «${scene.title}»`}
                              />
                            )}
                          </div>
                        )}
                        {sceneText.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 text-sm">
                            <span className="font-medium">Texto en pantalla:</span>
                            {sceneText.map((el, i) => (
                              <span key={i} className="chip" title={el.detail ?? undefined}>
                                {el.label}
                              </span>
                            ))}
                          </div>
                        )}
                        {said.length > 0 && (
                          <details className="text-sm">
                            <summary className="font-medium">Lo que se dice ({said.length} frases)</summary>
                            <div className="mt-1 flex flex-col gap-1 text-(--color-ink-soft)">
                              {said.map((t) => (
                                <p key={t.chunk_index}>
                                  {t.speaker && (
                                    <span className="mr-1 font-semibold" style={{ color: speakerColor(t.speaker) }}>
                                      {t.speaker}:
                                    </span>
                                  )}
                                  {t.text}
                                </p>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {tab === 'transcripcion' && (
            <div className="flex flex-col gap-1">
              {transcript.map((chunk) => (
                <div key={chunk.chunk_index} className="flex gap-3 rounded-xl px-2 py-1.5 hover:bg-(--color-surface-2)">
                  <span className="pt-0.5">
                    <At seconds={chunk.start_seconds} />
                  </span>
                  <p className="leading-relaxed">
                    {chunk.speaker && (
                      <span className="mr-1.5 font-semibold" style={{ color: speakerColor(chunk.speaker) }}>
                        {chunk.speaker}
                      </span>
                    )}
                    {chunk.text}
                  </p>
                </div>
              ))}
              {transcript.length === 0 && (
                <p className="text-sm text-(--color-ink-soft)">Este video no tiene dialogo detectado.</p>
              )}
            </div>
          )}

          {tab === 'objetos' && (
            <ul className="flex flex-col gap-2">
              {objectElements.map((el, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <At seconds={el.start_seconds} />
                  <span className="chip">{ELEMENT_KIND_LABEL[el.kind]}</span>
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
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <At seconds={el.start_seconds} />
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
            {searchNotice && <p className="text-sm text-(--color-ink-soft)">{searchNotice}</p>}
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
