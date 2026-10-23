import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { onHandQuery } from './useOnHand'
import { posthog } from '../lib/posthog'
import {
  recipeContainsAvoidedIngredients,
  normalizeMealType,
  mealTypesMatch,
  getPlannerWeekStartDateString,
} from '../lib/utils'
import { mealTypePool, planWeek } from '../v2/lib/planRank'
import { addDays, prepareOnHand } from '../v2/lib/onHand'

// A row as read (its columns, without the embedded recipe), to put back as it was.
const rowOf = (entry) => Object.fromEntries(Object.entries(entry).filter(([, v]) => v === null || typeof v !== 'object'))

/**
 * Encapsulates the full Suggest-my-week flow that previously lived inside
 * WeeklyPlanner.handleConfirmSuggest: recency filtering, the meal types to
 * fill, and cross-week leftover placement. The picking is planWeek
 * (src/v2/lib/planRank.js, step 6b); this hook does the reads and writes.
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
 * - the repeat rule (step 6a): a meal needs at least one free day between it
 *   (its cook day and the leftovers it would get) and any other meal of the
 *   same recipe, last week's and next week's included. If no recipe
 *   qualifies, the day stays open and comes back in `openDays`;
 * - a meal type plans from recipes tagged for it, and from every recipe only
 *   when nothing at all is tagged for it. When tagged recipes exist but were
 *   all used recently, it's 'no-eligible-recipes' (the "Plan anyway" step)
 *   rather than another type's recipes (step 6a, mealTypePool);
 * - the picks (step 6b): no dice. Among recipes that fit the household's
 *   macros about as well as the best, the ones that share ingredients with
 *   the week and use what's on hand from earlier weeks come first, and the
 *   best week built from the top 5 first meals wins. Planning the same days
 *   again gives the next-best week, with at least one different recipe
 *   whenever the pool has one. On-hand comes from the page's on-hand query
 *   for this week and next, without the meals being replaced; weeks after
 *   next plan on sharing and waste only;
 * - if saving the new meals fails after the old ones were cleared, the old
 *   rows are put back as they were (step 6b);
 * - afterwards every week's plan, on-hand and the recency history are refreshed.
 *
 * Inputs are passed in (rather than re-fetched) so callers can reuse the
 * data they've already loaded for rendering. `thisWeekStartDate` (the week
 * today is in) defaults to the current week.
 *
 * Returns { suggest, isPending } where suggest({ mealTypes, bypassRecencyFilter })
 * resolves to a result object the caller maps onto its own UI:
 *   { ok: true, repeats: string[], openDays: [{ dayOfWeek, mealType }] }
 *     (titles cooked again because the pool ran out; days left open)
 *   { ok: false, reason: 'no-recipes' | 'no-user' | 'no-entries-generated' }
 *   { ok: false, reason: 'no-different-recipes', openDays }   (every day left open; nothing changed)
 *   { ok: false, reason: 'no-eligible-recipes', canBypassRecency, mealTypes }
 *   { ok: false, reason: 'save-failed', restored }   (the new meals couldn't be saved; the old ones are back, or not)
 *   { ok: false, reason: 'error', error: string }
 */
