import { cn } from '../../lib/utils'

export function SegmentedControl({ options, value, onChange, 'aria-label': ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-[3px] p-[3px] bg-surface border border-border rounded-pill"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-4 py-1.5 rounded-pill text-sm font-semibold font-body transition-all duration-fast',
            value === opt.value
              ? 'bg-primary text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
