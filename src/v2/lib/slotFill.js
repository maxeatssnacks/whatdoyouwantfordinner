// Servings and leftover days for a meal put in one slot by the meal picker or
// by Recipes in swap mode (written by useFillMealSlot).
import { DAY_ORDER, computeLeftoverSlots } from '../../lib/utils'
import { dateInWeek, shiftWeek, todayString } from './week'

/**
 * v2 leftover rules for one slot:
 * - quick meals: servings 1, no leftovers (their amounts are the whole meal);
 * - servings the person chose (recipe detail's stepper) are kept, and
 *   leftovers follow from them; otherwise leftovers follow from the recipe's
 *   servings and the cook covers people × (1 + leftovers placed), as Plan my
 *   week does;
 * - leftovers: at most MAX_LEFTOVERS_PER_COOK, same meal type, free days in
 *   the 4 days after the cook day, never a day before today, possibly next week.
 * When replacing, that entry's old leftovers don't count as taken: they go.
 *
 * → { servings, leftovers: [{ mealPlanId, dayOfWeek }] }
 */
export function placeMeal({
  recipe,
  servings = null,
  people,
  dayOfWeek,
  mealType,
  weekStart,
  today,
  currentEntries = [],
  nextEntries = [],
  replaceEntryId = null,
  currentPlanId,
  nextPlanId,
}) {
  if (recipe?.recipe_type === 'quick') return { servings: 1, leftovers: [] }

  const keep = (e) => !(replaceEntryId && e.original_entry_id === replaceEntryId)
  const taken = [
    ...currentEntries.filter(keep).map((e) => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 0 })),
    ...nextEntries.filter(keep).map((e) => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 1 })),
  ]
  // Days that have passed count as taken, so leftovers only land today or later.
  for (const weekOffset of [0, 1]) {
    for (const day of DAY_ORDER) {
      if (dateInWeek(shiftWeek(weekStart, weekOffset), day) < today) {
        taken.push({ day_of_week: day, meal_type: mealType, weekOffset })
      }
    }
  }

  const eaters = Math.max(Number(people) || 1, 1)
  const slots = computeLeftoverSlots({
    recipe,
    originDay: dayOfWeek,
    mealType,
    numberOfPeople: eaters,
    existingEntries: taken,
    servings: servings ?? undefined,
  })
  const leftovers = slots
    .map((s) => ({ mealPlanId: s.weekOffset === 0 ? currentPlanId : nextPlanId, dayOfWeek: s.dayOfWeek }))
    .filter((l) => l.mealPlanId)

  return {
    servings: servings ?? eaters * (1 + leftovers.length),
    leftovers,
  }
}

/**
 * Where the recipe page's servings stepper starts in slot mode (Recipes opened
 * from a Week slot, adding or replacing): what the meal picker would cook,
 * people × (1 + the leftovers that fit, under the cap). Still adjustable.
 */
export function slotStartServings({ recipe, pendingSlot, people, weekStart, currentPlan, nextPlan, today = todayString() }) {
  return placeMeal({
    recipe,
    people,
    dayOfWeek: pendingSlot.dayOfWeek,
    mealType: pendingSlot.mealType,
    weekStart,
    today,
    currentEntries: currentPlan?.entries ?? [],
    nextEntries: nextPlan?.entries ?? [],
    replaceEntryId: pendingSlot.replaceEntryId ?? null,
    currentPlanId: currentPlan?.id ?? pendingSlot.mealPlanId,
    nextPlanId: nextPlan?.id ?? pendingSlot.nextWeekMealPlanId,
  }).servings
}
