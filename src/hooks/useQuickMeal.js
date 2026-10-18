import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sumTotals, toTitleCase } from '../lib/utils'
import { useCreateRecipe, useUpdateRecipe } from './useRecipes'

// Quick meals: recipe rows with recipe_type='quick' (migration 016), made from
// free text through the parse-ingredients edge function. Their amounts are the
// whole meal, so they always have servings 1 and never leave leftovers.
// Shared by QuickMealModal (Recipes) and the Week page's "Something simple".

async function invokeEdgeFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.error || 'Edge function error'), { status: res.status })
  }
  return res.json()
}

function titleCaseWords(str) {
  return str.trim().split(/\s+/).map((w) => toTitleCase(w)).join(' ')
}

/** "Eggs + English Muffin + Greek Yogurt" from the first three items. */
export function quickMealTitle(ingredients) {
  const parts = ingredients
    .map((ing) => ing.name)
    .filter(Boolean)
    .slice(0, 3)
    .map((name) => titleCaseWords(name.split(',')[0]))
    .filter(Boolean)
  return parts.join(' + ') || 'Quick Meal'
}

// Quick meals saved before the "+" titles were auto-titled with the raw item
// names joined by commas ("eggs, bread, white" from "eggs" and "bread,
// white"): a title with commas, no "+", and every part found in the names.
function looksLikeItemList(title, ingredients) {
  if (!title.includes(',') || title.includes('+')) return false
  const names = ingredients.map((ing) => String(ing.name ?? '').toLowerCase()).join(', ')
  const parts = title.toLowerCase().split(',').map((p) => p.trim()).filter(Boolean)
  return parts.length > 0 && parts.every((p) => names.includes(p))
}

/**
 * The name to show for a saved quick meal: its title, or, when that is an
 * older raw item list, one built the way new titles are. Display only.
 */
export function quickMealLabel(recipe) {
  const title = String(recipe?.title ?? '').trim()
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : []
  return ingredients.length && looksLikeItemList(title, ingredients) ? quickMealTitle(ingredients) : title
}

/** Rounded calories / protein / carbs / fat for the whole meal. */
export function quickMealTotals(ingredients) {
  const t = sumTotals(ingredients || [])
  return {
    calories: Math.round(t.calories),
    protein: Math.round(t.protein),
    carbs: Math.round(t.carbs),
    fat: Math.round(t.fat),
  }
}

/** One line per item ("2 whole eggs"), for re-parsing edited items. */
export function quickMealText(ingredients) {
  return (ingredients || [])
    .map((ing) => [ing.amount, ing.unit, ing.name].filter((p) => p != null && p !== '').join(' '))
    .filter(Boolean)
    .join('\n')
}

/**
 * parse(text) → ingredients[] (throws an Error with a readable message);
 * save({ recipe?, title, ingredients }) → the created or updated recipe row.
 * Saving goes through useCreateRecipe / useUpdateRecipe, which keep quick
 * meals owner-only and out of moderation, and refresh recipes and meal plans.
 */
export function useQuickMeal() {
  const [isParsing, setIsParsing] = useState(false)
  const { mutateAsync: createRecipe, isPending: isCreating } = useCreateRecipe()
  const { mutateAsync: updateRecipe, isPending: isUpdating } = useUpdateRecipe()

  const parse = useCallback(async (text) => {
    if (!text?.trim()) throw new Error('Type what you’re having first.')
    setIsParsing(true)
    try {
      const data = await invokeEdgeFunction('parse-ingredients', { text })
      const parsed = data?.ingredients
      if (!Array.isArray(parsed)) throw new Error('Unexpected response format')
      if (parsed.length === 0) {
        throw Object.assign(new Error('No foods found in that text. Try listing them with amounts.'), { readable: true })
      }
      return parsed
    } catch (err) {
      // The function's own daily-limit message is readable; anything else
      // (network, model or format errors) gets one plain message.
      if (err?.status === 429 || err?.readable) throw err
      throw new Error('Couldn’t read that meal. Check the text and try again.')
    } finally {
      setIsParsing(false)
    }
  }, [])

  const save = useCallback(async ({ recipe = null, title, ingredients, isAdmin = false }) => {
    const totals = quickMealTotals(ingredients)
    const fields = {
      title: title?.trim() || 'Quick Meal',
      ingredients,
      calories: totals.calories,
      protein_g: totals.protein,
      carbs_g: totals.carbs,
      fat_g: totals.fat,
    }
    if (recipe) {
      return updateRecipe({
        id: recipe.id,
        updates: fields,
        isAdmin,
        currentStatus: recipe.status,
        recipeType: 'quick',
      })
    }
    return createRecipe({
      ...fields,
      recipeType: 'quick',
      servings: 1,
      meal_tags: [],
      instructions: null,
      image_url: null,
    })
  }, [createRecipe, updateRecipe])

  return {
    parse,
    save,
    isParsing,
    isSaving: isCreating || isUpdating,
  }
}
