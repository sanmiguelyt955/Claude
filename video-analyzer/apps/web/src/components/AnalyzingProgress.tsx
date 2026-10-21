'use client'

import { useEffect, useRef, useState } from 'react'

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(s / 60)
  const seconds = s % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

type Pace = {
  lastCurrent: number
  lastAtMs: number
  etaBaselineSeconds: number | null
  etaBaselineAtMs: number
  /** The first step seen and when: the pace is measured from here. */
  originCurrent: number | null
  originAtMs: number
}

/**
 * Live-progress indicator for an analysis in flight. When the job carries no
 * numeric progress (a single-call video, or the "Subiendo video..." phase
 * before windowing starts — a lone Gemini call has no partial-progress
 * signal), this stays an honest indeterminate bar rather than faking a
 * percentage. Once a windowed video reports current/total windows (see
 * ProgressUpdate in ai-router's analyze-video.ts), it switches to a real
 * percentage bar plus an ETA.
 *
 * The ETA is deliberately NOT (elapsed-since-job-start / windows-done) — that
 * naive average blends in every past stall (a model rotating through several
 * failed attempts on the same window, observed live to take minutes), and
 * keeps climbing for as long as the stall lasts, which is the opposite of
 * what a countdown should do. Instead the pace is re-baselined only when
 * `current` actually increases, using just the most recently completed
 * window, then counted down locally every second until the next real update
 * arrives — the same behavior a download progress bar has.
 */
export function AnalyzingProgress({
  label,
  startedAt,
  current,
  total,
}: {
  label: string | null
  startedAt: string
  current?: number
  total?: number | null
}) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const startMs = new Date(startedAt).getTime()
  const elapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000))
  const hasRealProgress = typeof total === 'number' && total > 0 && typeof current === 'number'

  const paceRef = useRef<Pace>({ lastCurrent: 0, lastAtMs: startMs, etaBaselineSeconds: null, etaBaselineAtMs: startMs, originCurrent: null, originAtMs: startMs })

  // A new job (new startedAt) starts a fresh pace history — otherwise a
  // just-restarted analysis would inherit the previous run's baseline.
  useEffect(() => {
    paceRef.current = { lastCurrent: 0, lastAtMs: startMs, etaBaselineSeconds: null, etaBaselineAtMs: startMs, originCurrent: null, originAtMs: startMs }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt])

  // Re-baseline synchronously during render (not in an effect) so the very
  // render that receives a new `current` already shows the corrected ETA
  // instead of lagging one tick behind.
  // The pace counts only from the first step seen: before it come the local
  // frames, transcription and phase 1, much slower than a window, and the
  // windows then run in parallel. Measured from the start, the first ETA was
  // about 4x too long ("quedan ~32:06" with 7:17 left). No ETA until two
  // steps after that origin have finished.
  if (hasRealProgress && current! > paceRef.current.lastCurrent) {
    const pace = paceRef.current
    if (pace.originCurrent === null) {
      pace.originCurrent = current!
      pace.originAtMs = nowMs
    } else if (current! - pace.originCurrent >= 2) {
      const msPerStep = (nowMs - pace.originAtMs) / (current! - pace.originCurrent)
      const remaining = total! - current!
      pace.etaBaselineSeconds = remaining > 0 ? (msPerStep * remaining) / 1000 : 0
      pace.etaBaselineAtMs = nowMs
    }
    pace.lastCurrent = current!
    pace.lastAtMs = nowMs
  }

  const percent = hasRealProgress ? Math.min(100, Math.round((current! / total!) * 100)) : null
  const etaSeconds =
    hasRealProgress && paceRef.current.etaBaselineSeconds !== null
      ? Math.max(0, Math.round(paceRef.current.etaBaselineSeconds - (nowMs - paceRef.current.etaBaselineAtMs) / 1000))
      : null

  return (
    <div className="flex flex-col gap-2 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-4">
      <div
        role="progressbar"
        aria-label="Progreso del análisis"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={label ?? 'Analizando…'}
        className="h-1.5 w-full overflow-hidden rounded-full bg-(--color-line)"
      >
        {hasRealProgress ? (
          <div
            className="h-full rounded-full bg-(--color-accent) transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-(--color-accent)" />
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-(--color-ink-soft)">
        <span>{label ?? 'Analizando…'}</span>
        <span className="font-mono">
          {hasRealProgress ? (
            <>
              {percent}%{etaSeconds !== null && etaSeconds > 0 ? ` · quedan ~${formatDuration(etaSeconds)}` : ''}
              {' · '}
              {formatDuration(elapsed)}
            </>
          ) : (
            formatDuration(elapsed)
          )}
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
