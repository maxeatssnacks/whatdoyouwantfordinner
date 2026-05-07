import { forwardRef } from 'react'
import { cn, capitalize } from '../../lib/utils'

export const DaySection = forwardRef(function DaySection(
  { day, isToday, children },
  ref,
) {
  const dayLabel = capitalize(day.name).slice(0, 3)
  // The day header used to be `sticky` with an inline `top: 121px` so it
  // would track scroll alongside the TopAppBar + WeekHeader stack. That
  // configuration produced a confusing "second WeekHeader" visual at
  // /plan first paint (no day-param) — the day header for Sunday landed
  // exactly at y=121, indistinguishable from the WeekHeader's bottom
  // edge. The WeekHeader (z-25) covered the day header (z-20) where they
  // overlapped, but inspectors caught the inline top:121 and read it as
  // the WeekHeader being shoved down. Now the day header is normal flow
  // — it scrolls with its section. PlanMobile's WeekHeader pills already
  // give scroll-position feedback via `focusDate`, so day-context isn't
  // lost. scroll-mt-[144px] still provides a CSS fallback for any
  // browser-native scroll-to-fragment (e.g. anchor links).
  return (
    <section ref={ref} data-day={day.date} className="scroll-mt-[144px]">
      <div className="bg-bg/95 px-4 py-2 border-b border-border/60">
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
