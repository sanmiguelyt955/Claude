'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { StatusBadge } from './StatusBadge'
import { SegmentedControl } from './SegmentedControl'
import { AnalyzingProgress } from './AnalyzingProgress'
import { FolderField } from './FolderField'
import { VideoChat } from './VideoChat'
import { formatDuration, formatSize } from '@/lib/format'
import { ELEMENT_KIND_LABEL, IMPROVEMENT_KIND_LABEL, SEARCH_SOURCE_LABEL, friendlyError } from '@/lib/status'
import type { VideoDetailResponse, SemanticSearchResult, SkillDetail } from '@/lib/types'

type Tab = 'resumen' | 'registro' | 'chat' | 'timeline' | 'transcripcion' | 'objetos' | 'texto' | 'skills' | 'detalles'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'registro', label: 'Registro V6.5' },
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
  // Which action is in flight: one shared flag relabelled every button
  // ("Exportando…" while detecting skills).
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const actionBusy = pendingAction !== null
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [searchResults, setSearchResults] = useState<SemanticSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchNotice, setSearchNotice] = useState<string | null>(null)
  const [generatedSkills, setGeneratedSkills] = useState<SkillDetail[]>([])
  const [exportedNote, setExportedNote] = useState<string | null>(null)
  const [exportedUrl, setExportedUrl] = useState<string | null>(null)
  const [improveSkillId, setImproveSkillId] = useState('')
  const [improveExternalPath, setImproveExternalPath] = useState('')
  const playerRef = useRef<HTMLVideoElement>(null)
  const router = useRouter()
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
  // A plain function, not a component defined in here: as a component it was
  // a new type on every render, so React rebuilt each timestamp button every
  // 2 s and keyboard focus fell off it.
  const at = (seconds: number | null) =>
    seconds === null ? null : (
      <button type="button" className="timestamp" onClick={() => seek(seconds)} title="Ver en el video">
        {formatDuration(seconds)}
      </button>
    )

  const [missing, setMissing] = useState(false)
  async function refresh() {
    try {
      const res = await fetch(`/api/videos/${id}`, { cache: 'no-store' })
      if (res.status === 404) setMissing(true)
      if (!res.ok) return
      const detail = (await res.json()) as VideoDetailResponse
      setData(detail)
    } catch {
      // Transient network hiccup during polling: keep the last known state.
    }
  }

  // Every 2 s while something runs for this video; a finished one (about
  // 550 KB per answer) only every 30 s. Each action refreshes at once, which
  // brings back the fast pace as soon as its job appears.
  const busy = !data || Boolean(data.video.activeJob) || ['pending', 'probing', 'queued', 'analyzing'].includes(data.video.status)
  useEffect(() => {
    if (missing) return
    void refresh()
    const interval = setInterval(refresh, busy ? 2000 : 30000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, busy, missing])

  useEffect(() => {
    fetch('/api/skills')
      .then((res) => res.json())
      .then((body: { skills?: SkillDetail[] }) => setGeneratedSkills(body.skills ?? []))
      .catch(() => {
        // The "Mejorar Skill" dropdown just stays empty; not worth surfacing an error for.
      })
  }, [])

  async function handleAnalyze() {
    if (data?.video.status === 'ready' && !window.confirm('Se hará un análisis nuevo de este video: usa cuota de Gemini y reemplaza el análisis actual cuando termine. ¿Seguir?')) return
    setPendingAction('analyze')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/videos/${id}/analyze`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo iniciar el análisis.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setPendingAction(null)
    }
  }

  // Stable, so the memoized record tab is not redrawn on every poll.
  const analyzeRef = useRef(handleAnalyze)
  analyzeRef.current = handleAnalyze
  const reanalyze = useCallback(() => void analyzeRef.current(), [])

  async function handleExportVault() {
    setPendingAction('export')
    setErrorMessage(null)
    setExportedNote(null)
    try {
      const res = await fetch(`/api/videos/${id}/export-vault`, { method: 'POST' })
      const body = (await res.json()) as { error?: string; noteName?: string; notePath?: string; memoria?: { url: string } | null }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo exportar al vault.')
      setExportedNote(body.noteName ?? 'Nota creada')
      setExportedUrl(body.memoria?.url ?? null)
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleDetectSkills() {
    setPendingAction('detect')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/videos/${id}/detect-skills`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo iniciar la detección de skills.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleGenerateSkill(skillId: string) {
    setPendingAction('generate')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/skills/${skillId}/generate`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo generar la skill.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleDiscardSkill(skillId: string) {
    setPendingAction('discard')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/skills/${skillId}/discard`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo descartar la skill.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleImproveSkill() {
    setPendingAction('improve')
    setErrorMessage(null)
    try {
      const body = improveSkillId ? { skillId: improveSkillId } : { sourceSkillPath: improveExternalPath.trim() }
      const res = await fetch(`/api/videos/${id}/improve-skill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const resBody = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(resBody.error ?? 'No se pudo iniciar la comparación.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleApplyImprovement(improvementId: string) {
    setPendingAction('apply')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/skill-improvements/${improvementId}/apply`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo aplicar la mejora.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleIgnoreImprovement(improvementId: string) {
    setPendingAction('ignore')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/skill-improvements/${improvementId}/ignore`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo ignorar la mejora.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleRetry() {
    setPendingAction('retry')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/videos/${id}/retry`, { method: 'POST' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo reintentar.')
      await refresh()
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setPendingAction(null)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Se borrará este video de la biblioteca para siempre: el archivo, su análisis, el chat y las imágenes que se sacaron de él. Las skills que ya creaste se conservan. ¿Borrarlo?')) return
    setPendingAction('delete')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo borrar el video.')
      router.push('/')
    } catch (error) {
      setErrorMessage((error as Error).message)
      setPendingAction(null)
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
        <p className="text-sm text-(--color-ink-soft)">{missing ? 'Este video ya no existe en la biblioteca.' : 'Cargando…'}</p>
        {missing && (
          <Link href="/" className="mt-3 inline-block text-sm underline">
            Volver a la biblioteca
          </Link>
        )}
      </main>
    )
  }

  const { video, summary, scenes, transcript, elements, analysisRuns, skills, skillImprovements } = data
  const objectElements = elements.filter((e) => OBJECT_KINDS.has(e.kind))
  const textElements = elements.filter((e) => e.kind === 'on_screen_text')
  const topics = summary ? (JSON.parse(summary.topics_json) as string[]) : []
  const skillJobActive = video.activeJob?.type === 'detect_skills'
  const skillJobFailed = !skillJobActive && data.skillJob?.type === 'detect_skills' && data.skillJob.status === 'failed'
  // A queued job only moves while the worker runs; without it the page used to wait forever.
  const waitingForWorker = data.workerAlive === false && video.activeJob?.status === 'queued'
  const downloading = video.source_kind === 'url' && !video.stored_path && (video.status === 'pending' || video.status === 'probing')

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href="/" className="inline-flex min-h-11 w-fit items-center text-sm text-(--color-ink-soft) hover:text-(--color-ink) sm:min-h-0">
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
              {downloading ? 'Descargando el video desde su enlace…' : video.source_kind === 'url' ? 'El video se ve desde su enlace original.' : 'Preparando el video…'}
            </div>
          )}
        </div>

        <header className="flex flex-col gap-4">
          <div className="flex flex-col items-start gap-3">
            <StatusBadge status={video.status} />
            <h1 className="text-2xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{video.title}</h1>
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

      {waitingForWorker && (
        <div role="status" className="card flex flex-col gap-1 p-4 text-sm" style={{ borderColor: 'color-mix(in oklch, var(--color-warn) 55%, var(--color-line))' }}>
          <p className="font-semibold">El analizador no está encendido</p>
          <p className="text-(--color-ink-soft)">
            Hay un trabajo en la cola para este video, pero nada lo va a procesar hasta que el analizador corra. Vuelve a abrir
            «Iniciar Video Analyzer.bat» (lo enciende sin cerrar nada); en la app de escritorio, Archivo → Reiniciar. Después sigue solo.
          </p>
        </div>
      )}

      {(video.status === 'pending' || video.status === 'probing') && (
        <p className="text-sm text-(--color-ink-soft)">
          {downloading ? 'Descargando el video desde su enlace…' : 'Leyendo la duración y el formato del video…'}
        </p>
      )}

      {video.status === 'queued' && (
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={actionBusy}
          className="btn-primary w-fit"
        >
          {pendingAction === 'analyze' ? 'Iniciando…' : '✨ Analizar el video'}
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
          <p className="text-sm leading-relaxed">{friendlyError(video.error_message)}</p>
          {video.error_message && (
            <details className="text-xs text-(--color-ink-soft)">
              <summary className="cursor-pointer">Ver el detalle técnico</summary>
              <p className="mt-2 break-words font-mono leading-relaxed">{video.error_message}</p>
            </details>
          )}
          <button type="button" onClick={handleRetry} disabled={actionBusy} className="btn-primary w-fit">
            {pendingAction === 'retry' ? 'Reintentando…' : 'Reintentar'}
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
              {pendingAction === 'export' ? 'Exportando…' : data.memoria ? 'Guardar en Memoria' : 'Exportar todo a Obsidian'}
            </button>
            {exportedNote && (
              <span className="text-sm" style={{ color: 'var(--color-ok)' }}>
                {exportedUrl ? (
                  <>
                    Guardado en Memoria:{' '}
                    <a href={exportedUrl} target="_blank" rel="noreferrer" className="underline">
                      {exportedNote}
                    </a>
                  </>
                ) : (
                  <>Guardado en el vault: {exportedNote}</>
                )}
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
                          {at(scene.start_seconds)} – {formatDuration(scene.end_seconds)}
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
                    {at(chunk.start_seconds)}
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
                <p className="text-sm text-(--color-ink-soft)">Este video no tiene diálogo detectado.</p>
              )}
            </div>
          )}

          {tab === 'objetos' && (
            <ul className="flex flex-col gap-2">
              {objectElements.map((el, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {at(el.start_seconds)}
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
                  {at(el.start_seconds)}
                  <span className="font-medium">{el.label}</span>
                  {el.detail && <span className="text-(--color-ink-soft)">— {el.detail}</span>}
                </li>
              ))}
              {textElements.length === 0 && (
                <p className="text-sm text-(--color-ink-soft)">No se detectó texto en pantalla.</p>
              )}
            </ul>
          )}

          {tab === 'skills' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-(--color-ink-soft)">
                  Procesos o métodos reutilizables detectados en este video (PROJECT.md §12).
                </p>
                <button
                  type="button"
                  onClick={handleDetectSkills}
                  disabled={actionBusy || skillJobActive}
                  className="w-fit shrink-0 rounded-full border border-(--color-line) px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {pendingAction === 'detect' ? 'Iniciando…' : skillJobActive ? 'Detectando…' : 'Detectar skills'}
                </button>
              </div>

              {skillJobActive && (
                <p role="status" className="text-sm text-(--color-ink-soft)">
                  {video.activeJob?.status === 'queued'
                    ? video.activeJob.progressLabel || 'En la cola: empieza en cuanto el analizador esté libre.'
                    : 'Buscando procesos reutilizables en el video…'}
                </p>
              )}
              {skillJobFailed && (
                <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
                  La última búsqueda de skills falló: {friendlyError(data.skillJob?.error ?? null)} Puedes volver a intentarlo.
                </p>
              )}
              {skills.length === 0 && !skillJobActive && (
                <p className="text-sm text-(--color-ink-soft)">
                  Todavía no se ha buscado. Cada búsqueda gasta una petición del cupo diario de Gemini.
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
                            className="rounded-full bg-(--color-btn-from) px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
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
                        <p className="text-sm text-(--color-ink-soft)">Generando SKILL.md…</p>
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
                  Compara una Skill ya generada (de este video o de otro) contra lo que este video enseña, y
                  propone mejoras concretas (PROJECT.md §13).
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    aria-label="Skill generada para mejorar"
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
                    placeholder="Ruta a un SKILL.md en el disco…"
                    aria-label="Ruta a un SKILL.md en el disco"
                    className="flex-1 rounded-md border border-(--color-line) bg-transparent px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleImproveSkill}
                  disabled={actionBusy || (!improveSkillId && !improveExternalPath.trim())}
                  className="w-fit rounded-full bg-(--color-btn-from) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {pendingAction === 'improve' ? 'Iniciando…' : 'Comparar'}
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
                              className="rounded-full bg-(--color-btn-from) px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
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
                            Aplicada — el SKILL.md ya se actualizó.
                          </p>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'registro' && (
            <ProtocolRecord markdown={summary?.protocol_record_md ?? null} title={video.title} onReanalyze={reanalyze} />
          )}

          {tab === 'detalles' && (
            <dl className="divide-y divide-(--color-line) rounded-(--radius-card) border border-(--color-line)">
              {[
                ['Contenedor', video.container ?? '—'],
                ['Codec de video', video.video_codec ?? '—'],
                ['Codec de audio', video.audio_codec ?? '—'],
                ['Tiene audio', video.has_audio ? 'Sí' : 'No'],
                ['Tamaño', formatSize(video.size_bytes)],
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
                placeholder="Ej.: dónde habla del precio…"
                className="flex-1 rounded-md border border-(--color-line) bg-transparent px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
              />
              <button
                type="submit"
                disabled={searching || !searchValue.trim()}
                className="rounded-md bg-(--color-btn-from) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {searching ? 'Buscando…' : 'Buscar'}
              </button>
            </form>
            {searchNotice && <p className="text-sm text-(--color-ink-soft)">{searchNotice}</p>}
            {searchResults && (
              <ul className="flex flex-col gap-2">
                {searchResults.map((result) => (
                  <li key={result.id} className="rounded-md border border-(--color-line) p-2.5 text-sm">
                    <p className="font-mono text-xs text-(--color-ink-soft)">
                      {SEARCH_SOURCE_LABEL[result.source]}
                      {result.start_seconds !== null && <> · {video.stored_path ? at(result.start_seconds) : formatDuration(result.start_seconds)}</>}
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
      <div className="mt-2 border-t border-(--color-line) pt-4">
        <button type="button" onClick={handleDelete} disabled={actionBusy} className="btn-danger w-fit">
          {pendingAction === 'delete' ? 'Borrando…' : 'Eliminar video'}
        </button>
      </div>
    </main>
  )
}

/**
 * The Protocolo V6.5 record, readable in the app: headings, bold labels and
 * bullets from its Markdown, the rest as it is (the record is mostly labelled
 * lines). Downloadable as the .md that goes to Obsidian.
 */
// Memoized: a 400 KB record is thousands of elements, rebuilt on every poll
// and every keystroke on the page before.
const ProtocolRecord = memo(function ProtocolRecord({ markdown, title, onReanalyze }: { markdown: string | null; title: string; onReanalyze: () => void }) {
  // The first sections (identification, triage, entities) open; the long per-second ones on demand.
  const [open, setOpen] = useState<Set<number>>(() => new Set([0, 1, 2]))
  if (!markdown) {
    return (
      <div className="space-y-3 text-sm text-(--color-ink-soft)">
        <p>Este análisis no tiene registro V6.5. Vuelve a analizar el video para generarlo.</p>
        <button type="button" className="btn-ghost" onClick={onReanalyze}>
          Volver a analizar
        </button>
      </div>
    )
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${title.replace(/\.[a-z0-9]{2,4}$/i, '')} — registro V6.5.md` })
    a.click()
    URL.revokeObjectURL(url)
  }
  const frontmatter = markdown.startsWith('---\n') ? markdown.slice(0, markdown.indexOf('\n---', 4) + 4) : ''
  const body = markdown.slice(frontmatter.length)
  const bold = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
    )
  const lines = (text: string) =>
    text.split('\n').map((line, i) => {
      if (line.startsWith('# ')) return <h2 key={i} className="mt-2 text-lg font-semibold">{line.slice(2)}</h2>
      if (line.startsWith('- ')) return <p key={i} className="pl-4 -indent-3">• {bold(line.slice(2))}</p>
      if (!line.trim()) return <div key={i} className="h-1" />
      return <p key={i} className="whitespace-pre-wrap break-words">{bold(line)}</p>
    })
  // One collapsible block per "## 9.x" section, drawn only once it is opened:
  // the whole record at once was about 11,000 elements and froze the tab.
  const parts = body.split(/^(?=## )/m)
  const intro = parts[0]!.startsWith('## ') ? '' : parts.shift()!
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={download} className="btn-ghost">
          Descargar registro (.md)
        </button>
        <button type="button" onClick={() => setOpen(new Set(parts.map((_, i) => i)))} className="btn-ghost">
          Abrir todas las secciones
        </button>
        <span className="text-xs text-(--color-ink-soft)">{Math.round(markdown.length / 1024)} KB · se exporta igual a Obsidian</span>
      </div>
      {frontmatter && (
        <pre className="overflow-x-auto rounded-xl bg-(--color-surface-2) p-3 text-xs">{frontmatter}</pre>
      )}
      <div className="flex flex-col gap-1 text-sm leading-relaxed">
        {lines(intro)}
        {parts.map((part, i) => {
          const heading = part.slice(3, part.indexOf('\n') === -1 ? undefined : part.indexOf('\n'))
          const isOpen = open.has(i)
          return (
            <details
              key={i}
              open={isOpen}
              onToggle={(e) => {
                const now = (e.currentTarget as HTMLDetailsElement).open
                if (now !== isOpen) setOpen((prev) => { const next = new Set(prev); if (now) next.add(i); else next.delete(i); return next })
              }}
              className="border-t border-(--color-line) pt-3"
            >
              <summary className="font-semibold">{heading}</summary>
              {isOpen && <div className="mt-2 flex flex-col gap-1">{lines(part.slice(heading.length + 4))}</div>}
            </details>
          )
        })}
      </div>
    </div>
  )
})
