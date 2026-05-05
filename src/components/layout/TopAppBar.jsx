import { cn } from '../../lib/utils'

export function TopAppBar({ leading, title, trailing, showTitle = false, className }) {
  return (
    <div
      className={cn(
        'h-14 shrink-0 w-full bg-bg flex items-center px-2 font-body',
        showTitle && 'border-b border-border',
        className,
      )}
    >
      <div className="w-10 flex items-center justify-center">
        {leading}
      </div>
      <h1
        className={cn(
          'flex-1 text-center font-display text-[18px] font-bold text-text-primary -tracking-[0.1px] truncate',
          'transition-opacity duration-base',
          showTitle ? 'opacity-100' : 'opacity-0',
        )}
      >
        {title}
      </h1>
      <div className="flex items-center justify-end gap-1 min-w-10">
        {trailing}
      </div>
    </div>
  )
}

export function IconBtn({ children, onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-10 h-10 rounded-pill bg-transparent flex items-center justify-center text-text-primary hover:bg-surface-hover active:bg-border transition-colors duration-fast"
    >
      {children}
    </button>
  )
}
