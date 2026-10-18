import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { usePackageSizeChoices } from './usePackageSizeChoices'
import {
  generateShoppingItems,
  CATEGORY_ORDER,
  getDaysOfWeek,
  parseRecipeIngredientsJsonb,
} from '../lib/utils'

export function useShoppingLists() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['shoppingLists', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    },
    enabled: !!user,
  })
}

export function useShoppingList(id) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['shoppingList', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!user && !!id,
  })
}

export function useCreateShoppingList() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, items, mealPlanId }) => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .insert([
          {
            user_id: user.id,
            name,
            items,
            meal_plan_id: mealPlanId,
          },
        ])
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoppingLists'] })
    },
  })
}

export function useUpdateShoppingList() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['shoppingLists'] })
      queryClient.invalidateQueries({ queryKey: ['shoppingList', data.id] })
    },
  })
}

export function useDeleteShoppingList() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('shopping_lists')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoppingLists'] })
    },
  })
}

/** One item's identity on the list: its package key, or its name. */
export function shoppingItemId(item) {
  return item?.key || String(item?.name || '').toLowerCase().trim()
}

export function useWeekShoppingList({ mealPlan, weekStartDate }) {
  const { user } = useAuth()

  const mealPlanId = mealPlan?.id
  const { data: sizeChoices, isLoading: choicesLoading } = usePackageSizeChoices()

  // Refetched on every visit (and generation waits for it): a cached copy
  // from an earlier visit would bring back checks the person has since changed.
  const { data: existingList, isLoading: listLoading, isFetching: listFetching } = useQuery({
    queryKey: ['shoppingList', 'byMealPlan', mealPlanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .select('*')
        .eq('meal_plan_id', mealPlanId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!user && !!mealPlanId,
    refetchOnMount: 'always',
  })

  const [items, setItems] = useState([])
  const [isReady, setIsReady] = useState(false)
  // The latest items, so a regeneration (new entries or size choices) keeps
  // this visit's checks and Already have choices.
  const itemsRef = useRef(null)

  useEffect(() => {
    setIsReady(false)
    setItems([])
    itemsRef.current = null
  }, [mealPlanId])

  const listIdRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const mealPlanRef = useRef(mealPlan)
  mealPlanRef.current = mealPlan

  useEffect(() => {
    if (existingList?.id) listIdRef.current = existingList.id
  }, [existingList?.id])

  const scheduleItemsSave = useCallback((itemsToSave) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      if (!mealPlanId || !user?.id) return
      const listId = listIdRef.current
      try {
        if (listId) {
          await supabase
            .from('shopping_lists')
            .update({ items: itemsToSave })
            .eq('id', listId)
        } else {
          const dateStr = weekStartDate instanceof Date
            ? weekStartDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : weekStartDate
          const { data, error } = await supabase
            .from('shopping_lists')
            .insert({
              user_id: user.id,
              name: `Shopping List — Week of ${dateStr}`,
              items: itemsToSave,
              meal_plan_id: mealPlanId,
            })
            .select()
            .single()
          if (!error && data?.id) listIdRef.current = data.id
        }
      } catch (err) {
        console.error('[useWeekShoppingList] Save failed:', err)
      }
    }, 500)
  }, [mealPlanId, user?.id, weekStartDate])

  const scheduleItemsSaveRef = useRef(scheduleItemsSave)
  scheduleItemsSaveRef.current = scheduleItemsSave

  const mealPlanEntriesKey = useMemo(
    () =>
      (mealPlan?.entries || [])
        .filter((e) => e.recipe && e.is_leftover !== true)
        .map((e) => [e.id, e.recipe_id, e.servings ?? '', e.recipe?.updated_at ?? ''].join(':'))
        .join('|'),
    [mealPlan?.entries]
  )

  const persistedItemsKey = useMemo(
    () => JSON.stringify(existingList?.items ?? []),
    [existingList?.items]
  )
  const sizeChoicesKey = JSON.stringify(sizeChoices ?? {})

  useEffect(() => {
    if (listLoading || listFetching || choicesLoading || !mealPlanId) return
    const mp = mealPlanRef.current
    const weekDays = getDaysOfWeek(weekStartDate)
    console.log('[useWeekShoppingList] week query range', {
      week_start_param: weekStartDate,
      meal_plan_week_start_date: mp?.week_start_date,
      sunday_through_saturday: weekDays.length
        ? `${weekDays[0].date} → ${weekDays[6].date}`
        : null,
      meal_plan_id: mealPlanId,
    })

    const rawEntries = mp?.entries || []
    console.log('[useWeekShoppingList] raw meal_plan_entries (from useMealPlan)', rawEntries)

    const entries = rawEntries.filter((e) => e.recipe && e.is_leftover !== true)
    console.log(
      '[useWeekShoppingList] entries used for shopping (non-leftover only, ingredients from recipes.ingredients JSONB)',
      entries
    )

    const recipeIngredientSummary = entries.map((e) => ({
      entry_id: e.id,
      recipe_id: e.recipe?.id,
      title: e.recipe?.title,
      is_leftover: e.is_leftover,
      ingredients_from_jsonb_count: parseRecipeIngredientsJsonb(e.recipe).length,
    }))
    console.log('[useWeekShoppingList] recipes / JSONB ingredient rows', recipeIngredientSummary)

    const previousItems = itemsRef.current ?? existingList?.items ?? []
    const generated = generateShoppingItems(entries, previousItems, { sizeChoices: sizeChoices ?? {} })
    itemsRef.current = generated
    setItems(generated)
    setIsReady(true)
    scheduleItemsSaveRef.current(generated)
    // sizeChoices is read through sizeChoicesKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealPlanId, listLoading, listFetching, choicesLoading, mealPlanEntriesKey, persistedItemsKey, sizeChoicesKey, weekStartDate])

  const updateItem = useCallback((target, patch) => {
    const id = shoppingItemId(target)
    setItems(prev => {
      const newItems = prev.map(item => (shoppingItemId(item) === id ? { ...item, ...patch(item) } : item))
      itemsRef.current = newItems
      scheduleItemsSave(newItems)
      return newItems
    })
  }, [scheduleItemsSave])

  // Bought (checked) and "Already have" (have), remembered on this week's list.
  const toggleItem = useCallback((item) => updateItem(item, (i) => ({ checked: !i.checked })), [updateItem])
  const toggleHave = useCallback((item) => updateItem(item, (i) => ({ have: !i.have })), [updateItem])

  // What still needs buying, by category; Already have items are listed apart.
  const groupedItems = useMemo(() => {
    const groups = {}
    CATEGORY_ORDER.forEach(cat => { groups[cat] = [] })
    items.forEach(item => {
      if (item.have) return
      const cat = item.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    })
    return Object.fromEntries(
      Object.entries(groups).filter(([, v]) => v.length > 0)
    )
  }, [items])

  const haveItems = useMemo(() => items.filter((item) => item.have), [items])

  const mealsThisWeek = useMemo(() => {
    const titles = new Set()
    for (const e of mealPlan?.entries || []) {
      if (e.is_leftover === true) continue
      const t = e.recipe?.title?.trim()
      if (t) titles.add(t)
    }
    return [...titles]
  }, [mealPlan?.entries])

  return {
    items,
    groupedItems,
    haveItems,
    mealsThisWeek,
    isShoppingReady: isReady,
    isLoading: listLoading || !mealPlan || (!isReady && !!mealPlanId),
    toggleItem,
    toggleHave,
  }
}
