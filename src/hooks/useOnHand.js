import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { inferOnHand, onHandWindow, prepareOnHand } from '../v2/lib/onHand'

// What's on hand (v2 build steps 5b and 5c; the calculation is in
// src/v2/lib/onHand.js, from the menu since 7a4). Four reads for the window (the 4
// weeks before the shown week, and that week), in parallel: the saved
// shopping lists, found by week through their meal plan; the meal plans with
// their entries and only the recipe fields the calculation needs; and the
// corrections (on_hand_adjustments, migration 018), with their source: a
// voice row reaches this week's purchases too, the others earlier weeks'
// lots only (7a3). If the corrections can't be read (the table missing, a
// failed read), on-hand works without them; and the person's package sizes
// (package_size_choices), for the list of a week nobody saved one (7a4).
// Invalidated wherever ['mealPlan'] is, after a shopping list save lands,
// after a correction is saved (useCorrectOnHand) and after a size choice.

const RECIPE_FIELDS = 'id, title, servings, ingredients, recipe_type'
const ENTRY_FIELDS = `id, day_of_week, meal_type, is_leftover, original_entry_id, servings, recipe:recipes(${RECIPE_FIELDS})`

/** The query for one shown week → { lists, plans, adjustments, sizeChoices } as read (prepareOnHand takes it). */
export function onHandQuery(userId, weekStart) {
  const { from, to } = onHandWindow(weekStart)
  return {
    queryKey: ['onHand', userId, weekStart],
    queryFn: async () => {
      const [lists, plans, adjustments, choices] = await Promise.all([
        supabase
          .from('shopping_lists')
          .select('id, meal_plan_id, items, created_at, meal_plan:meal_plans!inner(week_start_date)')
          .eq('user_id', userId)
          .gte('meal_plan.week_start_date', from)
          .lte('meal_plan.week_start_date', to)
          .order('created_at', { ascending: true }),
        supabase
          .from('meal_plans')
          .select(`id, week_start_date, created_at, entries:meal_plan_entries(${ENTRY_FIELDS})`)
          .eq('user_id', userId)
          .gte('week_start_date', from)
          .lte('week_start_date', to)
          .order('created_at', { ascending: true }),
        supabase
          .from('on_hand_adjustments')
          .select('ingredient_key, as_of, answer, amount, unit, inferred_amount, package_amount, source')
          .eq('user_id', userId)
          .gte('as_of', from),
        // Package sizes the person chose, for the list of a week nobody saved one (7a4).
        supabase
          .from('package_size_choices')
          .select('ingredient_key, size, unit')
          .eq('user_id', userId),
      ])
      if (lists.error) throw lists.error
      if (plans.error) throw plans.error
      if (adjustments.error) console.warn('[useOnHand] working without corrections:', adjustments.error.message)
      const sizeChoices = choices.error ? {} : Object.fromEntries((choices.data ?? []).map((r) => [r.ingredient_key, { size: Number(r.size), unit: r.unit }]))
      return { lists: lists.data ?? [], plans: plans.data ?? [], adjustments: adjustments.error ? [] : adjustments.data ?? [], sizeChoices }
    },
  }
}

/**
 * On hand for the shown week: inferOnHand's result ({ bought, byEntry, end,
 * now }), or null until the reads land (or when disabled, e.g. a past week).
 * `plans` are meal plans the page already holds (fresher than the read after
 * a change); their entries are used for their weeks. `today` (local date)
 * gives `now`, what's left at the start of today, for corrections. Nothing
 * waits for this.
 */
export function useOnHand(weekStart, { enabled = true, plans = null, today = null } = {}) {
  const { user } = useAuth()
  const { data } = useQuery({
    ...onHandQuery(user?.id, weekStart),
    enabled: !!user && !!weekStart && enabled,
  })
  return useMemo(() => {
    if (!data || !enabled) return null
    return inferOnHand(prepareOnHand(data, plans ?? [], { weekStart }), { today })
  }, [data, enabled, plans, weekStart, today])
}
