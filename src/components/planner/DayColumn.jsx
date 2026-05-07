import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
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
      <div className={`hidden md:flex items-start gap-4 rounded-2xl px-5 py-4 border-2 shadow-sm ${
        isToday
          ? 'bg-gradient-to-br from-amber-100/70 to-orange-100/50 border-amber-400/50 shadow-amber-100'
          : 'bg-gradient-to-br from-amber-50/50 to-orange-50/30 border-amber-200/30'
      }`}>
        {/* Day label */}
        <div className="w-24 flex-shrink-0 pt-1">
          <h3 className="text-base font-display font-bold text-amber-900 capitalize">
            {day.name}
          </h3>
          <p className="text-xs text-amber-700 font-body mt-0.5">{day.displayDate}</p>
          {isToday ? (
            <span className="mt-1 inline-block text-xs font-body font-semibold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
              Today
            </span>
          ) : (
            <span className="mt-1 inline-block text-xs py-0.5 invisible">Today</span>
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
      <div className={`md:hidden rounded-2xl border-2 shadow-sm overflow-hidden ${
        isToday
          ? 'bg-gradient-to-br from-amber-100/70 to-orange-100/50 border-amber-400/50 shadow-amber-100'
          : 'bg-gradient-to-br from-amber-50/50 to-orange-50/30 border-amber-200/30'
      }`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-amber-50/60 transition-colors"
        >
          <div className="text-left">
            <h3 className="text-base font-display font-bold text-amber-900 capitalize">
              {day.name}
            </h3>
            <p className="text-sm text-amber-700 font-body">{day.displayDate}</p>
            {isToday && (
              <span className="mt-1 inline-block text-xs font-body font-semibold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                Today
              </span>
            )}
          </div>
          <div className="text-amber-700 flex-shrink-0 ml-2">
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
