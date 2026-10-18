// Pure derivations for the Week page: which meals show on which day, in what
// order, and the labels each card needs. No data fetching here.
import { getPerPersonMacrosForMealPlanEntry, mealTypesMatch, normalizeMealType } from '../../lib/utils'
import { DAY_NAMES, capitalizeDay, dateInWeek, shortDay } from './week'

/** "540 cal · 32g protein" per person (stored totals ÷ recipe.servings), or null. */
export function macrosLabel(entry) {
  if (!entry?.recipe) return null
  const m = getPerPersonMacrosForMealPlanEntry(entry)
  const parts = []
  if (m.calories != null) parts.push(`${Math.round(m.calories)} cal`)
  if (m.protein != null) parts.push(`${Math.round(m.protein)}g protein`)
  return parts.length ? parts.join(' · ') : null
}

export function timeLabel(recipe) {
  return recipe?.cook_time_minutes != null ? `${recipe.cook_time_minutes} min` : null
}

/**
 * Planned meals for one day in meal-slot sort_order. Like v1, at most one
 * entry shows per slot (the first match) and entries whose meal type isn't a
 * current slot stay hidden (PARITY ADD-9).
 */
export function dayMeals(entries, dayName, slotNames) {
  const forDay = entries.filter((e) => e.day_of_week === dayName)
  const out = []
  for (const slot of slotNames) {
    const entry = forDay.find((e) => mealTypesMatch(e.meal_type, slot))
    if (entry) out.push({ entry, slot })
  }
  return out
}

export function freeSlots(entries, dayName, slotNames) {
  const forDay = entries.filter((e) => e.day_of_week === dayName)
  return slotNames.filter((slot) => !forDay.some((e) => mealTypesMatch(e.meal_type, slot)))
}

/** Today's featured meal: dinner if planned, otherwise the last planned meal. */
export function featuredMeal(meals) {
  if (!meals.length) return null
  return meals.find((m) => mealTypesMatch(m.slot, 'dinner')) ?? meals[meals.length - 1]
}

/** meal_plan_id → week_start_date for the plans the page has loaded. */
export function planWeekIndex(plans) {
  const index = {}
  for (const p of plans) if (p?.id && p.week_start_date) index[p.id] = p.week_start_date
  return index
}

/** Calendar date of an entry, from the week its meal plan belongs to. */
export function entryDate(entry, planWeeks) {
  const weekStart = planWeeks[entry?.meal_plan_id]
  return weekStart ? dateInWeek(weekStart, entry.day_of_week) : null
}

/** "from Wednesday's dinner" for a leftover whose cook entry is loaded. */
export function leftoverOrigin(cookEntry) {
  if (!cookEntry) return null
  return `from ${capitalizeDay(cookEntry.day_of_week)}’s ${normalizeMealType(cookEntry.meal_type).toLowerCase()}`
}

export function dayIndex(dayName) {
  return DAY_NAMES.indexOf(dayName)
}

/** "Sun – Tue" for a run of days. */
export function dayRangeLabel(days) {
  if (!days.length) return ''
  if (days.length === 1) return shortDay(days[0].name)
  return `${shortDay(days[0].name)} – ${shortDay(days[days.length - 1].name)}`
}

export function pluralize(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/** "Max", "Max and Ally", "Max, Ally and Sam". */
export function joinNames(names) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Accessible name for a meal card's open button. */
export function mealAriaLabel(meal) {
  const parts = [meal.title, `${meal.dayLong} ${meal.slot.toLowerCase()}`]
  if (meal.isLeftover) parts.push('leftover')
  else if (meal.isQuick) parts.push('quick meal')
  return `${parts.join(', ')}. Open details`
}
