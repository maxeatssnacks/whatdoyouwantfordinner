// Swap rules for one planned meal, rebuilt from v1's desktop MealSlot swap
// (PARITY SW-1) so mobile and desktop share them:
// - never the current recipe, never recipes with avoided ingredients for the
//   people eating, never recently used ones, and only recipes tagged for the
//   slot (Breakfast/Snack/Dessert/Side tags, otherwise "entree");
// - if nothing qualifies, fall back to any other recipe without avoided
//   ingredients (ignoring recency and tags);
// - pick weighted by macro fit.
import {
  recipeContainsAvoidedIngredients,
  recipeMatchesMealSlot,
  scoreRecipeForHousehold,
  weightedRandomSelect,
} from '../../lib/utils'

/** Swap is offered only for cooked meals whose recipe is still available (SW-2). */
export function canSwap(entry) {
  return !!entry && !entry.is_leftover && !!entry.recipe
}

export function pickSwapRecipe({ entry, recipes = [], activeMembers = [], recentRecipeIds = [] }) {
  if (!canSwap(entry) || recipes.length === 0) return null
  const avoids = (r) => activeMembers.length > 0 && recipeContainsAvoidedIngredients(r, activeMembers)

  let eligible = recipes.filter((r) =>
    r.id !== entry.recipe_id
    && !avoids(r)
    && !recentRecipeIds.includes(r.id)
    && recipeMatchesMealSlot(r, entry.meal_type),
  )
  if (eligible.length === 0) {
    eligible = recipes.filter((r) => r.id !== entry.recipe_id && !avoids(r))
  }
  if (eligible.length === 0) return null

  const scores = eligible.map((r) => scoreRecipeForHousehold(r, activeMembers))
  return weightedRandomSelect(eligible, scores, 1)[0] ?? null
}
