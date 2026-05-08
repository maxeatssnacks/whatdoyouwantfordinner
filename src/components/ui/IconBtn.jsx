import { cn } from '../../lib/utils'

export function IconBtn({ children, onClick, label, className, disabled }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'w-10 h-10 rounded-pill border-none bg-transparent flex items-center justify-center cursor-pointer text-text-primary',
        'hover:bg-surface-hover active:bg-border transition-colors duration-fast',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  )
}
