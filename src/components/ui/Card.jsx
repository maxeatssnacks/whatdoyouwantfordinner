import { cn } from '../../lib/utils'

function SelectedCheck() {
  return (
    <div className="absolute top-2.5 right-2.5 z-[2] w-6 h-6 rounded-pill bg-primary text-white shadow-[0_2px_4px_rgba(44,26,14,0.2)] flex items-center justify-center">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 6.5L5 9.5 10 3.5" />
      </svg>
    </div>
  )
}

export function Card({
  state = 'resting',
  platform = 'desktop',
  compact = false,
  width,
  children,
  className,
  onClick,
  hover,
  ...props
}) {
  if (import.meta.env.DEV && hover !== undefined) {
    console.warn('[Card] The hover prop is deprecated. Use state="hover" instead.')
  }
  const resolvedState = hover === true ? 'hover' : state

  const isSelected = resolvedState === 'selected'
  const isHover    = resolvedState === 'hover'
  const isPressed  = resolvedState === 'pressed'

  const pad = compact
    ? (platform === 'mobile' ? 'p-3' : 'p-4')
    : (platform === 'mobile' ? 'p-4' : 'p-6')

  return (
    <div
      onClick={onClick}
      data-state={resolvedState}
      style={width != null ? { width } : undefined}
      className={cn(
        'relative rounded-xl overflow-hidden bg-surface',
        'transition-all duration-base ease-standard',
        pad,
        isSelected
          ? 'border-2 border-primary bg-primary-tint shadow-card-selected'
          : isHover
            ? 'border border-border-hover shadow-elevated -translate-y-0.5'
            : isPressed
              ? 'border border-border shadow-pressed-inset'
              : 'border border-border shadow-resting',
        !isSelected && platform === 'desktop' &&
          'hover:border-border-hover hover:shadow-elevated hover:-translate-y-0.5',
        !isSelected && platform === 'mobile' &&
          'active:shadow-pressed-inset',
        onClick && 'cursor-pointer',
        className,
      )}
      {...props}
    >
      {isSelected && <SelectedCheck />}
      {children}
    </div>
  )
}
