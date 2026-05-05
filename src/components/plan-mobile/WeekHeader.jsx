import { cn } from '../../lib/utils'

const DAY_INITIALS = {
  sunday: 'S', monday: 'M', tuesday: 'T', wednesday: 'W',
  thursday: 'T', friday: 'F', saturday: 'S',
}

export function WeekHeader({ days, todayDate, focusDate, onPillTap }) {
  return (
    <div className="bg-bg/95 backdrop-blur border-b border-border px-4 py-2.5">
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isToday = day.date === todayDate
          const isFocused = day.date === focusDate
          const dayNum = day.displayDate.split(' ')[1]
          return (
            <button
              key={day.date}
              onClick={() => onPillTap?.(day.date)}
              aria-label={`Jump to ${day.name} ${dayNum}`}
              className={cn(
                'min-h-[44px] flex flex-col items-center justify-center rounded-md',
                'transition-all duration-fast ease-standard active:scale-[0.95]',
                isToday
                  ? 'bg-primary text-white'
                  : isFocused
                    ? 'bg-primary-tint text-primary'
                    : 'text-text-secondary hover:bg-surface-hover',
              )}
            >
              <span className="text-[10px] tracking-[1px] uppercase font-bold leading-none">
                {DAY_INITIALS[day.name]}
              </span>
              <span className="font-display text-[14px] font-bold tabular-nums leading-none mt-0.5">
                {dayNum}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
