import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { getPlannerWeekStartDateString, computeLeftoverSlots, normalizeMealType, formatLocalDateString } from '../lib/utils'

/** Explicit columns so JSONB `ingredients` is always returned (avoid nested `*`). */
const RECIPE_EMBED_MEAL_PLAN = `
  id,
  title,
  description,
  image_url,
  source_url,
  cuisine_type,
  meal_tags,
  recipe_type,
  difficulty,
  cook_time_minutes,
  servings,
  calories,
  protein_g,
  carbs_g,
  fat_g,
  ingredients,
  instructions,
  dietary_tags,
  status,
  created_by,
  created_at,
  updated_at,
  admin_note,
  pending_edit_data,
  slug
`

export function useMealPlan(weekStartDate, { enabled = true } = {}) {
  const { user } = useAuth()
  const startDate = weekStartDate || getPlannerWeekStartDateString(0)

  return useQuery({
    queryKey: ['mealPlan', user?.id, startDate],
    queryFn: async () => {
      console.log('[useMealPlan] Fetching meal plan for:', startDate)

      // Get all matching plans (won't error on zero or multiple rows)
      const { data: existingPlans, error: planError } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start_date', startDate)
        .order('created_at', { ascending: true })

      if (planError) {
        console.error('[useMealPlan] Error fetching meal plan:', planError)
        throw planError
      }

      let mealPlan = null
      if (existingPlans && existingPlans.length > 0) {
        // Use the oldest plan; warn loudly if duplicates exist (shouldn't happen post-constraint)
        mealPlan = existingPlans[0]
        if (existingPlans.length > 1) {
          console.warn(
            `[useMealPlan] Found ${existingPlans.length} duplicate meal plans for week ${startDate}. ` +
            `Using oldest (${mealPlan.id}). Database uniqueness constraint should prevent this.`
          )
        } else {
          console.log('[useMealPlan] Found existing meal plan:', mealPlan.id)
        }
      }

      // Only create if truly nothing exists
      if (!mealPlan) {
        const { data: newPlan, error: createError } = await supabase
          .from('meal_plans')
          .insert([{ user_id: user.id, week_start_date: startDate }])
          .select()
          .single()

        if (createError) {
          // If the unique constraint catches a race condition, fetch the row that won the race
          if (createError.code === '23505') {
            console.warn('[useMealPlan] Race condition on create — fetching existing plan instead')
            const { data: racedPlan, error: racedError } = await supabase
              .from('meal_plans')
              .select('*')
              .eq('user_id', user.id)
              .eq('week_start_date', startDate)
              .order('created_at', { ascending: true })
              .limit(1)
              .single()
            if (racedError) throw racedError
            mealPlan = racedPlan
          } else {
            console.error('[useMealPlan] Error creating meal plan:', createError)
            throw createError
          }
        } else {
          mealPlan = newPlan
          console.log('[useMealPlan] Created meal plan:', mealPlan.id)
        }
      }

      // Get meal plan entries with recipe details
      const { data: entries, error: entriesError } = await supabase
        .from('meal_plan_entries')
        .select(`
          *,
          recipe:recipes(${RECIPE_EMBED_MEAL_PLAN})
        `)
        .eq('meal_plan_id', mealPlan.id)

      if (entriesError) {
        console.error('[useMealPlan] Error fetching entries:', entriesError)
        throw entriesError
      }

      console.log('[useMealPlan] Loaded', entries?.length || 0, 'entries')

      return {
        ...mealPlan,
        entries: entries || [],
      }
    },
    enabled: !!user && enabled,
  })
}

export function useAddMealPlanEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ mealPlanId, recipeId, dayOfWeek, mealType, isLeftover = false, originalEntryId = null, servings = null }) => {
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .insert([{
          meal_plan_id: mealPlanId,
          recipe_id: recipeId,
          day_of_week: dayOfWeek,
          meal_type: normalizeMealType(mealType),
          is_leftover: isLeftover,
          original_entry_id: originalEntryId,
          ...(servings !== null ? { servings } : {}),
        }])
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
      // Adds and swaps change what counts as recent (PARITY IS-4).
      queryClient.invalidateQueries({ queryKey: ['recentMealHistory'] })
    },
  })
}

