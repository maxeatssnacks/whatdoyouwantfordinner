import { useCallback } from 'react'
import { posthog } from '../../lib/posthog'
import { normalizeMealType } from '../../lib/utils'
import { useFillMealSlot } from '../../hooks/usePlanner'
import { placeMeal } from '../lib/slotFill'
import { todayString } from '../lib/week'

/**
 * Recipe detail in swap mode (the meal picker's "Choose from my recipes"):
 * replaces `pendingSlot.replaceEntryId` with this recipe instead of adding a
 * second meal to the slot (PARITY ADD-9). The servings chosen on the page are
 * kept; the old leftovers go and new ones follow from those servings (capped,
 * today forward). Resolves to { entry, partial } (partial: swapped, but the
 * leftovers weren't updated); throws if the meal wasn't replaced.
 */
export function useSwapFromRecipes() {
  const { mutateAsync: fillSlot } = useFillMealSlot()

  return useCallback(async ({ pendingSlot, recipe, servings, people, currentEntries, nextEntries, nextPlanId }) => {
    const placement = placeMeal({
      recipe,
      servings,
      people,
      dayOfWeek: pendingSlot.dayOfWeek,
      mealType: pendingSlot.mealType,
      weekStart: pendingSlot.weekStartDate,
      today: todayString(),
      currentEntries,
      nextEntries,
      replaceEntryId: pendingSlot.replaceEntryId,
      currentPlanId: pendingSlot.mealPlanId,
      nextPlanId,
    })
    let result
    try {
      const entry = await fillSlot({
        recipeId: recipe.id,
        mealType: pendingSlot.mealType,
        // Replacing eating out or a skipped meal (7b) clears its kind.
        target: { replaceEntryId: pendingSlot.replaceEntryId, servings: placement.servings, clearKind: !!pendingSlot.replaceKind },
        leftovers: placement.leftovers,
      })
      result = { entry, partial: false }
    } catch (err) {
      if (!err.partial) throw err
      result = { entry: err.entry, partial: true }
    }
    posthog.capture('week_meal_swapped', { meal_type: normalizeMealType(pendingSlot.mealType), source: 'recipes' })
    return result
  }, [fillSlot])
}