export function useMealPlanSuggest({
  weekStartDate,
  nextWeekStartDate,
  thisWeekStartDate = null,
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
      const needBypass = typesToFill.filter((t) => mealTypePool({ base: baseRecipes, eligible: eligibleRecipes, mealType: t }).needsBypass)
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
      const stays = (e) => !replacedIds.has(e.id) && !replacedIds.has(e.original_entry_id)

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

      // Step 4: What's on hand from earlier weeks, for this week and next:
      // the page's on-hand query (read if it isn't cached yet) with the plans
      // the page holds. Weeks after next plan without it. If it can't be
      // read, planning goes on without it.
      const thisWeek = thisWeekStartDate || getPlannerWeekStartDateString(0)
      let onHandRows = null
      if (weekStartDate === thisWeek || weekStartDate === addDays(thisWeek, 7)) {
        try {
          const query = onHandQuery(user.id, weekStartDate)
          const raw = queryClient.getQueryData(query.queryKey) ?? await queryClient.fetchQuery(query)
          const freshPlans = [previousWeekMealPlan, currentMealPlan, nextWeekMealPlan].filter(Boolean)
          onHandRows = prepareOnHand(raw, freshPlans, { weekStart: weekStartDate })
        } catch (err) {
          console.warn('[useMealPlanSuggest] planning without on-hand:', err?.message ?? err)
        }
      }

      // Step 5: The picks, with their leftovers and servings. Meals that stay
      // (here and in the neighbouring weeks) take their slots and count for
      // the repeat rule and what the week shares.
      const plan = planWeek({
        days,
        slots: typesToFill,
        pool: eligibleRecipes,
        kept: [
          ...(previousWeekMealPlan?.entries || []).map((e) => ({ ...e, weekOffset: -1 })),
          ...(currentMealPlan?.entries || []).filter(stays).map((e) => ({ ...e, weekOffset: 0 })),
          ...(nextWeekMealPlan?.entries || []).filter(stays).map((e) => ({ ...e, weekOffset: 1 })),
        ],
        onHand: onHandRows,
        members: activeMembers,
        replacing: entriesToReplace,
      })

      const mainEntriesToInsert = []
      const leftoverPlan = []
      for (const meal of plan.meals) {
        const mainEntryIndex = mainEntriesToInsert.length
        mainEntriesToInsert.push({
          meal_plan_id: currentMealPlanId,
          recipe_id: meal.recipe.id,
          day_of_week: meal.dayOfWeek,
          meal_type: meal.mealType,
          servings: meal.servings,
        })
        for (const slot of meal.leftovers) {
          leftoverPlan.push({
            recipeId: meal.recipe.id,
            dayOfWeek: slot.dayOfWeek,
            weekOffset: slot.weekOffset,
            mealType: meal.mealType,
            mainEntryIndex,
          })
        }
      }

      if (mainEntriesToInsert.length === 0) {
        if (plan.openDays.length > 0) return { ok: false, reason: 'no-different-recipes', openDays: plan.openDays }
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

      // Step 6: Insert main entries. If that fails, put the old meals back
      // as they were: the same rows, cooks before their leftovers (their
      // leftovers next week went with them, so those too).
      const { data: insertedData, error: insertError } = await supabase
        .from('meal_plan_entries')
        .insert(mainEntriesToInsert)
        .select()
      if (insertError) {
        console.error('[useMealPlanSuggest] saving the new plan failed:', insertError)
        let restored = true
        if (replacedIds.size > 0) {
          const old = [
            ...entriesToReplace,
            ...(nextWeekMealPlan?.entries || []).filter((e) => replacedIds.has(e.original_entry_id)),
          ].map(rowOf)
          const cooks = old.filter((e) => !e.is_leftover)
          const leftovers = old.filter((e) => e.is_leftover)
          const back = cooks.length ? await supabase.from('meal_plan_entries').insert(cooks) : { error: null }
          const backLeftovers = !back.error && leftovers.length
            ? await supabase.from('meal_plan_entries').insert(leftovers)
            : { error: null }
          restored = !back.error && !backLeftovers.error
          if (!restored) console.error('[useMealPlanSuggest] putting the old meals back failed:', back.error ?? backLeftovers.error)
        }
        await queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
        return { ok: false, reason: 'save-failed', restored }
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

      // Counts only: packages the planned meals don't buy because the week's
      // other cooks buy them or they're on hand, days left open, and whether
      // the run replaced meals already planned.
      posthog.capture('meal_slot_filled', {
        source: 'suggest',
        count: insertedData?.length ?? 0,
        shared_packages: plan.score.shared,
        on_hand_packages: plan.score.fromOnHand,
        open_days: plan.openDays.length,
        replan: plan.replan,
      })

      // Step 7: Refresh every week (leftovers can land in next week), what's
      // on hand, and the recency history the next suggest or swap filters on.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mealPlan'] }),
        queryClient.invalidateQueries({ queryKey: ['onHand'] }),
        queryClient.invalidateQueries({ queryKey: ['recentMealHistory'] }),
      ])

      const repeats = plan.repeats
        .map((id) => eligibleRecipes.find((r) => r.id === id)?.title)
        .filter(Boolean)
      return { ok: true, repeats, openDays: plan.openDays }
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
    thisWeekStartDate,
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
