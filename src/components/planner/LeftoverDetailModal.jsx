import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useMoveMealPlanEntry, useRemoveMealPlanEntry, useUpdateEntryServings } from '../../hooks/usePlanner'
import { mealTypesMatch, getPerPersonMacrosForMealPlanEntry } from '../../lib/utils'

export function LeftoverDetailModal({ isOpen, onClose, entry, allCurrentWeekEntries, allNextWeekEntries, days, householdSize = 1 }) {
  const moveEntry = useMoveMealPlanEntry()
  const removeEntry = useRemoveMealPlanEntry()
  const updateServings = useUpdateEntryServings()

  if (!entry?.recipe) return null

  const recipe = entry.recipe
  const portionMacros = getPerPersonMacrosForMealPlanEntry(entry)

  // Find the original cook entry (could be in current or next week entries)
  const originalEntry = allCurrentWeekEntries?.find(e => e.id === entry.original_entry_id)
    || allNextWeekEntries?.find(e => e.id === entry.original_entry_id)
  const originDayLabel = originalEntry?.day_of_week
    ? originalEntry.day_of_week.charAt(0).toUpperCase() + originalEntry.day_of_week.slice(1)
    : null

  // Determine if cook entry is a past meal
  const today = new Date().toISOString().split('T')[0]
  const cookDate = days?.find(d => d.name === originalEntry?.day_of_week)?.date
  const isCookPast = cookDate ? cookDate < today : false

  // Find empty same-meal-type slots in the current week
  const occupiedDays = new Set(
    (allCurrentWeekEntries || [])
      .filter((e) => mealTypesMatch(e.meal_type, entry.meal_type))
      .map(e => e.day_of_week)
  )
  const availableSlots = (days || []).filter(
    d => d.name !== entry.day_of_week && !occupiedDays.has(d.name)
  )

  const handleMove = async (newDayOfWeek) => {
    await moveEntry.mutateAsync({ id: entry.id, dayOfWeek: newDayOfWeek })
    onClose()
  }

  const handleDismiss = async () => {
    await removeEntry.mutateAsync(entry.id)
    // Sync parent cook entry's servings downward (skip for past meals)
    if (!isCookPast && originalEntry?.id && householdSize > 0) {
      const currentServings = originalEntry.servings ?? recipe.servings ?? householdSize
      const newServings = Math.max(householdSize, currentServings - householdSize)
      try {
        await updateServings.mutateAsync({ id: originalEntry.id, servings: newServings })
      } catch (err) {
        console.error('Error updating cook entry servings:', err)
      }
    }
    onClose()
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Leftover" width={448}>
      <div className="space-y-5">
        {/* Recipe info */}
        <div>
          <h3 className="text-lg font-display font-bold text-amber-900">{recipe.title}</h3>
          {originDayLabel && (
            <p className="text-sm font-body text-amber-700 mt-1">
              Leftover from {originDayLabel}
            </p>
          )}
          {!originDayLabel && (
            <p className="text-sm font-body text-amber-700 mt-1">Leftover</p>
          )}
        </div>

        {/* Macro info (per person for this slot) */}
        {(portionMacros.calories != null || portionMacros.protein != null) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {portionMacros.calories != null && (
              <span className="text-sm font-body text-amber-800">
                {Math.round(portionMacros.calories)} kcal
              </span>
            )}
            {portionMacros.protein != null && (
              <span className="text-sm font-body text-amber-800">
                {portionMacros.protein.toFixed(1)}g protein
              </span>
            )}
            {portionMacros.carbs != null && (
              <span className="text-sm font-body text-amber-800">
                {portionMacros.carbs.toFixed(1)}g carbs
              </span>
            )}
            {portionMacros.fat != null && (
              <span className="text-sm font-body text-amber-800">
                {portionMacros.fat.toFixed(1)}g fat
              </span>
            )}
          </div>
        )}

        {/* Move to different day */}
        {availableSlots.length > 0 && (
          <div>
            <p className="text-sm font-body font-semibold text-text-secondary mb-2">
              Move to a different day:
            </p>
            <div className="flex flex-wrap gap-2">
              {availableSlots.map(slot => (
                <button
                  key={slot.name}
                  onClick={() => handleMove(slot.name)}
                  disabled={moveEntry.isPending}
                  className="px-3 py-1.5 text-sm font-body font-semibold bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg transition-colors capitalize disabled:opacity-50"
                >
                  {slot.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dismiss */}
        <div className="border-t border-border pt-4">
          <Button
            variant="ghost"
            className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleDismiss}
            disabled={removeEntry.isPending}
          >
            Remove leftover
          </Button>
        </div>
      </div>
    </Modal>
  )
}
