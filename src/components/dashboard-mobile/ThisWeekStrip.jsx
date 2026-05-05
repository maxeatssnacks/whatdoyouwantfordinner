import { useNavigate } from 'react-router-dom'
import { cn, getDaysOfWeek, getPlannerWeekStartDateString, formatLocalDateString } from '../../lib/utils'

const DAY_LABELS = {
  sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
}

export function ThisWeekStrip({ entries = [] }) {
  const navigate = useNavigate()
  const weekStart = getPlannerWeekStartDateString(0)
  const days = getDaysOfWeek(weekStart)
  const todayString = formatLocalDateString(new Date())

  const slotsByDay = entries.reduce((acc, entry) => {
    const key = entry.day_of_week
    if (!key) return acc
    if (!acc[key]) acc[key] = 0
    acc[key] += 1
    return acc
  }, {})

  return (
    <section>
      <h3 className="text-[11px] tracking-[1.4px] uppercase font-bold text-tertiary mb-2 px-1">
        This week
      </h3>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const isToday = day.date === todayString
          const slotCount = slotsByDay[day.name] || 0
          const dayNum = day.displayDate.split(' ')[1]
          return (
            <button
              key={day.date}
              onClick={() => navigate(`/plan?day=${day.date}`)}
              aria-label={`Open ${DAY_LABELS[day.name]} ${dayNum} in planner`}
              className={cn(
                'flex flex-col items-center justify-between py-2 px-1 rounded-md min-h-[44px]',
                'bg-surface transition-all duration-fast ease-standard',
                'active:scale-[0.97] active:bg-surface-hover',
                isToday
                  ? 'border-2 border-primary hover:bg-primary-tint/40'
                  : 'border border-border hover:border-border-hover hover:bg-surface-hover',
              )}
            >
              <span className={cn(
                'text-[9px] tracking-[1px] uppercase font-bold',
                isToday ? 'text-primary' : 'text-tertiary',
              )}>
                {DAY_LABELS[day.name]}
              </span>
              <span className={cn(
                'font-display text-[16px] font-bold tabular-nums leading-none mt-1',
                isToday ? 'text-primary' : 'text-text-primary',
              )}>
                {dayNum}
              </span>
              <div className="flex items-center justify-center gap-[2px] mt-1.5 h-1.5">
                {slotCount > 0
                  ? Array.from({ length: Math.min(slotCount, 4) }).map((_, i) => (
                      <span
                        key={i}
                        className={cn('w-1 h-1 rounded-pill', isToday ? 'bg-primary' : 'bg-border-hover')}
                      />
                    ))
                  : null}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