export function useUpdateMealPlanEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, recipeId }) => {
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .update({ recipe_id: recipeId })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Keep leftover entries spawned from this cook event pointing at the same recipe
      const { error: leftoverError } = await supabase
        .from('meal_plan_entries')
        .update({ recipe_id: recipeId })
        .eq('original_entry_id', id)
      if (leftoverError) throw leftoverError

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
      // Adds and swaps change what counts as recent (PARITY IS-4).
      queryClient.invalidateQueries({ queryKey: ['recentMealHistory'] })
    },
  })
}

export function useUpdateEntryServings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, servings }) => {
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .update({ servings })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
    },
  })
}

export function useMoveMealPlanEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, dayOfWeek, mealType }) => {
      const updates = {}
      if (dayOfWeek) updates.day_of_week = dayOfWeek
      if (mealType) updates.meal_type = normalizeMealType(mealType)

      const { data, error } = await supabase
        .from('meal_plan_entries')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
    },
  })
}

export function usePlaceLeftovers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      originalEntryId,
      recipe,
      originDay,
      mealType,
      numberOfPeople,
      existingEntries,
      currentWeekMealPlanId,
      nextWeekMealPlanId,
      servings,
    }) => {
      const slots = computeLeftoverSlots({
        recipe,
        originDay,
        mealType,
        numberOfPeople,
        existingEntries,
        servings,
      })

      if (slots.length === 0) return []

      let leftoverServings = null
      if (servings != null && servings !== '') {
        const n = Number(servings)
        if (Number.isFinite(n) && n > 0) leftoverServings = n
      }
      if (leftoverServings == null && recipe?.servings != null) {
        const r = Number(recipe.servings)
        if (Number.isFinite(r) && r > 0) leftoverServings = r
      }

      const toInsert = slots
        .map(slot => ({
          meal_plan_id: slot.weekOffset === 0 ? currentWeekMealPlanId : nextWeekMealPlanId,
          recipe_id: recipe.id,
          day_of_week: slot.dayOfWeek,
          meal_type: normalizeMealType(mealType),
          is_leftover: true,
          original_entry_id: originalEntryId,
          servings: leftoverServings,
        }))
        .filter(e => e.meal_plan_id)

      if (toInsert.length === 0) return []

      const { data, error } = await supabase
        .from('meal_plan_entries')
        .insert(toInsert)
        .select()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
      // Adds and swaps change what counts as recent (PARITY IS-4).
      queryClient.invalidateQueries({ queryKey: ['recentMealHistory'] })
    },
  })
}

export function useRemoveMealPlanEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id) => {
      // Delete any leftover entries owned by this cook event first, then the entry
      const { error: leftoverError } = await supabase
        .from('meal_plan_entries')
        .delete()
        .eq('original_entry_id', id)
      if (leftoverError) throw leftoverError

      const { error } = await supabase
        .from('meal_plan_entries')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
    },
  })
}

/**
 * Puts one recipe in one slot (the v2 meal picker, and Recipes in swap mode).
 * - `target.replaceEntryId`: that entry keeps its id and gets the new recipe
 *   and servings; its old leftovers are deleted. Otherwise a new entry is added.
 * - `leftovers`: where the new recipe's leftovers go (same meal type, servings
 *   copied from the cook entry). The caller works these out (cap, free days,
 *   today forward), so this hook only writes.
 * - `extraDays`: more cooked entries of the same recipe (quick meals' "Also add to").
 * The entry is written first, so a failure there leaves the plan unchanged.
 * A failure after that throws an Error with `partial: true`.
 */
