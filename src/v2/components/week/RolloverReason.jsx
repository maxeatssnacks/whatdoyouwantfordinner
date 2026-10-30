import { useId } from 'react'
import { RotateCw } from 'lucide-react'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { capitalize, cn } from '../../../lib/utils'
import { SampleTag } from './bits'

/**
 * Rollover marker, Marker-E: a plain reason line ("Uses the rest of the green
 * beans", "Uses your ricotta, yogurt and kale"). On desktop, hovering or
 * focusing it shows Marker-F, the popover headed "You already have": the same
 * items as the line, in its order, with amounts and use-by dates (7a3). Real
 * data (src/v2/lib/onHand.js) or the labelled sample data; dollar amounts
 * only with sample data (step 8).
 */
export function RolloverReason({ rollover, onActivate, className, place = 'card' }) {
  const isMobile = useIsMobile()
  const tipId = useId()
  if (!rollover) return null
  const sampleData = rollover.sample === true
  // The Today card's column is narrower: its line may name fewer items (onHand.js LINE_WIDTHS).
  const text = place === 'today' ? rollover.reasonToday ?? rollover.reason : rollover.reason

  const line = (
    <>
      <RotateCw size={14} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
      <span data-testid="rollover-reason-text">{text}</span>
    </>
  )

  if (isMobile) {
    return (
      <p data-testid="rollover-reason" data-sample={sampleData ? 'true' : 'false'} className={cn('flex items-center gap-1.5 text-sm font-bold text-secondary-hover', className)}>
        {line}
        {sampleData && <SampleTag />}
      </p>
    )
  }

  return (
    <div data-testid="rollover-reason" data-sample={sampleData ? 'true' : 'false'} className={cn('group relative z-10 self-start', className)}>
      <button
        type="button"
        aria-describedby={tipId}
        onClick={onActivate}
        className="flex items-center gap-1.5 min-h-[32px] -mx-1 px-1 rounded-sm text-sm font-bold text-secondary-hover hover:underline underline-offset-2 focus-visible:outline-none focus-visible:shadow-ring-primary"
      >
        {line}
        {sampleData && <SampleTag />}
      </button>
      <div
        id={tipId}
        role="tooltip"
        data-testid="rollover-popover"
        className={cn(
          'hidden group-hover:flex group-focus-within:flex absolute left-0 top-full mt-1.5 w-[286px] z-30',
          'flex-col gap-2.5 px-4 py-3.5 rounded-xl bg-surface border border-border shadow-elevated text-text-primary',
        )}
      >
        <p className="flex items-center justify-between text-xs font-bold tracking-[0.06em] uppercase text-text-secondary">
          You already have {sampleData && <SampleTag />}
        </p>
        {rollover.items.map((item) => (
          <div key={item.name} data-testid="on-hand-item" className="flex flex-col gap-px">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-bold">{capitalize(item.name)}</span>
              {item.useBy && (
                <span className={cn('text-[13px]', item.soon ? 'px-2 py-px rounded-pill bg-accent-soft font-bold' : 'text-text-secondary')}>
                  {item.useBy}
                </span>
              )}
            </div>
            <span className="text-[13px] text-text-secondary">{item.amount}</span>
          </div>
        ))}
        {rollover.savings != null && (
          <>
            <div className="h-px bg-border" />
            <p className="text-sm font-bold text-secondary-hover">Saves about ${rollover.savings}</p>
          </>
        )}
      </div>
    </div>
  )
}
