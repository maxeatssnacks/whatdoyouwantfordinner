import { cn } from '../../lib/utils'

export function TopAppBar({ title, showTitle = true, leading, trailing, className }) {
  return (
    <div
      className={cn(
        'h-14 shrink-0 w-full bg-bg border-b border-border flex items-center px-2 font-body',
        className,
      )}
    >
      <div className="w-10 flex items-center justify-center">{leading}</div>
      <h1
        className={cn(
          'flex-1 text-center font-display text-[18px] font-bold text-text-primary -tracking-[0.1px] truncate',
          'transition-opacity duration-base',
          showTitle ? 'opacity-100' : 'opacity-0',
        )}
      >
        {title}
      </h1>
      <div className="flex items-center justify-end gap-1 min-w-10">{trailing}</div>
    </div>
  )
}
