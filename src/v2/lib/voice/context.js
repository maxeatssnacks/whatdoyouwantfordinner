// What parse-changes gets to read (v2 build step 7a): the dates, this week's
// and next week's meals from today on as short refs, what's on hand
// (everything bought before today that's still live, this week's purchases
// included, since 7a3), recipe titles and the slot names. Never names of people,
// macros, avoided foods, emails or ids: the refs map back to entries here,
// on the device. Plain JS, so Node checks import it.
import { addDays, amountText, plainName, shortName } from '../onHand.js'
import { entryById } from '../packages.js'
import { mealTypesMatch } from '../../../lib/utils.js'
import { calendar, DAY_NAMES, timeOfDay, weekStartOf } from './dates.js'

export const DEFAULT_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']
const EPSILON = 1e-6

/** Where a slot sorts within a day: the person's slot order, then the rest. */
function slotRank(slots, mealType) {
  const i = slots.findIndex((s) => mealTypesMatch(s, mealType))
  return i === -1 ? slots.length : i
}

/** The person's slot name for an entry's meal_type ("dinner" → "Dinner"). */
export function slotName(slots, mealType) {
  return slots.find((s) => mealTypesMatch(s, mealType)) ?? String(mealType ?? '')
}

/**
 * On hand now (inferOnHand's `nowAll`: everything bought before today that's
 * still live, this week's purchases included, since 7a3), per key, with a
 * short name (shortName, as the Week page says it) and words for what's left:
 * { [key]: { key, name, unit, amount, inferred, packageAmount, answer, left } }.
 * Keys whose lots are all gone or past their use-by aren't in `nowAll`, so
 * they aren't here either.
 */
export function onHandItems(onHand) {
  const out = {}
  const longName = (key) => (onHand?.bought ?? []).find((l) => l.key === key)?.name
    || plainName(entryById(key)?.display ?? key.replace(/-/g, ' '))
  const live = Object.entries(onHand?.nowAll ?? {}).filter(([key, n]) => entryById(key) && n.packageAmount > EPSILON)
  const others = live.map(([key]) => ({ key, name: longName(key) }))
  for (const [key, n] of live) {
    const entry = entryById(key)
    const name = longName(key)
    out[key] = {
      key,
      name: shortName(key, name, others),
      unit: entry.unit,
      amount: n.amount,
      inferred: n.inferred,
      packageAmount: n.packageAmount,
      answer: n.answer ?? null,
      left: n.amount > EPSILON ? amountText(key, n.amount, name) : 'None left',
    }
  }
  return out
}

/**
 * The context and the refs it uses.
 * - `plans`: this week's and next week's meal plans as the page holds them
 *   ({ id, week_start_date, entries } with each entry's recipe embedded).
 * - `onHand`: inferOnHand's result for this week with `today` (or null).
 * - `recipes`: what the person can plan (useRecipes 'accessible'); quick
 *   meals only count when they're the person's own (`userId`).
 * → { context, refs: { m1: { ref, entryId, date, weekStart, mealPlanId,
 *     dayOfWeek, mealType, slot, title, isLeftover, cookRef, cookEntryId,
 *     recipeId, isQuick } }, items: onHandItems }
 */
export function buildVoiceContext({ now = new Date(), today, plans = [], onHand = null, recipes = [], slots = DEFAULT_SLOTS, userId = null }) {
  const slotNames = slots?.length ? slots : DEFAULT_SLOTS
  const thisWeek = weekStartOf(today)
  const nextWeek = addDays(thisWeek, 7)
  const days = calendar(today)
  const lastDay = days[days.length - 1].date

  // Meals from today on, this week and next, in day and slot order.
  const rows = []
  for (const plan of plans) {
    const weekStart = plan?.week_start_date ?? plan?.weekStart
    if (weekStart !== thisWeek && weekStart !== nextWeek) continue
    for (const e of plan.entries ?? []) {
      const idx = DAY_NAMES.indexOf(String(e.day_of_week ?? '').toLowerCase())
      if (idx === -1) continue
      const date = addDays(weekStart, idx)
      if (date < today || date > lastDay) continue
      rows.push({ e, date, weekStart, mealPlanId: plan.id ?? e.meal_plan_id ?? null })
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date)
    || slotRank(slotNames, a.e.meal_type) - slotRank(slotNames, b.e.meal_type)
    || Number(!!a.e.is_leftover) - Number(!!b.e.is_leftover)
    || String(a.e.id).localeCompare(String(b.e.id)))

  const refs = {}
  const refOf = new Map()
  rows.forEach((r, i) => refOf.set(r.e.id, `m${i + 1}`))
  const meals = rows.map(({ e, date, weekStart, mealPlanId }) => {
    const ref = refOf.get(e.id)
    const title = e.recipe?.title ?? 'Recipe unavailable'
    const cookRef = e.is_leftover ? refOf.get(e.original_entry_id) ?? 'earlier' : null
    refs[ref] = {
      ref,
      entryId: e.id,
      date,
      weekStart,
      mealPlanId,
      dayOfWeek: String(e.day_of_week).toLowerCase(),
      mealType: e.meal_type,
      slot: slotName(slotNames, e.meal_type),
      title,
      isLeftover: !!e.is_leftover,
      cookRef,
      cookEntryId: e.is_leftover ? e.original_entry_id ?? null : null,
      recipeId: e.recipe_id ?? e.recipe?.id ?? null,
      isQuick: e.recipe?.recipe_type === 'quick',
    }
    return { ref, date, slot: refs[ref].slot, title, ...(cookRef ? { leftover_of: cookRef } : {}) }
  })

  const items = onHandItems(onHand)
  const titles = (list) => [...new Set(list.map((r) => String(r.title ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const context = {
    today,
    weekday: days[0].name.charAt(0).toUpperCase() + days[0].name.slice(1),
    time_of_day: timeOfDay(now),
    this_week: thisWeek,
    next_week: nextWeek,
    days: days.map((d) => `${d.date} ${d.short}`),
    slots: slotNames,
    meals,
    on_hand: Object.values(items)
      .filter((i) => i.amount > EPSILON)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => ({ key: i.key, name: i.name, left: i.left })),
    recipes: titles(recipes.filter((r) => r.recipe_type !== 'quick')),
    quick_meals: titles(recipes.filter((r) => r.recipe_type === 'quick' && (!userId || r.created_by === userId))),
  }
  return { context, refs, items }
}
