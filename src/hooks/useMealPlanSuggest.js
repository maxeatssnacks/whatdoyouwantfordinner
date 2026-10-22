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
} from '../lib/utils'
import { addRecipeDay, dayNumber, mealTypePool, recipeDays, slotChoices } from '../v2/lib/planRank'

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
 *   does a recipe repeat; those come back as `repeats` so the caller can say so;
 * - the repeat rule (step 6a, slotChoices in src/v2/lib/planRank.js): a meal
 *   needs at least one free day between it (its cook day and the leftovers
 *   it would get) and any other meal of the same recipe, last week's and
 *   next week's included; a repeat takes the recipe with the biggest gap. If
 *   no recipe qualifies, the day stays open and comes back in `openDays`;
 * - a meal type plans from recipes tagged for it, and from every recipe only
 *   when nothing at all is tagged for it. When tagged recipes exist but were
 *   all used recently, it's 'no-eligible-recipes' (the "Plan anyway" step)
 *   rather than another type's recipes (step 6a, mealTypePool);
 * - afterwards every week's plan and the recency history are refreshed.
 *
 * Inputs are passed in (rather than re-fetched) so callers can reuse the
 * data they've already loaded for rendering.
 *
 * Returns { suggest, isPending } where suggest({ mealTypes, bypassRecencyFilter })
 * resolves to a result object the caller maps onto its own UI:
 *   { ok: true, repeats: string[], openDays: [{ dayOfWeek, mealType }] }
 *     (titles cooked again because the pool ran out; days left open)
 *   { ok: false, reason: 'no-recipes' | 'no-user' | 'no-entries-generated' }
 *   { ok: false, reason: 'no-different-recipes', openDays }   (every day left open; nothing changed)
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
  previousWeekMealPlan,
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
      const baseRecipes = recipes.filter((recipe) => {
        if (recipe.recipe_type === 'quick') return false
        if (activeMembers.length > 0 && recipeContainsAvoidedIngredients(recipe, activeMembers)) return false
        return true
      })
      const eligibleRecipes = baseRecipes.filter((recipe) => !effectiveRecentIds.includes(recipe.id))

      if (eligibleRecipes.length === 0) {
        return {
          ok: false,
          reason: 'no-eligible-recipes',
          canBypassRecency: !bypassRecencyFilter && (recentRecipeIds || []).length > 0,
          mealTypes: typesToFill,
        }
      }

      // Each meal type plans from its own tagged recipes; every recipe only
      // when nothing at all is tagged for it. Tagged recipes that were all
      // used recently mean "Plan anyway", not dinner from the snacks.
      const poolByType = new Map(typesToFill.map((t) => [t, mealTypePool({ base: baseRecipes, eligible: eligibleRecipes, mealType: t })]))
      const needBypass = typesToFill.filter((t) => poolByType.get(t).needsBypass)
      if (needBypass.length > 0) {
        return { ok: false, reason: 'no-eligible-recipes', canBypassRecency: true, mealTypes: needBypass }
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

      // Variety (SG-8, step 6a): every day (0 = this week's Sunday, −7…−1
      // last week, 7+ next week) each recipe is on. Recipes staying on this
      // week's plan count as used, so a run doesn't cook them again while
      // fresh recipes remain, and no meal lands right next to another meal
      // of the same recipe.
      const stays = (e) => !replacedIds.has(e.id) && !replacedIds.has(e.original_entry_id)
      const usedDays = recipeDays([
        { weekOffset: -1, entries: previousWeekMealPlan?.entries || [] },
        { weekOffset: 0, entries: (currentMealPlan?.entries || []).filter(stays) },
        { weekOffset: 1, entries: (nextWeekMealPlan?.entries || []).filter(stays) },
      ])
      const repeatedIds = new Set()
      const openDays = []

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
        const mealRecipes = poolByType.get(mealType).recipes

        for (const day of days) {
          const isOccupied = occupiedEntries.some(
            (e) =>
              e.weekOffset === 0 &&
              e.day_of_week === day.name &&
              mealTypesMatch(e.meal_type, mealType)
          )
          if (isOccupied) continue

          // Leftovers come from the recipe's own servings (capped); the cooked
          // amount then matches what's eaten: people × (1 + leftovers placed).
          // Each candidate's meal is its cook day plus the leftovers it would get.
          const candidates = mealRecipes.map((recipe) => {
            const leftoverSlots = computeLeftoverSlots({
              recipe,
              originDay: day.name,
              mealType,
              numberOfPeople,
              existingEntries: occupiedEntries,
            })
            const block = [dayNumber(day.name), ...leftoverSlots.map((s) => dayNumber(s.dayOfWeek, s.weekOffset))]
            return { recipe, leftoverSlots, block }
          })

          // A recipe not used yet, weighted by score. Once every eligible
          // recipe is used, a repeat with the biggest gap to its other meals;
          // none qualifies, so the day stays open.
          const { fresh, repeats } = slotChoices({ candidates, days: usedDays, score: (r) => scoreById.get(r.id) })
          let choice
          if (fresh.length > 0) {
            choice = weightedRandomSelect(fresh, fresh.map((c) => scoreById.get(c.recipe.id)), 1)[0]
          } else if (repeats.length > 0) {
            choice = repeats[0]
            repeatedIds.add(choice.recipe.id)
          } else {
            openDays.push({ dayOfWeek: day.name, mealType })
            continue
          }
          const { recipe: selected, leftoverSlots } = choice

          occupiedEntries.push({ day_of_week: day.name, meal_type: mealType, weekOffset: 0 })
          for (const d of choice.block) addRecipeDay(usedDays, selected.id, d)

          const mainEntryIndex = mainEntriesToInsert.length
          mainEntriesToInsert.push({
            meal_plan_id: currentMealPlanId,
            recipe_id: selected.id,
            day_of_week: day.name,
            meal_type: mealType,
            servings: numberOfPeople * (1 + leftoverSlots.length),
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
        if (openDays.length > 0) return { ok: false, reason: 'no-different-recipes', openDays }
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
      return { ok: true, repeats, openDays }
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
    previousWeekMealPlan,
    days,
    keepEntryIds,
  ])

  return { suggest, isPending }
}
