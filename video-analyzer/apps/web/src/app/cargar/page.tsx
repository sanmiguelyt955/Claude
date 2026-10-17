'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The "Cargar video" screen (PROJECT.md §6/§20): pick a file or paste a URL,
 * then hand off to the results screen immediately — probing and analysis
 * both happen there, live, so this page's only job is a clean handoff.
 */
export default function CargarPage() {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [urlSubmitting, setUrlSubmitting] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      const data = (await res.json()) as { video?: { id: string }; error?: string }
      if (!res.ok || !data.video) throw new Error(data.error ?? 'Error al subir el archivo.')
      router.push(`/videos/${data.video.id}`)
    } catch (error) {
      setErrorMessage((error as Error).message)
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
      const data = (await res.json()) as { video?: { id: string }; error?: string }
      if (!res.ok || !data.video) throw new Error(data.error ?? 'Error al aceptar la URL.')
      router.push(`/videos/${data.video.id}`)
    } catch (error) {
      setErrorMessage((error as Error).message)
      setUrlSubmitting(false)
    }
  }

  const busy = uploading || urlSubmitting

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Cargar video</h1>
        <p className="text-(--color-ink-soft)">
          Un archivo local, un enlace de TikTok, Instagram o YouTube, o una URL directa a un video.
        </p>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-(--radius-card) border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)', background: 'color-mix(in oklch, var(--color-danger) 8%, transparent)' }}
        >
          {errorMessage}
        </div>
      )}

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="font-semibold">Subir archivo</h2>
        <form onSubmit={handleFileSubmit} className="flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-3 rounded-(--radius-card) border-2 border-dashed border-(--color-line) bg-(--color-surface-2) px-4 py-10 text-center transition-colors hover:border-(--color-accent)">
            <span
              aria-hidden
              className="grid size-12 place-items-center rounded-2xl text-white"
              style={{ background: 'linear-gradient(135deg, var(--color-accent), var(--color-accent-2))' }}
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
            <span className="text-sm font-semibold">{fileName ?? 'Elige un video de tu computadora'}</span>
            <span className="text-xs text-(--color-ink-soft)">
              MP4, MOV, MKV, AVI, WebM, MP3, WAV, M4A, AAC, OGG, FLAC
            </span>
          </label>
          <button
            type="submit"
            disabled={busy || !fileName}
            className="btn-primary justify-center"
          >
            {uploading ? 'Subiendo…' : 'Subir y analizar'}
          </button>
        </form>
      </section>

      <div className="flex items-center gap-3 text-xs text-(--color-ink-soft)">
        <div className="h-px flex-1 bg-(--color-line)" />o<div className="h-px flex-1 bg-(--color-line)" />
      </div>

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="font-semibold">Pegar enlace</h2>
        <form onSubmit={handleUrlSubmit} className="flex flex-col gap-3">
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://www.tiktok.com/@usuario/video/..."
            className="rounded-full border border-(--color-line) bg-(--color-surface-2) px-4 py-2.5 text-sm outline-none focus:border-(--color-accent)"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !urlValue.trim()}
            className="btn-primary justify-center"
          >
            {urlSubmitting ? 'Enviando…' : 'Agregar y analizar'}
          </button>
        </form>
        <p className="text-xs text-(--color-ink-soft)">
          TikTok, Instagram y YouTube se descargan solos. Si Instagram pide iniciar sesión, configura
          YTDLP_COOKIES_FROM_BROWSER con el navegador donde tienes tu sesión abierta.
        </p>
      </section>
    </main>
  )
}
