import { STATUS_COLOR, STATUS_LABEL } from '@/lib/status'
import type { VideoStatus } from '@/lib/types'

/** `solid` is for badges laid over a thumbnail, where a tint would not read. */
export function StatusBadge({ status, solid = false }: { status: VideoStatus; solid?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={
        solid
          ? { color: 'white', background: 'oklch(0.18 0.01 265 / 0.72)', backdropFilter: 'blur(6px)' }
          : { color: STATUS_COLOR[status], background: 'color-mix(in oklch, currentColor 14%, transparent)' }
      }
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${status === 'analyzing' || status === 'probing' ? 'animate-pulse' : ''}`}
        style={{ background: STATUS_COLOR[status] }}
      />
      {STATUS_LABEL[status]}
    </span>
  )
}
