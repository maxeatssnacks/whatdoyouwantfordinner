// Meal picker suggestions for one slot, for adding and swapping (PARITY SW-1,
// ADD-1). Same rules swap and Plan my week use, but ranked rather than
// random, so the list is the same every time the picker opens:
// - only recipes tagged for the slot (Breakfast/Snack/Dessert/Side tags,
//   otherwise "entree"), without avoided ingredients for the people eating,
//   and not used recently (Profile's Recipe Variety Filter);
// - never the meal being replaced or a recipe already on this week;
// - if nothing qualifies, any of those recipes without avoided ingredients
//   (ignoring recency and tags), as swap always fell back to; `untagged`
//   when none of them is tagged for the slot at all (Breakfast in a library
//   of dinners), so the picker can lead with Something simple instead;
// - best per-serving macro fit for the people eating first, then by title.
import {
  recipeContainsAvoidedIngredients,
  recipeMatchesMealSlot,
  scoreRecipeForHousehold,
} from '../../lib/utils'

/** Swap is offered only for cooked meals whose recipe is still available (SW-2). */
export function canSwap(entry) {
  return !!entry && !entry.is_leftover && !!entry.recipe
}

/**
 * → { recipes, relaxed, untagged }: every eligible recipe in rank order (the
 * picker shows them three at a time); `relaxed` when the fallback pool was
 * used, `untagged` when that was because nothing is tagged for the slot.
 */
export function rankPickerRecipes({ recipes = [], slot, activeMembers = [], recentRecipeIds = [], excludeIds = [] }) {
  const exclude = new Set(excludeIds.filter(Boolean))
  const recent = new Set(recentRecipeIds)
  const avoids = (r) => activeMembers.length > 0 && recipeContainsAvoidedIngredients(r, activeMembers)
  const pool = recipes.filter((r) => r.recipe_type !== 'quick' && !exclude.has(r.id) && !avoids(r))

  const tagged = pool.filter((r) => recipeMatchesMealSlot(r, slot))
  let eligible = tagged.filter((r) => !recent.has(r.id))
  const relaxed = eligible.length === 0 && pool.length > 0
  const untagged = relaxed && tagged.length === 0
  if (relaxed) eligible = pool

  const scored = eligible.map((r) => ({ r, score: scoreRecipeForHousehold(r, activeMembers) }))
  scored.sort((a, b) =>
    b.score - a.score
    || String(a.r.title ?? '').localeCompare(String(b.r.title ?? ''))
    || String(a.r.id).localeCompare(String(b.r.id)))
  return { recipes: scored.map((s) => s.r), relaxed, untagged }
}
