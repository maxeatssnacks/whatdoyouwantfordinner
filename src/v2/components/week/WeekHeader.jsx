import { CalendarPlus, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { capitalizeDay, formatWeekRangeShort, weekTitle } from '../../lib/week'

const INITIALS = { sunday: 'S', monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'T', friday: 'F', saturday: 'S' }

function NavButtons({ onPrev, onNext, bordered }) {
  const cls = cn(
    'w-11 h-11 rounded-pill flex items-center justify-center text-text-primary',
    'focus-visible:outline-none focus-visible:shadow-ring-primary',
    bordered ? 'border border-border bg-surface hover:bg-surface-hover' : 'hover:bg-surface-hover',
  )
  return (
    <div className="flex gap-2 shrink-0">
      <button type="button" aria-label="Previous week" onClick={onPrev} className={cls}>
        <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
      </button>
      <button type="button" aria-label="Next week" onClick={onNext} className={cls}>
        <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}

function ActionRow({ cookingFor, onPlan, planDisabled, isThisWeek, onThisWeek, variantTrigger }) {
  // Wraps on narrow screens: the right-hand group drops to its own line
  // rather than squeezing the labelled "Plan my week" action.
  return (
    <div className="flex flex-wrap items-center gap-2">
      {cookingFor}
      {onPlan && (
        <button
          type="button"
          onClick={onPlan}
          disabled={planDisabled}
          data-testid="plan-week-open"
          className="min-h-[44px] px-4 flex items-center gap-2 rounded-pill border border-border bg-surface text-[15px] font-bold text-text-primary hover:bg-surface-hover disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-ring-primary"
        >
          <CalendarPlus size={17} strokeWidth={2.2} aria-hidden="true" className="text-primary-hover" />
          Plan my week
        </button>
      )}
      {(!isThisWeek || variantTrigger) && (
        <div className="ml-auto flex items-center gap-1">
          {!isThisWeek && (
            <button
              type="button"
              onClick={onThisWeek}
              className="min-h-[44px] px-3 rounded-pill text-[15px] font-bold text-primary-hover hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-primary"
            >
              This week
            </button>
          )}
          {variantTrigger}
        </div>
      )}
    </div>
  )
}

function dayAria(day) {
  const base = `${capitalizeDay(day.name)} ${day.displayDate}`
  if (day.isToday) return `${base}, today${day.count ? `, ${day.count} planned` : ''}`
  if (!day.count) return `${base}, nothing planned`
  if (day.isPast) return `${base}, ${day.count} ${day.count === 1 ? 'meal' : 'meals'}`
  return `${base}, ${day.count} ${day.count === 1 ? 'meal' : 'meals'} planned`
}

function DayStrip({ days, focusDay, onDayTap }) {
  return (
    <nav aria-label="Days this week" className="grid grid-cols-7 gap-1">
      {days.map((day) => (
        <button
          key={day.date}
          type="button"
          aria-label={dayAria(day)}
          aria-current={day.isToday ? 'date' : undefined}
          onClick={() => onDayTap(day)}
          className={cn(
            'h-16 rounded-xl flex flex-col items-center justify-center gap-0.5',
            'focus-visible:outline-none focus-visible:shadow-ring-primary',
            day.isToday
              ? 'bg-primary-hover text-white'
              : cn(day.isPast ? 'text-text-secondary' : 'text-text-primary', day.date === focusDay ? 'bg-surface-hover' : 'hover:bg-surface-hover'),
          )}
        >
          <span className={cn('text-xs font-bold', !day.isToday && 'text-text-secondary')}>{INITIALS[day.name]}</span>
          <span className="text-[17px] font-black tabular-nums leading-none">{day.dayNum}</span>
          <span className="h-3 flex items-center" aria-hidden="true">
            {day.count > 0 && (day.isPast && !day.isToday ? (
              <Check size={12} strokeWidth={3} className="text-secondary-hover" />
            ) : (
              <span className={cn('w-[5px] h-[5px] rounded-pill', day.isToday ? 'bg-white' : 'bg-primary')} />
            ))}
          </span>
        </button>
      ))}
    </nav>
  )
}

/**
 * Week header, variant A (day strip) or C (today first). Both have
 * previous/next week, a way back to this week, the "Cooking for" cluster,
 * "Plan my week" (not on past weeks: onPlan is null), and (dev/admin only)
 * the variant panel trigger.
 */
export function WeekHeader({
  variant,
  weekStart,
  thisWeek,
  days,
  focusDay,
  summary,
  todayName,
  onPrev,
  onNext,
  onThisWeek,
  onDayTap,
  onPlan,
  planDisabled,
  cookingFor,
  variantTrigger,
}) {
  const isThisWeek = weekStart === thisWeek
  const range = formatWeekRangeShort(weekStart)
  const actions = (
    <ActionRow cookingFor={cookingFor} onPlan={onPlan} planDisabled={planDisabled} isThisWeek={isThisWeek} onThisWeek={onThisWeek} variantTrigger={variantTrigger} />
  )

  if (variant === 'C') {
    return (
      <header data-testid="week-header" data-variant="C" className="flex flex-col gap-1 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-text-secondary">Week of {range}</p>
          <NavButtons onPrev={onPrev} onNext={onNext} />
        </div>
        <h1 className="font-display text-[34px] leading-tight font-bold">
          {isThisWeek && todayName ? capitalizeDay(todayName) : weekTitle(weekStart, thisWeek)}
        </h1>
        {summary && <p className="text-[15px] text-text-secondary">{summary}</p>}
        <div className="mt-2">{actions}</div>
      </header>
    )
  }

  return (
    <header data-testid="week-header" data-variant="A" className="flex flex-col gap-3.5 pt-3.5 pb-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-bold text-text-secondary">{range}</p>
          <h1 className="font-display text-[30px] leading-tight font-bold">{weekTitle(weekStart, thisWeek)}</h1>
        </div>
        <NavButtons onPrev={onPrev} onNext={onNext} bordered />
      </div>
      {actions}
      <DayStrip days={days} focusDay={focusDay} onDayTap={onDayTap} />
    </header>
  )
}
