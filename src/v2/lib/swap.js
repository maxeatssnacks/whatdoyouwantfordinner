// Meal picker suggestions for one slot, for adding and swapping (PARITY SW-1,
// ADD-1). The same rules as Plan my week, ranked rather than random, so the
// list is the same every time the picker opens:
// - never quick meals, the meal being replaced or a recipe already on this
//   week, or a recipe with an avoided ingredient for the people eating;
// - recipes tagged for the slot (Breakfast/Snack/Dessert/Side tags,
//   otherwise "entree"). Recency is a preference (6c, as Plan my week since
//   6b2): the ones not used recently (Profile's Recipe Variety Filter) come
//   first, then the recent ones, cooked longest ago first;
// - when every tagged recipe is recent (`relaxed`), the other meal types
//   follow them, as swap always fell back to; `untagged` when nothing is
//   tagged for the slot at all (Breakfast in a library of dinners), so the
//   picker can lead with Something simple instead;
// - within each group, slotRanking (planRank.js): what's at stake (on hand
//   it uses and what it shares with the week's other cooks, less the fresh
//   waste it adds, at rough prices × shelf life), in $2 steps, then cooked
//   longest ago, macro score, title, id. Each recipe cooks what placeMeal
//   would give it there (people × (1 + its leftovers)); when swapping, the
//   meal being replaced neither shares nor takes from what's on hand.
import {
  recipeContainsAvoidedIngredients,
  recipeMatchesMealSlot,
  mealTypesMatch,
} from '../../lib/utils'
import { applyMeal, inferOnHand } from './onHand'
import { mealToBuy, onHandBefore, slotRanking, withoutEntries } from './planRank'
import { placeMeal } from './slotFill'
import { dateInWeek } from './week'

/** Swap is offered only for cooked meals whose recipe is still available (SW-2). */
export function canSwap(entry) {
  return !!entry && !entry.is_leftover && !!entry.recipe
}

/**
 * The picker's suggestions for one slot.
 * - recent: Map(recipeId → last day on a plan) in the Recipe Variety Filter's
 *   window (or recentRecipeIds, without days); lastCooked: the same over a
 *   longer history, for "cooked longest ago"
 * - the slot's context (optional; without it, an empty week with nothing on
 *   hand): day { name, date }, weekStart, today, people, currentEntries and
 *   nextEntries (the shown week's and next week's entries, with recipes),
 *   replaceEntryId (when swapping), onHand (prepareOnHand's rows for the
 *   shown week, or null: weeks after next, past days, sample data)
 * → { recipes, relaxed, untagged, items }: recipes in rank order (the picker
 *   shows them three at a time); `relaxed` when every tagged recipe is recent
 *   (or none is tagged), `untagged` when none is; items: Map(recipeId →
 *   { servings, reason, reasonKind ('on_hand' | 'shared' | null), recent })
 */
export function rankPickerRecipes({
  recipes = [],
  slot,
  activeMembers = [],
  recentRecipeIds = [],
  recent = null,
  lastCooked = null,
  excludeIds = [],
  day = null,
  weekStart = null,
  today = null,
  people = null,
  currentEntries = [],
  nextEntries = [],
  replaceEntryId = null,
  onHand = null,
}) {
  const exclude = new Set(excludeIds.filter(Boolean))
  const recentDays = recent ?? new Map(recentRecipeIds.map((id) => [id, '']))
  const avoids = (r) => activeMembers.length > 0 && recipeContainsAvoidedIngredients(r, activeMembers)
  const pool = recipes.filter((r) => r.recipe_type !== 'quick' && !exclude.has(r.id) && !avoids(r))

  const tagged = pool.filter((r) => recipeMatchesMealSlot(r, slot))
  const isRecent = (r) => recentDays.has(r.id)
  const relaxed = !tagged.some((r) => !isRecent(r)) && pool.length > 0
  const untagged = relaxed && tagged.length === 0
  const others = relaxed ? pool.filter((r) => !tagged.includes(r)) : []
  const groups = [
    tagged.filter((r) => !isRecent(r)),
    tagged.filter(isRecent),
    others.filter((r) => !isRecent(r)),
    others.filter(isRecent),
  ]

  // The slot's week: the other cooks (not the meal being replaced), and
  // what's on hand at the start of the day, then the meals earlier that day.
  const date = day?.date ?? null
  const cooks = (weekStart ? currentEntries : [])
    .filter((e) => !e.is_leftover && e.recipe && e.id !== replaceEntryId)
    .map((e) => ({ id: e.id, recipe: e.recipe, servings: e.servings, date: dateInWeek(weekStart, e.day_of_week), mealType: e.meal_type }))
  const rows = onHand && date ? withoutEntries(onHand, [replaceEntryId]) : null
  const usesById = rows ? inferOnHand(rows).byEntry : {}
  const plan = cooks.map((m) => ({ ...m, toBuy: mealToBuy(m.recipe, m.servings, usesById[m.id]?.uses) }))
  const order = ['breakfast', 'lunch', 'dinner', 'snack']
  const rank = (t) => {
    const i = order.findIndex((o) => mealTypesMatch(o, t))
    return i === -1 ? order.length : i
  }
  const state = rows
    ? cooks
      .filter((m) => m.date === date && rank(m.mealType) < rank(slot))
      .sort((a, b) => rank(a.mealType) - rank(b.mealType))
      .reduce((st, m) => applyMeal(st, m.recipe, m.servings, m.date), onHandBefore(rows, date))
    : null

  const servingsFor = (recipe) => (day && weekStart
    ? placeMeal({
      recipe,
      people,
      dayOfWeek: day.name,
      mealType: slot,
      weekStart,
      today,
      currentEntries,
      nextEntries,
      replaceEntryId,
      currentPlanId: 'this-week',
      nextPlanId: 'next-week',
    }).servings
    : undefined)

  const items = new Map()
  const ordered = []
  groups.forEach((group, g) => {
    if (!group.length) return
    let ranked = slotRanking({
      candidates: group.map((recipe) => ({ recipe, servings: servingsFor(recipe) })),
      date: date ?? '2000-01-02',
      plan: date ? plan : [],
      onHand: state,
      members: activeMembers,
      lastCooked: lastCooked ?? recentDays,
    })
    // Recent ones: cooked longest ago first (then the ranking).
    if (g % 2 === 1) ranked = [...ranked].sort((a, b) => String(recentDays.get(a.recipe.id) ?? '').localeCompare(String(recentDays.get(b.recipe.id) ?? '')))
    for (const r of ranked) {
      ordered.push(r.recipe)
      items.set(r.recipe.id, {
        servings: r.servings,
        reason: r.reason,
        reasonKind: r.reason ? (r.onHandItems.length ? 'on_hand' : 'shared') : null,
        recent: isRecent(r.recipe),
      })
    }
  })
  return { recipes: ordered, relaxed, untagged, items }
}
