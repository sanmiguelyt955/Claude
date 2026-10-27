'use client'

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex w-full gap-1 overflow-x-auto rounded-full border border-(--color-line) bg-(--color-surface-2) p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          // Screen readers otherwise cannot tell which tab is open.
          aria-pressed={value === option.value}
          className="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors"
          style={
            value === option.value
              ? { background: 'var(--color-surface)', color: 'var(--color-ink)', boxShadow: 'var(--shadow-card)' }
              : { color: 'var(--color-ink-soft)' }
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
