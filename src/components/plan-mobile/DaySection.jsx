import { forwardRef } from 'react'
import { cn, capitalize } from '../../lib/utils'

export const DaySection = forwardRef(function DaySection(
  { day, isToday, children, headerStickyTop = 128 },
  ref,
) {
  const dayLabel = capitalize(day.name).slice(0, 3)
  // scroll-mt-[128px] = TopAppBar (56) + WeekHeader (~64) + 8px breathing room.
  // Mirrors headerStickyTop so scrollIntoView from /plan?day=... lands the
  // section's day header just below the sticky chrome instead of clipped behind it.
  return (
    <section ref={ref} data-day={day.date} className="scroll-mt-[128px]">
      <div
        className="sticky z-20 bg-bg/95 backdrop-blur px-4 py-2 border-b border-border/60"
        style={{ top: headerStickyTop }}
      >
        <h2 className={cn(
          'font-display text-[14px] font-bold tracking-[0.2px]',
          isToday ? 'text-primary' : 'text-text-primary',
        )}>
          {dayLabel} · {day.displayDate}
          {isToday && (
            <span className="ml-2 text-[10px] tracking-[1.2px] uppercase font-bold text-primary">
              Today
            </span>
          )}
        </h2>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {children}
      </div>
    </section>
  )
})
