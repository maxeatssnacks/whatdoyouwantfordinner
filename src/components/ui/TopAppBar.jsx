import { cn } from '../../lib/utils'

export function TopAppBar({ title, showTitle = true, leading, trailing, className, titleFitContent = false }) {
  return (
    <div
      className={cn(
        'h-14 shrink-0 w-full bg-bg border-b border-border flex items-center px-2 font-body',
        titleFitContent && 'justify-center gap-1',
        className,
      )}
    >
      <div className={titleFitContent ? 'flex items-center' : 'w-10 flex items-center justify-center'}>
        {leading}
      </div>
      <h1
        className={cn(
          'text-center font-display text-[18px] font-bold text-text-primary -tracking-[0.1px] truncate',
          'transition-opacity duration-base',
          titleFitContent ? 'px-1' : 'flex-1',
          showTitle ? 'opacity-100' : 'opacity-0',
        )}
      >
        {title}
      </h1>
      <div className={cn('flex items-center gap-1', titleFitContent ? '' : 'justify-end min-w-10')}>
        {trailing}
      </div>
    </div>
  )
}
