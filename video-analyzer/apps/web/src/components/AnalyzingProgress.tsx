'use client'

import { useEffect, useState } from 'react'

/**
 * Honest live-progress indicator: an indeterminate bar, not a fake
 * percentage. A single Gemini call has no partial-progress signal, so this
 * shows what actually changes moment to moment — the phase label from the
 * job's progress_label, plus elapsed time, while the UI stays fully
 * interactive underneath (PROJECT.md §5: "nada bloqueante en la UI").
 */
export function AnalyzingProgress({ label, startedAt }: { label: string | null; startedAt: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = new Date(startedAt).getTime()
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60

  return (
    <div className="flex flex-col gap-2 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-4">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--color-line)">
        <div className="h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-(--color-accent)" />
      </div>
      <div className="flex items-center justify-between text-xs text-(--color-ink-soft)">
        <span>{label ?? 'Analizando...'}</span>
        <span className="font-mono">
          {minutes}:{String(seconds).padStart(2, '0')}
        </span>
      </div>
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  )
}
