import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { getPlannerWeekStartDateString, computeLeftoverSlots, normalizeMealType } from '../lib/utils'

/** Explicit columns so JSONB `ingredients` is always returned (avoid nested `*`). */
const RECIPE_EMBED_MEAL_PLAN = `
  id,
  title,
  description,
  image_url,
  source_url,
  cuisine_type,
  meal_tags,
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
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
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
    },
  })
}

export function useRemoveMealPlanEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id) => {
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
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0]

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
