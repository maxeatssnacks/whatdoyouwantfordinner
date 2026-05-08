import { cn } from '../../lib/utils'

export function TopAppBar({
  title,
  showTitle = true,
  leading,
  trailing,
  // Renders an extra element pinned to the bar's far right edge (absolute), independent
  // of the main leading/title/trailing cluster. Used by PlanMobile to separate Sparkles
  // from the ChevronRight that stays adjacent to the centered date title.
  trailingPinRight,
  className,
  // Shrinks title to content width and centers the whole leading+title+trailing cluster.
  // Use when all three slots are populated and you want them visually grouped (e.g. Plan).
  titleFitContent = false,
  // Absolutely centers the title against the full bar width regardless of leading/trailing
  // asymmetry. Use when leading is empty but trailing is heavy (e.g. Recipes with two icons).
  titleAbsoluteCenter = false,
}) {
  const needsRelative = titleAbsoluteCenter || !!trailingPinRight

  return (
    <div
      className={cn(
        'h-14 shrink-0 w-full bg-bg border-b border-border flex items-center px-2 font-body',
        titleFitContent && 'justify-center gap-1',
        needsRelative && 'relative',
        className,
      )}
    >
      <div
        className={
          titleFitContent
            ? 'flex items-center'
            : 'w-10 flex items-center justify-center'
        }
      >
        {leading}
      </div>

      <h1
        className={cn(
          'text-center font-display text-[18px] font-bold text-text-primary -tracking-[0.1px] truncate',
          'transition-opacity duration-base',
          titleFitContent
            ? 'px-1'
            : titleAbsoluteCenter
            ? 'absolute left-1/2 -translate-x-1/2 max-w-[60%] pointer-events-none'
            : 'flex-1',
          showTitle ? 'opacity-100' : 'opacity-0',
        )}
      >
        {title}
      </h1>

      <div
        className={cn(
          'flex items-center gap-1',
          titleFitContent ? '' : titleAbsoluteCenter ? 'ml-auto' : 'justify-end min-w-10',
        )}
      >
        {trailing}
      </div>

      {trailingPinRight && (
        <div className="absolute right-2 flex items-center">
          {trailingPinRight}
        </div>
      )}
    </div>
  )
}
