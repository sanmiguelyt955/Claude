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
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cargar video</h1>
        <p className="text-sm text-(--color-ink-soft)">
          Un archivo local o una URL directa. FFmpeg y Gemini se encargan del resto.
        </p>
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

      <section className="flex flex-col gap-4 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5">
        <h2 className="text-sm font-semibold">Subir archivo</h2>
        <form onSubmit={handleFileSubmit} className="flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-(--radius-card) border border-dashed border-(--color-line) px-4 py-8 text-center hover:border-(--color-accent)">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
            <span className="text-sm font-medium text-(--color-accent)">
              {fileName ?? 'Elegir archivo...'}
            </span>
            <span className="text-xs text-(--color-ink-soft)">
              MP4, MOV, MKV, AVI, WebM, MP3, WAV, M4A, AAC, OGG, FLAC
            </span>
          </label>
          <button
            type="submit"
            disabled={busy || !fileName}
            className="rounded-full bg-(--color-accent) px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {uploading ? 'Subiendo...' : 'Subir y analizar'}
          </button>
        </form>
      </section>

      <div className="flex items-center gap-3 text-xs text-(--color-ink-soft)">
        <div className="h-px flex-1 bg-(--color-line)" />o<div className="h-px flex-1 bg-(--color-line)" />
      </div>

      <section className="flex flex-col gap-4 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5">
        <h2 className="text-sm font-semibold">Pegar URL</h2>
        <form onSubmit={handleUrlSubmit} className="flex flex-col gap-3">
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://..."
            className="rounded-md border border-(--color-line) bg-transparent px-3 py-2.5 text-sm outline-none focus:border-(--color-accent)"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !urlValue.trim()}
            className="rounded-full bg-(--color-accent) px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {urlSubmitting ? 'Enviando...' : 'Agregar y analizar'}
          </button>
        </form>
        <p className="text-xs text-(--color-ink-soft)">
          Una URL de YouTube se procesa directo por Gemini, sin descargarla.
        </p>
      </section>
    </main>
  )
}
