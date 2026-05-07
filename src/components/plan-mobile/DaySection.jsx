import { forwardRef } from 'react'
import { cn, capitalize } from '../../lib/utils'

export const DaySection = forwardRef(function DaySection(
  { day, isToday, children, headerStickyTop = 121 },
  ref,
) {
  const dayLabel = capitalize(day.name).slice(0, 3)
  // CSS scroll-margin fallback. PlanMobile's scroll-to-day function measures
  // the real chrome height at scroll time and bypasses this value via
  // window.scrollTo, so 144 is a generous safety net that only kicks in for
  // browser-native scroll-to-fragment (e.g. anchor links). Was 128; bumped
  // because real chrome rendered 121px in tested envs but sub-pixel rounding
  // + font metrics under 5-tab-nav layout made the day header clip behind
  // the WeekHeader on first paint when the JS path didn't yet measure cleanly.
  // headerStickyTop kept tight (121) so the day header sits flush against
  // the WeekHeader bottom edge without an empty gap.
  return (
    <section ref={ref} data-day={day.date} className="scroll-mt-[144px]">
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
