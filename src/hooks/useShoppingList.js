import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { usePackageSizeChoices } from './usePackageSizeChoices'
import {
  generateShoppingItems,
  checkedChange,
  shoppingWeekEnded,
  CATEGORY_ORDER,
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

// Shopping list saves in flight, per week's list. Saves run one after another,
// and reading the list waits for them, so a read never returns what was there
// before the last change (e.g. a save sent as the person leaves the page, then
// they come straight back).
const savesInFlight = new Map()
// Taps made while only a cached copy was showing, by week's list. They're
// applied on top of the fresh read when it lands, here or on the next visit if
// the page closed first.
const tapsBeforeFresh = new Map()

/** One item's identity on the list: its package key, or its name. */
export function shoppingItemId(item) {
  return item?.key || String(item?.name || '').toLowerCase().trim()
}

// An item with a change applied; a field set to undefined is removed (an
// unchecked item loses its bought record).
function applyChange(item, change) {
  const next = { ...item, ...change }
  for (const [k, v] of Object.entries(change)) if (v === undefined) delete next[k]
  return next
}

// JSON with sorted keys: the saved list comes back from Postgres with its keys
// in a different order, which isn't a change.
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/**
 * The saved lists for a week, found through their meal plan in one read, so
 * it can run alongside the meal plan's own read instead of after it.
 * → an array, oldest first (normally one).
 */
export function weekShoppingListQuery(userId, weekStartDate) {
  const queryKey = ['shoppingList', 'byWeek', userId, weekStartDate]
  return {
    queryKey,
    queryFn: async () => {
      await savesInFlight.get(queryKey.join('|'))
      const { data, error } = await supabase
        .from('shopping_lists')
        .select('*, meal_plan:meal_plans!inner(week_start_date)')
        .eq('user_id', userId)
        .eq('meal_plan.week_start_date', weekStartDate)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data || []).map(({ meal_plan, ...list }) => list)
    },
  }
}

/** Loads this week's saved list into the cache ahead of a visit (the Week page). */
export function prefetchWeekShoppingList(queryClient, userId, weekStartDate) {
  if (!userId || !weekStartDate) return
  queryClient.prefetchQuery(weekShoppingListQuery(userId, weekStartDate))
}

// The list for this meal plan (or, before the plan is known, the oldest).
function pickList(lists, mealPlanId) {
  if (!Array.isArray(lists)) return lists
  return lists.find((l) => l.meal_plan_id === mealPlanId) ?? (mealPlanId ? null : lists[0] ?? null)
}

/**
 * This week's shopping list: generated from the meal plan, saved per meal
 * plan. `onToggled(item)` (optional) is called with the item after each
 * bought toggle (the Shopping page's analytics).
 *
 * Checking a line records what was bought on it (`bought`, see checkedChange
 * in src/lib/utils.js). A checked line no meal needs any more stays in the
 * saved items, hidden: it isn't shown, counted in "remaining" or copied.
 *
 * A list whose week has ended (shoppingWeekEnded) is shown as it was saved,
 * never rebuilt or saved again, and its rows don't toggle: it's the record of
 * what that week's list assumed got bought.
 *
 * Loading: a cached copy of the saved list (from an earlier visit, or the
 * Week page's prefetch) shows at once, while the saved list is read fresh on
 * every visit. Nothing is saved until that fresh read lands; a tap made
 * before then is kept and applied on top of the fresh copy, then saved.
 */
