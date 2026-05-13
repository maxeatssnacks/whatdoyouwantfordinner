import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { MealSlot } from './MealSlot'
import { MealSlotSkeleton } from './MealSlotSkeleton'
import { mealTypesMatch } from '../../lib/utils'

const DEFAULT_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

function getTodayStr() {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function DayColumn({
  day,
  entries,
  mealPlanId,
  recipes,
  activeMembers,
  recentRecipeIds,
  isLoading,
  allCurrentWeekEntries,
  allNextWeekEntries,
  nextWeekMealPlanId,
  days,
  householdSize,
  mealTypes = DEFAULT_MEAL_TYPES,
}) {
  const isToday = day.date === getTodayStr()
  const [isExpanded, setIsExpanded] = useState(isToday)

  const slotElements = mealTypes.map((mealType) => {
    if (isLoading) return <MealSlotSkeleton key={mealType} />
    const entry = entries.find((e) => mealTypesMatch(e.meal_type, mealType))
    return (
      <MealSlot
        key={mealType}
        mealType={mealType}
        entry={entry}
        dayOfWeek={day.name}
        mealPlanId={mealPlanId}
        recipes={recipes}
        activeMembers={activeMembers}
        recentRecipeIds={recentRecipeIds}
        allCurrentWeekEntries={allCurrentWeekEntries}
        allNextWeekEntries={allNextWeekEntries}
        nextWeekMealPlanId={nextWeekMealPlanId}
        days={days}
        householdSize={householdSize}
      />
    )
  })

  return (
    <>
      {/* Desktop view - horizontal row */}
      <div className={`hidden md:flex items-start gap-4 rounded-2xl px-5 py-4 border-2 shadow-resting ${
        isToday
          ? 'bg-accent-soft/60 border-primary'
          : 'bg-accent-soft/40 border-border'
      }`}>
        {/* Day label */}
        <div className="w-24 flex-shrink-0 pt-1">
          <h3 className="text-base font-display font-bold text-text-primary capitalize">
            {day.name}
          </h3>
          <p className="text-xs text-text-secondary font-body mt-0.5">{day.displayDate}</p>
          {isToday ? (
            <div className="mt-1">
              <Badge tone="primary" variant="solid">Today</Badge>
            </div>
          ) : (
            <div className="mt-1 invisible">
              <Badge tone="primary" variant="solid">Today</Badge>
            </div>
          )}
        </div>

        {/* Meal slots in a horizontal grid */}
        <div
          className="flex-1 grid gap-3"
          style={{ gridTemplateColumns: `repeat(${mealTypes.length}, minmax(0, 1fr))` }}
        >
          {slotElements}
        </div>
      </div>

      {/* Mobile view - accordion */}
      <div className={`md:hidden rounded-2xl border-2 shadow-resting overflow-hidden ${
        isToday
          ? 'bg-accent-soft/60 border-primary'
          : 'bg-accent-soft/40 border-border'
      }`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-hover transition-colors"
        >
          <div className="text-left">
            <h3 className="text-base font-display font-bold text-text-primary capitalize">
              {day.name}
            </h3>
            <p className="text-sm text-text-secondary font-body">{day.displayDate}</p>
            {isToday && (
              <div className="mt-1">
                <Badge tone="primary" variant="solid">Today</Badge>
              </div>
            )}
          </div>
          <div className="text-text-secondary flex-shrink-0 ml-2">
            {isExpanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
          </div>
        </button>

        {isExpanded && (
          <div className="px-5 pb-5 pt-1 space-y-3">
            {slotElements}
          </div>
        )}
      </div>
    </>
  )
}
