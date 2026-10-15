import { useId } from 'react'
import { RotateCw } from 'lucide-react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { cn } from '../../../lib/utils'
import { SampleTag } from './bits'

/**
 * Rollover marker, Marker-E: a plain reason line ("Finishes the spinach and
 * feta"). On desktop, hovering or focusing it shows Marker-F, the on-hand
 * popover with amounts and use-by dates. Sample data only for now.
 */
export function RolloverReason({ rollover, onActivate, className }) {
  const isMobile = useIsMobile()
  const tipId = useId()
  if (!rollover) return null

  const line = (
    <>
      <RotateCw size={14} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
      <span>{rollover.reason}</span>
    </>
  )

  if (isMobile) {
    return (
      <p className={cn('flex items-center gap-1.5 text-sm font-bold text-secondary-hover', className)}>
        {line}
        <SampleTag />
      </p>
    )
  }

  return (
    <div className={cn('group relative z-10 self-start', className)}>
      <button
        type="button"
        aria-describedby={tipId}
        onClick={onActivate}
        className="flex items-center gap-1.5 min-h-[32px] -mx-1 px-1 rounded-sm text-sm font-bold text-secondary-hover hover:underline underline-offset-2 focus-visible:outline-none focus-visible:shadow-ring-primary"
      >
        {line}
        <SampleTag />
      </button>
      <div
        id={tipId}
        role="tooltip"
        className={cn(
          'hidden group-hover:flex group-focus-within:flex absolute left-0 top-full mt-1.5 w-[286px] z-30',
          'flex-col gap-2.5 px-4 py-3.5 rounded-xl bg-surface border border-border shadow-elevated text-text-primary',
        )}
      >
        <p className="flex items-center justify-between text-xs font-bold tracking-[0.06em] uppercase text-text-secondary">
          On hand <SampleTag />
        </p>
        {rollover.items.map((item) => (
          <div key={item.name} className="flex flex-col gap-px">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-bold capitalize">{item.name}</span>
              {item.useBy && (
                <span className={cn('text-[13px]', item.soon ? 'px-2 py-px rounded-pill bg-accent-soft font-bold' : 'text-text-secondary')}>
                  {item.useBy}
                </span>
              )}
            </div>
            <span className="text-[13px] text-text-secondary">{item.amount}</span>
          </div>
        ))}
        <div className="h-px bg-border" />
        <p className="text-sm font-bold text-secondary-hover">Saves about ${rollover.savings}</p>
      </div>
    </div>
  )
}
