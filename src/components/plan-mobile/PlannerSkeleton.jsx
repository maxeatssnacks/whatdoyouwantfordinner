import { Skeleton } from '../ui/Skeleton'
import { capitalize } from '../../lib/utils'

export function PlannerSkeleton({ days, slotCount = 4 }) {
  return (
    <div>
      {days.map((day) => (
        <section key={day.date}>
          <div className="px-4 py-2 border-b border-border/60">
            <h2 className="font-display text-[14px] font-bold text-text-primary">
              {capitalize(day.name).slice(0, 3)} · {day.displayDate}
            </h2>
          </div>
          <div className="px-4 py-3 space-y-2.5">
            {Array.from({ length: slotCount }).map((_, i) => (
              <Skeleton key={i} width="100%" height={68} radius={12} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
