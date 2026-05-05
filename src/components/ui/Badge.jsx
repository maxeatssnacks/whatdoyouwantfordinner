import { cn } from '../../lib/utils'

const toneStyles = {
  primary: {
    solid:   'bg-primary text-white border-primary',
    outline: 'bg-transparent text-primary border-primary',
    soft:    'bg-primary-soft text-primary border-transparent',
  },
  secondary: {
    solid:   'bg-secondary text-white border-secondary',
    outline: 'bg-transparent text-secondary border-secondary',
    soft:    'bg-secondary-soft text-secondary border-transparent',
  },
  accent: {
    solid:   'bg-accent text-white border-accent',
    outline: 'bg-transparent text-accent border-accent',
    soft:    'bg-accent-soft text-accent border-transparent',
  },
  warning: {
    solid:   'bg-warning text-white border-warning',
    outline: 'bg-transparent text-warning border-warning',
    soft:    'bg-warning-soft text-warning border-transparent',
  },
  error: {
    solid:   'bg-error text-white border-error',
    outline: 'bg-transparent text-error border-error',
    soft:    'bg-error-soft text-error border-transparent',
  },
  neutral: {
    solid:   'bg-text-secondary text-white border-text-secondary',
    outline: 'bg-transparent text-text-secondary border-text-secondary',
    soft:    'bg-border text-text-secondary border-transparent',
  },
}

export function Badge({ tone = 'primary', variant = 'outline', icon, children, className, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-bold tracking-[0.5px] uppercase',
        'px-2.5 py-[3px] rounded-pill border whitespace-nowrap',
        variant === 'outline' && 'border-[1.25px]',
        toneStyles[tone]?.[variant] ?? toneStyles.primary.outline,
        className,
      )}
      {...props}
    >
      {icon && <span className="inline-flex w-2.5 h-2.5 shrink-0">{icon}</span>}
      {children}
    </span>
  )
}
