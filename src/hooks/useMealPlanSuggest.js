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
  DAY_ORDER,
} from '../lib/utils'

const MEAL_TYPE_PRIORITY = ['dinner', 'lunch', 'breakfast', 'snack']
const priorityIndex = (mt) => {
  const i = MEAL_TYPE_PRIORITY.indexOf(String(mt).toLowerCase())
  return i === -1 ? MEAL_TYPE_PRIORITY.length : i
}

/**
 * Encapsulates the full Suggest-my-week flow that previously lived inside
 * WeeklyPlanner.handleConfirmSuggest: scoring, recency filtering,
 * dinner→lunch→breakfast→snack priority, and cross-week leftover placement.
 *
 * v2 changes (PARITY IS-3, IS-4, SG-4, SG-8, leftover cap; approved 2026-10-14):
 * - only `days` are planned (the Week page passes today onward on the current
 *   week). Meals on other days are never deleted, and `keepEntryIds` (leftovers
 *   of meals this run doesn't replace) stay where they are;
 * - picks are computed first; existing meals are deleted only once there is
 *   something to insert, and a failed delete aborts before anything changes;
 * - each cooked meal's servings = people × (1 + leftovers actually placed),
 *   with at most MAX_LEFTOVERS_PER_COOK leftovers per cook;
 * - each recipe is cooked at most once per run, and recipes still on this
 *   week's plan count as already used. Only when the eligible pool runs out
 *   does a recipe repeat (the one used longest ago); those come back as
 *   `repeats` so the caller can say so;
 * - afterwards every week's plan and the recency history are refreshed.
 *
 * Inputs are passed in (rather than re-fetched) so callers can reuse the
 * data they've already loaded for rendering.
 *
 * Returns { suggest, isPending } where suggest({ mealTypes, bypassRecencyFilter })
 * resolves to a result object the caller maps onto its own UI:
 *   { ok: true, repeats: string[] }   (titles cooked again because the pool ran out)
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
  keepEntryIds,
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

      // Step 2: Filter recipes. Nothing has been deleted yet, so bailing out
      // here (e.g. everything was used recently) leaves the week untouched.
      const effectiveRecentIds = bypassRecencyFilter ? [] : (recentRecipeIds || [])
      const eligibleRecipes = recipes.filter((recipe) => {
        if (recipe.recipe_type === 'quick') return false
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

      // Step 3: The meals this run replaces: the selected meal types on the
      // days being planned, leftovers included, except the ones the caller
      // keeps. Their leftovers in other weeks go with them (original_entry_id
      // is ON DELETE CASCADE), so those don't block slots.
      const planDayNames = new Set(days.map((d) => d.name))
      const keep = new Set(keepEntryIds || [])
      const entriesToReplace = (currentMealPlan?.entries || []).filter((e) =>
        planDayNames.has(e.day_of_week) &&
        !keep.has(e.id) &&
        typesToFill.some((m) => mealTypesMatch(m, e.meal_type))
      )
      const replacedIds = new Set(entriesToReplace.map((e) => e.id))

      // Step 4: Score recipes for weighted random selection
      const scoreById = new Map(
        eligibleRecipes.map((recipe) => [recipe.id, scoreRecipeForHousehold(recipe, activeMembers)])
      )

      // Variety (SG-8): the latest day (0 = this week's Sunday, 7+ = next
      // week) each recipe is on. Recipes staying on this week's plan count as
      // used, so a run doesn't cook them again while fresh recipes remain.
      const lastUsed = new Map()
      const markUsed = (recipeId, dayIdx) => {
        if (recipeId && !(lastUsed.get(recipeId) >= dayIdx)) lastUsed.set(recipeId, dayIdx)
      }
      for (const e of currentMealPlan?.entries || []) {
        if (replacedIds.has(e.id) || replacedIds.has(e.original_entry_id)) continue
        markUsed(e.recipe_id, DAY_ORDER.indexOf(e.day_of_week))
      }
      const repeatedIds = new Set()

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
          .filter((e) => !replacedIds.has(e.id))
          .map((e) => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 0 })),
        ...(nextWeekMealPlan?.entries || [])
          .filter((e) => !replacedIds.has(e.original_entry_id))
          .map((e) => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: 1 })),
      ]

      const mainEntriesToInsert = []
      const leftoverPlan = []

      for (const mealType of orderedMealTypes) {
        let mealRecipes = eligibleRecipes.filter((r) => recipeMatchesMealSlot(r, mealType))
        if (mealRecipes.length === 0) mealRecipes = eligibleRecipes

        for (const day of days) {
          const isOccupied = occupiedEntries.some(
            (e) =>
              e.weekOffset === 0 &&
              e.day_of_week === day.name &&
              mealTypesMatch(e.meal_type, mealType)
          )
          if (isOccupied) continue

          // A recipe not used yet, weighted by score. Once every eligible
          // recipe is used, repeat the one used longest ago.
          const fresh = mealRecipes.filter((r) => !lastUsed.has(r.id))
          let selected
          if (fresh.length > 0) {
            selected = weightedRandomSelect(fresh, fresh.map((r) => scoreById.get(r.id)), 1)[0]
          } else {
            selected = mealRecipes.reduce((oldest, r) => (lastUsed.get(r.id) < lastUsed.get(oldest.id) ? r : oldest))
            repeatedIds.add(selected.id)
          }
          if (!selected?.id) continue

          occupiedEntries.push({ day_of_week: day.name, meal_type: mealType, weekOffset: 0 })
          markUsed(selected.id, DAY_ORDER.indexOf(day.name))

          // Leftovers come from the recipe's own servings (capped); the cooked
          // amount then matches what's eaten: people × (1 + leftovers placed).
          const leftoverSlots = computeLeftoverSlots({
            recipe: selected,
            originDay: day.name,
            mealType,
            numberOfPeople,
            existingEntries: occupiedEntries,
          })

          const mainEntryIndex = mainEntriesToInsert.length
          mainEntriesToInsert.push({
            meal_plan_id: currentMealPlanId,
            recipe_id: selected.id,
            day_of_week: day.name,
            meal_type: mealType,
            servings: numberOfPeople * (1 + leftoverSlots.length),
          })

          for (const slot of leftoverSlots) {
            markUsed(selected.id, slot.weekOffset * 7 + DAY_ORDER.indexOf(slot.dayOfWeek))
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

      // Step 5b: Only now clear the meals being replaced, in one statement.
      // If that fails, stop before inserting so the week stays as it was.
      if (replacedIds.size > 0) {
        const { error: deleteError } = await supabase
          .from('meal_plan_entries')
          .delete()
          .in('id', [...replacedIds])
        if (deleteError) throw new Error(`Couldn't replace your current meals: ${deleteError.message}`)
      }

      // Step 6: Insert main entries
      const { data: insertedData, error: insertError } = await supabase
        .from('meal_plan_entries')
        .insert(mainEntriesToInsert)
        .select()
      if (insertError) {
        throw new Error(`The old meals were cleared but the new plan couldn't be saved (${insertError.message})`)
      }

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

      // Step 7: Refresh every week (leftovers can land in next week) and the
      // recency history the next suggest or swap filters on.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mealPlan'] }),
        queryClient.invalidateQueries({ queryKey: ['recentMealHistory'] }),
      ])

      const repeats = [...repeatedIds]
        .map((id) => eligibleRecipes.find((r) => r.id === id)?.title)
        .filter(Boolean)
      return { ok: true, repeats }
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
    keepEntryIds,
  ])

  return { suggest, isPending }
}