export function useFillMealSlot() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ recipeId, mealType, target, leftovers = [], extraDays = [] }) => {
      const meal_type = normalizeMealType(mealType)
      const servings = target.servings ?? null
      let entry
      if (target.replaceEntryId) {
        const { data, error } = await supabase
          .from('meal_plan_entries')
          .update({ recipe_id: recipeId, servings })
          .eq('id', target.replaceEntryId)
          .select()
          .single()
        if (error) throw error
        entry = data
      } else {
        const { data, error } = await supabase
          .from('meal_plan_entries')
          .insert([{
            meal_plan_id: target.mealPlanId,
            recipe_id: recipeId,
            day_of_week: target.dayOfWeek,
            meal_type,
            is_leftover: false,
            servings,
          }])
          .select()
          .single()
        if (error) throw error
        entry = data
      }

      try {
        if (target.replaceEntryId) {
          const { error } = await supabase
            .from('meal_plan_entries')
            .delete()
            .eq('original_entry_id', entry.id)
          if (error) throw error
        }
        const rows = [
          ...leftovers.filter((l) => l.mealPlanId).map((l) => ({
            meal_plan_id: l.mealPlanId,
            recipe_id: recipeId,
            day_of_week: l.dayOfWeek,
            meal_type,
            is_leftover: true,
            original_entry_id: entry.id,
            servings,
          })),
          ...extraDays.filter((d) => d.mealPlanId).map((d) => ({
            meal_plan_id: d.mealPlanId,
            recipe_id: recipeId,
            day_of_week: d.dayOfWeek,
            meal_type,
            is_leftover: false,
            servings,
          })),
        ]
        if (rows.length) {
          const { error } = await supabase.from('meal_plan_entries').insert(rows)
          if (error) throw error
        }
      } catch (err) {
        throw Object.assign(new Error(err.message || 'Leftovers were not updated'), { partial: true, entry })
      }
      return entry
    },
    // Returned so mutateAsync resolves once the week shows the change.
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] }),
      // Adds and swaps change what counts as recent (PARITY IS-4).
      queryClient.invalidateQueries({ queryKey: ['recentMealHistory'] }),
      queryClient.invalidateQueries({ queryKey: ['recipeEntryCount'] }),
    ]),
  })
}

/** How many of this person's meal plan entries use a recipe, across all weeks. */
export function useRecipeEntryCount(recipeId) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['recipeEntryCount', user?.id, recipeId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('meal_plan_entries')
        .select('id', { count: 'exact', head: true })
        .eq('recipe_id', recipeId)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!user && !!recipeId,
    // Removes elsewhere don't invalidate this key; recount whenever it's shown.
    staleTime: 0,
  })
}

export function useBulkAddMealPlanEntries() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ mealPlanId, entries }) => {
      const { data, error } = await supabase
        .from('meal_plan_entries')
        .insert(
          entries.map((entry) => ({
            meal_plan_id: entry.mealPlanId || mealPlanId,
            recipe_id: entry.recipeId,
            day_of_week: entry.dayOfWeek,
            meal_type: normalizeMealType(entry.mealType),
            is_leftover: entry.isLeftover || false,
            original_entry_id: entry.originalEntryId || null,
            ...(entry.servings != null ? { servings: entry.servings } : {}),
          }))
        )
        .select()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
      // Adds and swaps change what counts as recent (PARITY IS-4).
      queryClient.invalidateQueries({ queryKey: ['recentMealHistory'] })
    },
  })
}

export function useRecentMealHistory(weeksBack = 2) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['recentMealHistory', user?.id, weeksBack],
    queryFn: async () => {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - (weeksBack * 7))
      // Local calendar date, never toISOString() (PARITY IS-5).
      const cutoffDateStr = formatLocalDateString(cutoffDate)

      // Get meal plans from the last X weeks
      const { data: mealPlans, error: plansError } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('user_id', user.id)
        .gte('week_start_date', cutoffDateStr)

      if (plansError) throw plansError

      if (!mealPlans || mealPlans.length === 0) {
        return []
      }

      const planIds = mealPlans.map((p) => p.id)

      // Get all recipe IDs used in those meal plans
      const { data: entries, error: entriesError } = await supabase
        .from('meal_plan_entries')
        .select('recipe_id')
        .in('meal_plan_id', planIds)
        .not('recipe_id', 'is', null)

      if (entriesError) throw entriesError

      return entries.map((e) => e.recipe_id)
    },
    enabled: !!user,
  })
}