export function useWeekShoppingList({ mealPlan, weekStartDate, onToggled }) {
  const { user } = useAuth()
  const onToggledRef = useRef(onToggled)
  onToggledRef.current = onToggled
  const queryClient = useQueryClient()

  const mealPlanId = mealPlan?.id
  const listQuery = useMemo(() => weekShoppingListQuery(user?.id, weekStartDate), [user?.id, weekStartDate])
  const listKey = listQuery.queryKey
  const flightKey = listKey.join('|')
  const { data: sizeChoices, isLoading: choicesLoading } = usePackageSizeChoices()

  const { data: lists, isFetching: listFetching, isError: listError } = useQuery({
    ...listQuery,
    enabled: !!user && !!weekStartDate,
    refetchOnMount: 'always',
  })
  const existingList = pickList(lists, mealPlanId)

  // Whether this visit's fresh read of the saved list has landed.
  const [fresh, setFresh] = useState(false)
  const freshRef = useRef(false)
  const sawFetchRef = useRef(false)
  useEffect(() => {
    if (listFetching) {
      sawFetchRef.current = true
      return
    }
    if (sawFetchRef.current && !listError && lists !== undefined && !freshRef.current) {
      freshRef.current = true
      setFresh(true)
    }
  }, [listFetching, listError, lists])

  const [items, setItems] = useState([])
  const [isReady, setIsReady] = useState(false)
  // The latest items, so a regeneration (new entries or size choices) keeps
  // this visit's checks and Already have choices. Updated as soon as anything
  // changes, never inside a setItems updater.
  const itemsRef = useRef(null)
  // What the last generation was built from (cached or fresh list, entries and size choices).
  const generatedFromRef = useRef(null)

  // Another week's list starts over (not on mount: the first list may already
  // be built from the cache by then). A layout effect declared before the
  // generation below, so it runs first.
  const keyRef = useRef(flightKey)
  useLayoutEffect(() => {
    if (keyRef.current === flightKey) return
    keyRef.current = flightKey
    setIsReady(false)
    setItems([])
    itemsRef.current = null
    generatedFromRef.current = null
    freshRef.current = false
    sawFetchRef.current = false
    setFresh(false)
  }, [flightKey])

  const listIdRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const pendingSaveRef = useRef(null) // items waiting for the 500 ms debounce
  const lastSavedRef = useRef(null) // stableJson of what the server has
  const mealPlanRef = useRef(mealPlan)
  mealPlanRef.current = mealPlan

  useEffect(() => {
    if (existingList?.id) listIdRef.current = existingList.id
  }, [existingList?.id])

  // The cached list follows what's on screen at once (a quick return shows it).
  const writeCache = useCallback((itemsToCache, row = null) => {
    queryClient.setQueryData(listKey, (old) => {
      const all = Array.isArray(old) ? old : []
      const id = listIdRef.current
      const current = all.find((l) => l.id === id) ?? row ?? { id, meal_plan_id: mealPlanId, user_id: user?.id }
      const updated = { ...current, id: id ?? current.id, items: itemsToCache }
      return all.some((l) => l.id === updated.id) ? all.map((l) => (l.id === updated.id ? updated : l)) : [...all, updated]
    })
  }, [queryClient, listKey, mealPlanId, user?.id])

  const saveNow = useCallback((itemsToSave) => {
    if (!mealPlanId || !user?.id) return
    // Checked at the moment of saving: a page left open past Saturday night
    // must not write over last week's list.
    if (shoppingWeekEnded(weekStartDate)) return
    const json = stableJson(itemsToSave)
    if (json === lastSavedRef.current) return
    lastSavedRef.current = json
    const previous = savesInFlight.get(flightKey) ?? Promise.resolve()
    const save = previous.then(async () => {
      try {
        const listId = listIdRef.current
        if (listId) {
          const { error } = await supabase
            .from('shopping_lists')
            .update({ items: itemsToSave })
            .eq('id', listId)
          if (error) throw error
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
          if (error) throw error
          if (data?.id) listIdRef.current = data.id
          writeCache(itemsToSave, data)
        }
      } catch (err) {
        if (lastSavedRef.current === json) lastSavedRef.current = null
        console.error('[useWeekShoppingList] Save failed:', err)
      }
    })
    savesInFlight.set(flightKey, save)
    save.then(() => {
      if (savesInFlight.get(flightKey) === save) savesInFlight.delete(flightKey)
    })
  }, [mealPlanId, user?.id, weekStartDate, flightKey, writeCache])

  const scheduleItemsSave = useCallback((itemsToSave) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    pendingSaveRef.current = itemsToSave
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null
      pendingSaveRef.current = null
      saveNow(itemsToSave)
    }, 500)
  }, [saveNow])

  // Leaving the page sends a waiting save at once, so the next visit's read
  // (which waits for it) sees it.
  const saveNowRef = useRef(saveNow)
  saveNowRef.current = saveNow
  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    if (pendingSaveRef.current) saveNowRef.current(pendingSaveRef.current)
    pendingSaveRef.current = null
  }, [])

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
  const sizeChoicesKey = JSON.stringify(sizeChoices ?? {})

  // Before paint, so a cached list shows without a frame of loading state.
  useLayoutEffect(() => {
    // A failed read with nothing cached still shows the list (without saved
    // state), and saves nothing.
    if (!mealPlanId || choicesLoading || (lists === undefined && !listError)) return
    // Built from the cached list until the fresh read lands, then from that.
    // Afterwards only new entries or size choices regenerate the list; the
    // list's own saves (written into the cache) don't, since rebuilding then
    // could overwrite a tap made a moment earlier.
    const base = fresh ? 'fresh' : 'cached'
    // A list whose week has ended is shown exactly as it was saved.
    if (shoppingWeekEnded(weekStartDate)) {
      const ended = `ended#${base}`
      if (itemsRef.current && generatedFromRef.current === ended) return
      generatedFromRef.current = ended
      const saved = Array.isArray(existingList?.items) ? existingList.items : []
      itemsRef.current = saved
      setItems(saved)
      setIsReady(true)
      return
    }
    const generatedFrom = `${base}#${mealPlanEntriesKey}#${sizeChoicesKey}`
    if (itemsRef.current && generatedFromRef.current === generatedFrom) return
    const freshNow = fresh && !String(generatedFromRef.current).startsWith('fresh')
    generatedFromRef.current = generatedFrom

    const entries = (mealPlanRef.current?.entries || []).filter((e) => e.recipe && e.is_leftover !== true)
    const previousItems = freshNow || !itemsRef.current ? existingList?.items ?? [] : itemsRef.current
    let generated = generateShoppingItems(entries, previousItems, { sizeChoices: sizeChoices ?? {} })
    if (freshNow) {
      lastSavedRef.current = stableJson(existingList?.items ?? [])
      const taps = tapsBeforeFresh.get(flightKey)
      if (taps?.size) {
        generated = generated.map((item) => (taps.has(shoppingItemId(item)) ? applyChange(item, taps.get(shoppingItemId(item))) : item))
        tapsBeforeFresh.delete(flightKey)
      }
    }
    itemsRef.current = generated
    setItems(generated)
    setIsReady(true)
    performance.mark?.('shopping:list-generated')
    // Saved only from the fresh read, never from a cached copy.
    if (fresh) {
      writeCache(generated)
      scheduleItemsSaveRef.current(generated)
    }
    // sizeChoices and existingList are read through their keys and `fresh`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealPlanId, choicesLoading, lists, listError, fresh, mealPlanEntriesKey, sizeChoicesKey, flightKey, weekStartDate])

  // Computed from itemsRef at the tap, then set and saved: no side effects in
  // a state updater, so a quick second tap (or a regeneration) always starts
  // from the latest list. Before the fresh read lands, the change is kept to
  // apply on top of it instead of being saved.
  // → the updated item, or null.
  const updateItem = useCallback((target, patch) => {
    if (!itemsRef.current || shoppingWeekEnded(weekStartDate)) return null
    const id = shoppingItemId(target)
    let updated = null
    let change = null
    const newItems = itemsRef.current.map((item) => {
      if (item.hidden || shoppingItemId(item) !== id) return item
      change = patch(item)
      updated = applyChange(item, change)
      return updated
    })
    itemsRef.current = newItems
    setItems(newItems)
    writeCache(newItems)
    if (freshRef.current) {
      scheduleItemsSave(newItems)
    } else if (change) {
      const taps = tapsBeforeFresh.get(flightKey) ?? new Map()
      taps.set(id, { ...(taps.get(id) ?? {}), ...change })
      tapsBeforeFresh.set(flightKey, taps)
    }
    return updated
  }, [scheduleItemsSave, writeCache, flightKey, weekStartDate])

  // Bought (checked, with what was bought) and "Already have" (have),
  // remembered on this week's list.
  const toggleItem = useCallback((item) => {
    const updated = updateItem(item, (i) => checkedChange(i))
    if (updated) onToggledRef.current?.(updated)
  }, [updateItem])
  const toggleHave = useCallback((item) => updateItem(item, (i) => ({ have: !i.have })), [updateItem])

  // What still needs buying, by category; Already have items are listed
  // apart, and hidden lines (checked, no longer needed) not at all.
  const groupedItems = useMemo(() => {
    const groups = {}
    CATEGORY_ORDER.forEach(cat => { groups[cat] = [] })
    items.forEach(item => {
      if (item.have || item.hidden) return
      const cat = item.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    })
    return Object.fromEntries(
      Object.entries(groups).filter(([, v]) => v.length > 0)
    )
  }, [items])

  const haveItems = useMemo(() => items.filter((item) => item.have && !item.hidden), [items])

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
    // Nothing to show yet: no cached list and the fresh read hasn't landed.
    isLoading: !isReady,
    toggleItem,
    toggleHave,
  }
}
