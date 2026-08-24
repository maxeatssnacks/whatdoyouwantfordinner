import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { posthog } from '../lib/posthog'
import {
  recipeContainsAvoidedIngredients,
  scoreRecipeForHousehold,
  weightedRandomSelect,
  computeLeftoverSlots,
  normalizeMealType,
  mealTypesMatch,
  recipeMatchesMealSlot,
} from '../lib/utils'

const MEAL_TYPE_PRIORITY = ['dinner', 'lunch', 'breakfast', 'snack']
const priorityIndex = (mt) => {
  const i = MEAL_TYPE_PRIORITY.indexOf(String(mt).toLowerCase())
  return i === -1 ? MEAL_TYPE_PRIORITY.length : i
}

/**
 * Encapsulates the full Suggest-my-week flow that previously lived inside
 * WeeklyPlanner.handleConfirmSuggest. Pure code-motion: scoring, recency
 * filtering, dinner→lunch→breakfast→snack priority, cross-week leftover
 * placement, and the queryClient invalidate/refetch are unchanged.
 *
 * Inputs are passed in (rather than re-fetched) so callers can reuse the
 * data they've already loaded for rendering.
 *
 * Returns { suggest, isPending } where suggest({ mealTypes, bypassRecencyFilter })
 * resolves to a result object the caller maps onto its own UI:
 *   { ok: true }
 *   { ok: false, reason: 'no-recipes' | 'no-user' | 'no-entries-generated' }
 *   { ok: false, reason: 'no-eligible-recipes', canBypassRecency, mealTypes }
 *   { ok: false, reason: 'error', error: string }
 */
