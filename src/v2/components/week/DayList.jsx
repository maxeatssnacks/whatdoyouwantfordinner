import { forwardRef } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { cn } from '../../../lib/utils'

/** One day: header, its planned meals, and a quiet "+ Add a meal". */
export const DaySection = forwardRef(function DaySection(
  { day, isToday, variant, featured, children, onAdd, canAdd },
  ref,
) {
  const label = `${day.shortName} ${day.dayNum}${isToday ? ' · Today' : ''}`
  const listCls = variant === 'A' ? 'flex flex-col' : 'flex flex-col gap-2.5'
  return (
    <section
      ref={ref}
      data-day={day.date}
      aria-label={`${day.longName} ${day.displayDate}${isToday ? ', today' : ''}`}
      className="scroll-mt-4 md:scroll-mt-20 flex flex-col gap-2"
    >
      <h2 className={cn('font-body text-[13px] font-black tracking-[0.06em] uppercase', isToday ? 'text-primary-hover' : 'text-text-secondary')}>
        {label}
      </h2>
      {featured}
      {children && <ul className={listCls}>{children}</ul>}
      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="self-start min-h-[44px] -ml-1 px-2 flex items-center gap-1.5 rounded-pill text-sm font-bold text-text-secondary hover:text-text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-primary"
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
          Add a meal
          <span className="sr-only"> on {day.longName}</span>
        </button>
      )}
    </section>
  )
})

/** Collapsed past days, Days-A: "Sun – Tue · 3 meals". */
export function PastDaysRow({ label, mealCount, expanded, onToggle, controlsId }) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onToggle}
      data-testid="past-days"
      className="w-full min-h-[52px] pl-3.5 pr-3 flex items-center gap-2.5 rounded-xl border border-border bg-surface text-left text-[15px] hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-primary"
    >
      <span
        aria-hidden="true"
        className={cn(
          'w-6 h-6 shrink-0 rounded-pill flex items-center justify-center',
          mealCount > 0 ? 'bg-secondary-soft text-secondary-hover' : 'bg-surface-hover text-text-secondary',
        )}
      >
        <Check size={14} strokeWidth={3} />
      </span>
      <span className="flex-1 min-w-0">
        <strong>{label}</strong>{' '}
        <span className="text-text-secondary">· {mealCount === 0 ? 'nothing planned' : `${mealCount} ${mealCount === 1 ? 'meal' : 'meals'}`}</span>
      </span>
      <ChevronDown
        size={20}
        strokeWidth={2}
        aria-hidden="true"
        className={cn('shrink-0 transition-transform duration-base', expanded && 'rotate-180')}
      />
    </button>
  )
}
