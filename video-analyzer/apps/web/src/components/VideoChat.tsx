'use client'

import { useEffect, useRef, useState } from 'react'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  provider: string | null
  created_at: string
}

const SUGGESTIONS = ['¿De qué trata el video?', '¿Qué producto se muestra?', '¿En qué momento mencionan el precio?']

// [0:14], [1:02–1:10] or [1:02:05]: the timestamps the assistant cites.
const TIMESTAMP = /(\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*[–-]\s*\d{1,2}:\d{2}(?::\d{2})?)?\])/g

function MessageText({ text }: { text: string }) {
  return (
    <>
      {text.split(TIMESTAMP).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-(--color-line) px-1 font-mono text-xs">
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

/** Q&A over the video's stored analysis, with the answers citing timestamps. */
export function VideoChat({ videoId, ready }: { videoId: string; ready: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/videos/${videoId}/chat`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((body: { messages?: ChatMessage[] }) => setMessages(body.messages ?? []))
      .catch(() => setMessages([]))
  }, [videoId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, asking])

  async function ask(text: string) {
    const q = text.trim()
    if (!q || asking) return
    setAsking(true)
    setError(null)
    try {
      const res = await fetch(`/api/videos/${videoId}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
      const body = (await res.json()) as { messages?: ChatMessage[]; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'No se pudo responder.')
      setMessages(body.messages ?? [])
      setQuestion('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAsking(false)
    }
  }

  async function clear() {
    if (!window.confirm('¿Borrar toda la conversación con este video?')) return
    const res = await fetch(`/api/videos/${videoId}/chat`, { method: 'DELETE' })
    if (res.ok) setMessages([])
  }

  if (!ready) {
    return <p className="text-sm text-(--color-ink-soft)">El chat se habilita cuando el video termina de analizarse.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-(--color-ink-soft)">
          Pregunta lo que quieras sobre lo que se ve y se escucha. Las respuestas citan el momento del video.
        </p>
        {messages.length > 0 && (
          <button type="button" onClick={clear} className="text-xs text-(--color-ink-soft) underline">
            Borrar conversación
          </button>
        )}
      </div>

      {messages.length === 0 && !asking && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border border-(--color-line) px-3 py-1 text-sm hover:border-(--color-accent)"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === 'user'
                ? 'max-w-[85%] self-end rounded-lg bg-(--color-accent) px-3 py-2 text-sm text-white'
                : 'max-w-[85%] self-start whitespace-pre-wrap rounded-lg border border-(--color-line) px-3 py-2 text-sm'
            }
          >
            <MessageText text={m.text} />
            {m.role === 'assistant' && m.provider && (
              <p className="mt-1 font-mono text-[10px] text-(--color-ink-soft)">{m.provider}</p>
            )}
          </div>
        ))}
        {asking && <p className="self-start text-sm text-(--color-ink-soft)">Pensando…</p>}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'oklch(0.62 0.22 25)' }}>
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ej: ¿cuándo explica cómo se carga?"
          maxLength={2000}
          className="flex-1 rounded-md border border-(--color-line) bg-transparent px-3 py-2 text-sm outline-none focus:border-(--color-accent)"
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {asking ? 'Preguntando…' : 'Preguntar'}
        </button>
      </form>
    </div>
  )
}