export function useMealPlanSuggest({
  weekStartDate,
  nextWeekStartDate,
  recipes,
  recentRecipeIds,
  activeMembers,
  currentMealPlan,
  nextWeekMealPlan,
  days,
}) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [isPending, setIsPending] = useState(false)

  const suggest = useCallback(async ({ mealTypes, bypassRecencyFilter = false }) => {
    if (!recipes || recipes.length === 0) {
      return { ok: false, reason: 'no-recipes' }
    }
    if (!user) {
      return { ok: false, reason: 'no-user' }
    }

    setIsPending(true)
    try {
      const typesToFill = (mealTypes || []).map(normalizeMealType).filter(Boolean)

      // Step 1: Ensure meal plan exists for current week
      const { data: existingPlan, error: fetchError } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start_date', weekStartDate)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError

      let currentMealPlanId
      if (!existingPlan) {
        const { data: newPlan, error: createError } = await supabase
          .from('meal_plans')
          .insert([{ user_id: user.id, week_start_date: weekStartDate }])
          .select()
          .single()
        if (createError) throw new Error(`Failed to create meal plan: ${createError.message}`)
        currentMealPlanId = newPlan.id
      } else {
        currentMealPlanId = existingPlan.id
      }

      // Step 2: Remove existing entries for the selected meal types
      if (currentMealPlan?.entries) {
        const entriesToRemove = currentMealPlan.entries.filter((e) =>
          typesToFill.some((m) => mealTypesMatch(m, e.meal_type))
        )
        for (const entry of entriesToRemove) {
          await supabase.from('meal_plan_entries').delete().eq('id', entry.id)
        }
      }

      // Step 3: Filter recipes
      const effectiveRecentIds = bypassRecencyFilter ? [] : (recentRecipeIds || [])
      const eligibleRecipes = recipes.filter((recipe) => {
        if (activeMembers.length > 0 && recipeContainsAvoidedIngredients(recipe, activeMembers)) return false
        if (effectiveRecentIds.includes(recipe.id)) return false
        return true
      })

      if (eligibleRecipes.length === 0) {
        return {
          ok: false,
          reason: 'no-eligible-recipes',
          canBypassRecency: !bypassRecencyFilter && (recentRecipeIds || []).length > 0,
          mealTypes: typesToFill,
        }
      }

      // Step 4: Score recipes for weighted random selection
      const scores = eligibleRecipes.map((recipe) => scoreRecipeForHousehold(recipe, activeMembers))

      // Step 5: Generate entries — meal types in priority order, leftover-aware
      const orderedMealTypes = [...typesToFill].sort((a, b) => priorityIndex(a) - priorityIndex(b))
      const numberOfPeople = activeMembers.length || 1

      // Resolve next week's meal plan ID for cross-week leftovers
      let nextWeekMealPlanIdForSuggest = nextWeekMealPlan?.id
      if (!nextWeekMealPlanIdForSuggest) {
        const { data: existingNext } = await supabase
          .from('meal_plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('week_start_date', nextWeekStartDate)
          .single()
        if (existingNext) {
          nextWeekMealPlanIdForSuggest = existingNext.id
        } else {
          const { data: newNext } = await supabase
            .from('meal_plans')
            .insert([{ user_id: user.id, week_start_date: nextWeekStartDate }])
            .select()
            .single()
          nextWeekMealPlanIdForSuggest = newNext?.id
        }
      }

      // Track occupied slots, pre-populated with entries we are NOT replacing
      const occupiedEntries = [
        ...(currentMealPlan?.entries || [])
          .filter((e) => !typesToFill.some((m) => mealTypesMatch(m, e.meal_type)))
          .map((e) => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 0 })),
        ...(nextWeekMealPlan?.entries || [])
          .map((e) => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 1 })),
      ]

      const mainEntriesToInsert = []
      const leftoverPlan = []

      for (const mealType of orderedMealTypes) {
        let mealRecipes = eligibleRecipes.filter((r) => recipeMatchesMealSlot(r, mealType))
        if (mealRecipes.length === 0) mealRecipes = eligibleRecipes
        const mealScores = mealRecipes.map((r) => scores[eligibleRecipes.indexOf(r)])

        for (const day of days) {
          const isOccupied = occupiedEntries.some(
            (e) =>
              e.weekOffset === 0 &&
              e.day_of_week === day.name &&
              mealTypesMatch(e.meal_type, mealType)
          )
          if (isOccupied) continue

          const selected = weightedRandomSelect(mealRecipes, mealScores, 1)[0]
          if (!selected?.id) continue

          const mainEntryIndex = mainEntriesToInsert.length
          mainEntriesToInsert.push({
            meal_plan_id: currentMealPlanId,
            recipe_id: selected.id,
            day_of_week: day.name,
            meal_type: mealType,
            servings: selected.servings != null ? selected.servings : null,
          })

          occupiedEntries.push({ day_of_week: day.name, meal_type: mealType, weekOffset: 0 })

          const leftoverSlots = computeLeftoverSlots({
            recipe: selected,
            originDay: day.name,
            mealType,
            numberOfPeople,
            existingEntries: occupiedEntries,
          })

          for (const slot of leftoverSlots) {
            occupiedEntries.push({
              day_of_week: slot.dayOfWeek,
              meal_type: mealType,
              weekOffset: slot.weekOffset,
            })
            leftoverPlan.push({
              recipeId: selected.id,
              dayOfWeek: slot.dayOfWeek,
              weekOffset: slot.weekOffset,
              mealType,
              mainEntryIndex,
            })
          }
        }
      }

      if (mainEntriesToInsert.length === 0) {
        return { ok: false, reason: 'no-entries-generated' }
      }

      // Step 6: Insert main entries
      const { data: insertedData, error: insertError } = await supabase
        .from('meal_plan_entries')
        .insert(mainEntriesToInsert)
        .select()
      if (insertError) throw new Error(`Failed to save meal plan: ${insertError.message}`)

      // Step 6b: Insert leftover entries using inserted entry IDs
      const leftoverInserts = leftoverPlan
        .map((l) => ({
          meal_plan_id: l.weekOffset === 0 ? currentMealPlanId : nextWeekMealPlanIdForSuggest,
          recipe_id: l.recipeId,
          day_of_week: l.dayOfWeek,
          meal_type: l.mealType,
          is_leftover: true,
          original_entry_id: insertedData?.[l.mainEntryIndex]?.id,
          servings: insertedData?.[l.mainEntryIndex]?.servings ?? null,
        }))
        .filter((e) => e.meal_plan_id && e.original_entry_id)

      if (leftoverInserts.length > 0) {
        const { error: leftoverError } = await supabase
          .from('meal_plan_entries')
          .insert(leftoverInserts)
        if (leftoverError) {
          // Match the original code's behavior: log but do not fail the whole flow
          console.error('[useMealPlanSuggest] Error inserting leftovers:', leftoverError)
        }
      }

      posthog.capture('meal_slot_filled', { source: 'suggest', count: insertedData?.length ?? 0 })

      // Step 7: Invalidate + refetch React Query cache
      await queryClient.invalidateQueries({ queryKey: ['mealPlan', user.id, weekStartDate] })
      await queryClient.refetchQueries({ queryKey: ['mealPlan', user.id, weekStartDate] })

      return { ok: true }
    } catch (error) {
      return { ok: false, reason: 'error', error: error?.message ?? String(error) }
    } finally {
      setIsPending(false)
    }
  }, [
    user,
    queryClient,
    weekStartDate,
    nextWeekStartDate,
    recipes,
    recentRecipeIds,
    activeMembers,
    currentMealPlan,
    nextWeekMealPlan,
    days,
  ])

  return { suggest, isPending }
}
