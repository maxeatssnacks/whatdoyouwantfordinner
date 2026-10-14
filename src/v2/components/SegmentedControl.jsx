import { cn } from '../../lib/utils'

// v2 segmented control: full-width, 44px segments, selected fill uses
// primary-hover so white text passes contrast (v1's SegmentedControl uses primary).
export function SegmentedControl({ options, value, onChange, 'aria-label': ariaLabel, className }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex gap-1 p-1 bg-surface border border-border rounded-pill', className)}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 min-w-0 min-h-[44px] px-3 rounded-pill text-sm font-bold font-body whitespace-nowrap',
              'focus-visible:outline-none focus-visible:shadow-ring-primary',
              selected
                ? 'bg-primary-hover text-white shadow-resting'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
