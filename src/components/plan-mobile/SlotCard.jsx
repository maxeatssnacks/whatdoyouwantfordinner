import { Clock } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useLongPress } from '../../hooks/useLongPress'

const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export function SlotCard({ mealType, entry, onClick, onLongPress, allCurrentWeekEntries = [], allNextWeekEntries = [], householdSize = 1 }) {
  const recipe = entry?.recipe
  const isLeftover = !!entry?.is_leftover
  const isUnavailable = !recipe
  const longPressHandlers = useLongPress(onLongPress ?? (() => {}))

  // Remainder label — mirrors MealSlot.jsx logic, shown on the last leftover for a cook entry
  let remainderLabel = null
  if (isLeftover && entry?.original_entry_id && !isUnavailable) {
    const cookEntry =
      allCurrentWeekEntries.find((e) => e.id === entry.original_entry_id) ||
      allNextWeekEntries.find((e) => e.id === entry.original_entry_id)
    const cookServings = cookEntry?.servings || cookEntry?.recipe?.servings || recipe?.servings || 1

    const allLeftoversForCook = [
      ...allCurrentWeekEntries
        .filter((e) => e.is_leftover && e.original_entry_id === entry.original_entry_id)
        .map((e) => ({ ...e, weekOffset: 0 })),
      ...allNextWeekEntries
        .filter((e) => e.is_leftover && e.original_entry_id === entry.original_entry_id)
        .map((e) => ({ ...e, weekOffset: 1 })),
    ]

    const sorted = allLeftoversForCook.sort((a, b) => {
      if (a.weekOffset !== b.weekOffset) return a.weekOffset - b.weekOffset
      return DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week)
    })

    const isLastLeftover = sorted.length > 0 && sorted[sorted.length - 1].id === entry.id
    if (isLastLeftover && householdSize > 0) {
      const remainder = cookServings % householdSize
      if (remainder !== 0) {
        remainderLabel = `${remainder} extra serving${remainder === 1 ? '' : 's'}`
      }
    }
  }

  return (
    <button
      onClick={onClick}
      {...longPressHandlers}
      disabled={isUnavailable}
      className={cn(
        'w-full text-left bg-surface border border-border rounded-xl px-3.5 py-3',
        'transition-all duration-fast ease-standard',
        !isUnavailable && 'shadow-resting active:shadow-pressed-inset active:scale-[0.99]',
        isUnavailable && 'opacity-70 cursor-default',
      )}
    >
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[10px] tracking-[1.4px] uppercase font-bold text-primary">
          {mealType}
        </span>
        {isLeftover && (
          <span className="text-[10px] tracking-[0.8px] uppercase font-bold text-accent">
            ↩ Leftover
          </span>
        )}
      </div>
      <p className="font-display text-[14px] font-bold text-text-primary leading-[18px] line-clamp-2">
        {recipe?.title ?? 'Recipe unavailable'}
      </p>
      {recipe?.cook_time_minutes != null && (
        <div className="flex items-center gap-1 mt-1.5 text-text-secondary tabular-nums">
          <Clock size={11} strokeWidth={2} />
          <span className="text-[12px] font-semibold">{recipe.cook_time_minutes} min</span>
        </div>
      )}
      {remainderLabel && (
        <p className="mt-1 text-[11px] font-body text-text-secondary/70 italic">
          {remainderLabel}
        </p>
      )}
    </button>
  )
}
