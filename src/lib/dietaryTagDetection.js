/** @typedef {{ name?: string, notes?: string, calories?: number, protein?: number, carbs?: number, fat?: number }} IngredientLike */

export const DIETARY_TAGS = [
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Dairy-Free',
  'Nut-Free',
  'Keto',
  'Paleo',
  'Low-Carb',
  'High-Protein',
]

const VEGETARIAN_FORBIDDEN = [
  'beef',
  'chicken',
  'pork',
  'turkey',
  'lamb',
  'bacon',
  'ham',
  'sausage',
  'fish',
  'salmon',
  'tuna',
  'shrimp',
  'seafood',
  'meat',
  'anchovy',
  'gelatin',
  'lard',
  'prosciutto',
  'pepperoni',
]

const VEGAN_EXTRA_FORBIDDEN = [
  'milk',
  'cheese',
  'butter',
  'cream',
  'yogurt',
  'egg',
  'honey',
  'whey',
  'casein',
  'ghee',
  'mayo',
  'mayonnaise',
]

const GLUTEN_FORBIDDEN = [
  'flour',
  'wheat',
  'barley',
  'rye',
  'bread',
  'pasta',
  'noodle',
  'couscous',
  'semolina',
  'spelt',
  'farro',
  'malt',
  'soy sauce',
  'breadcrumb',
]

const DAIRY_FORBIDDEN = [
  'milk',
  'cheese',
  'butter',
  'cream',
  'yogurt',
  'whey',
  'casein',
  'ghee',
  'lactose',
  'half and half',
]

const NUT_FORBIDDEN = [
  'almond',
  'cashew',
  'walnut',
  'pecan',
  'pistachio',
  'hazelnut',
  'macadamia',
  'brazil nut',
  'pine nut',
  'nut butter',
  'peanut',
  'peanut butter',
]

const PALEO_FORBIDDEN = [
  'flour',
  'wheat',
  'dairy',
  'milk',
  'cheese',
  'butter',
  'cream',
  'yogurt',
  'rice',
  'oat',
  'corn',
  'legume',
  'bean',
  'peanut',
  'soy',
  'sugar',
  'candy',
  'processed',
]

function blobFromIngredients(ingredients) {
  if (!ingredients?.length) return ''
  return ingredients
    .map((i) => `${i.name || ''} ${i.notes || ''}`)
    .join(' ')
    .toLowerCase()
}

function hasAnySubstring(haystack, needles) {
  return needles.some((n) => haystack.includes(n))
}

/**
 * @param {{ ingredients: IngredientLike[], servings: number, totals: { protein: number, carbs: number, fat: number } }} params
 * @returns {Record<string, boolean>}
 */
export function detectDietaryTags({ ingredients, servings, totals }) {
  const empty = Object.fromEntries(DIETARY_TAGS.map((t) => [t, false]))

  if (!ingredients?.length) {
    return empty
  }

  const blob = blobFromIngredients(ingredients)
  const serv = Math.max(1, servings || 1)
  const p = (totals?.protein || 0) / serv
  const c = (totals?.carbs || 0) / serv
  const f = (totals?.fat || 0) / serv

  const vegetarian = !hasAnySubstring(blob, VEGETARIAN_FORBIDDEN)
  const vegan = vegetarian && !hasAnySubstring(blob, VEGAN_EXTRA_FORBIDDEN)
  const glutenFree = !hasAnySubstring(blob, GLUTEN_FORBIDDEN)
  const dairyFree = !hasAnySubstring(blob, DAIRY_FORBIDDEN)
  const nutFree = !hasAnySubstring(blob, NUT_FORBIDDEN)
  const paleo = !hasAnySubstring(blob, PALEO_FORBIDDEN)

  const keto = c < 10 && f > p
  const lowCarb = c < 20
  const highProtein = p > 25

  return {
    Vegetarian: vegetarian,
    Vegan: vegan,
    'Gluten-Free': glutenFree,
    'Dairy-Free': dairyFree,
    'Nut-Free': nutFree,
    Keto: keto,
    Paleo: paleo,
    'Low-Carb': lowCarb,
    'High-Protein': highProtein,
  }
}
