import { STATUS_COLOR, STATUS_LABEL } from '@/lib/status'
import type { VideoStatus } from '@/lib/types'

export function StatusBadge({ status }: { status: VideoStatus }) {
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: STATUS_COLOR[status], background: 'color-mix(in oklch, currentColor 15%, transparent)' }}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}
