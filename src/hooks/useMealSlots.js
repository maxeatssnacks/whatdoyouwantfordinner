import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { normalizeMealType, mealTypesMatch } from '../lib/utils'

export const DEFAULT_MEAL_SLOTS = [
  { name: 'Breakfast', sort_order: 0 },
  { name: 'Lunch', sort_order: 1 },
  { name: 'Dinner', sort_order: 2 },
  { name: 'Snack', sort_order: 3 },
]

// Seeds default slots for the user if they have none. Returns the seeded rows.
async function seedDefaults(userId) {
  const toInsert = DEFAULT_MEAL_SLOTS.map(s => ({
    user_id: userId,
    name: s.name,
    sort_order: s.sort_order,
  }))
  const { data, error } = await supabase
    .from('meal_slots')
    .insert(toInsert)
    .select()
    .order('sort_order')
  if (error) throw error
  return data
}

// Ensures the user has at least the defaults seeded. Returns true if seeding occurred.
async function ensureSeeded(userId) {
  const { data: existing } = await supabase
    .from('meal_slots')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
  if (!existing || existing.length === 0) {
    await seedDefaults(userId)
    return true
  }
  return false
}

async function getMealPlanIdsForUser(userId) {
  const { data: plans } = await supabase.from('meal_plans').select('id').eq('user_id', userId)
  return (plans || []).map((p) => p.id)
}

async function updateMealPlanEntriesMealTypeForSlot(planIds, oldName, newName) {
  if (!planIds.length) return
  const normNew = normalizeMealType(newName)
  const { data: rows, error: selErr } = await supabase
    .from('meal_plan_entries')
    .select('id, meal_type')
    .in('meal_plan_id', planIds)
  if (selErr) throw selErr
  const ids = (rows || []).filter((e) => mealTypesMatch(e.meal_type, oldName)).map((e) => e.id)
  if (ids.length === 0) return
  const { error } = await supabase
    .from('meal_plan_entries')
    .update({ meal_type: normNew })
    .in('id', ids)
  if (error) throw error
}

async function deleteMealPlanEntriesForSlot(planIds, slotName) {
  if (!planIds.length) return
  const { data: rows, error: selErr } = await supabase
    .from('meal_plan_entries')
    .select('id, meal_type')
    .in('meal_plan_id', planIds)
  if (selErr) throw selErr
  const ids = (rows || []).filter((e) => mealTypesMatch(e.meal_type, slotName)).map((e) => e.id)
  if (ids.length === 0) return
  const { error } = await supabase.from('meal_plan_entries').delete().in('id', ids)
  if (error) throw error
}

export function useMealSlots() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['mealSlots', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_slots')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order')
      if (error) throw error

      // Return defaults (with isDefault flag) if the user has no rows yet
      if (!data || data.length === 0) {
        return DEFAULT_MEAL_SLOTS.map(s => ({
          id: `__default_${s.name}`,
          user_id: user.id,
          name: s.name,
          sort_order: s.sort_order,
          isDefault: true,
        }))
      }
      return data
    },
    enabled: !!user,
  })
}

// Adds a new slot. Seeds defaults first if the user has none.
export function useAddMealSlot() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name }) => {
      await ensureSeeded(user.id)

      const { data: existing } = await supabase
        .from('meal_slots')
        .select('sort_order')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: false })
        .limit(1)

      const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

      const { data, error } = await supabase
        .from('meal_slots')
        .insert([{ user_id: user.id, name, sort_order: nextOrder }])
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mealSlots'] }),
  })
}

// Renames a slot and updates all meal_plan_entries for this user with the old name.
export function useRenameMealSlot() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, oldName, newName }) => {
      if (!newName || newName === oldName) return

      await ensureSeeded(user.id)

      // Update all meal_plan_entries for this user that reference the old slot name
      const { data: plans } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('user_id', user.id)

      if (plans && plans.length > 0) {
        const planIds = plans.map((p) => p.id)
        await updateMealPlanEntriesMealTypeForSlot(planIds, oldName, newName)
      }

      // Update the slot name. For default stubs (no real id), insert instead.
      if (id.startsWith('__default_')) {
        const { data: fresh } = await supabase
          .from('meal_slots')
          .select('*')
          .eq('user_id', user.id)
          .eq('name', oldName)
          .single()
        if (fresh) {
          const { error } = await supabase
            .from('meal_slots')
            .update({ name: newName })
            .eq('id', fresh.id)
            .eq('user_id', user.id)
          if (error) throw error
        }
      } else {
        const { error } = await supabase
          .from('meal_slots')
          .update({ name: newName })
          .eq('id', id)
          .eq('user_id', user.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealSlots'] })
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
    },
  })
}

// Saves the full ordered slot list (upserts all rows with updated sort_order).
export function useReorderMealSlots() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (slots) => {
      // If any are defaults, seed first then re-fetch to get real IDs
      if (slots.some(s => s.isDefault)) {
        await seedDefaults(user.id)
        const { data: seeded } = await supabase
          .from('meal_slots')
          .select('*')
          .eq('user_id', user.id)
          .order('sort_order')
        // Apply the new order based on position in the passed array
        const nameToSeeded = Object.fromEntries((seeded || []).map(s => [s.name, s]))
        const toUpdate = slots.map((s, i) => ({ id: nameToSeeded[s.name]?.id, sort_order: i }))
        for (const row of toUpdate) {
          if (!row.id) continue
          await supabase.from('meal_slots').update({ sort_order: row.sort_order }).eq('id', row.id).eq('user_id', user.id)
        }
        return
      }

      for (const slot of slots) {
        await supabase
          .from('meal_slots')
          .update({ sort_order: slot.sort_order })
          .eq('id', slot.id)
          .eq('user_id', user.id)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mealSlots'] }),
  })
}

// Deletes a slot. Caller should already have confirmed with the user if entries exist.
export function useDeleteMealSlot() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name }) => {
      await ensureSeeded(user.id)

      // Delete all meal_plan_entries belonging to this user with this slot name
      const { data: plans } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('user_id', user.id)

      if (plans && plans.length > 0) {
        const planIds = plans.map((p) => p.id)
        await deleteMealPlanEntriesForSlot(planIds, name)
      }

      // Resolve real id for default stubs
      let realId = id
      if (id.startsWith('__default_')) {
        const { data: row } = await supabase
          .from('meal_slots')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', name)
          .single()
        realId = row?.id
      }

      if (realId) {
        const { error } = await supabase
          .from('meal_slots')
          .delete()
          .eq('id', realId)
          .eq('user_id', user.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealSlots'] })
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
    },
  })
}

// Saves all slot changes (renames + reorder) in a single batch.
// slots: the current localSlots array (DB state)
// draftNames: { [slotId]: draftName } overrides
export function useBatchSaveMealSlots() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ slots, draftNames }) => {
      // Resolve default stubs to real DB rows first
      let workingSlots = slots
      let resolvedDraftNames = { ...draftNames }

      const hasDefaults = slots.some(s => s.isDefault)
      if (hasDefaults) {
        await seedDefaults(user.id)
        const { data: seeded } = await supabase
          .from('meal_slots')
          .select('*')
          .eq('user_id', user.id)
          .order('sort_order')
        const nameToReal = Object.fromEntries((seeded || []).map(s => [s.name, s]))
        // Re-key draftNames from stub IDs to real IDs
        workingSlots = slots.map(s => {
          if (!s.isDefault) return s
          const real = nameToReal[s.name]
          if (!real) return s
          if (resolvedDraftNames[s.id] !== undefined) {
            resolvedDraftNames[real.id] = resolvedDraftNames[s.id]
            delete resolvedDraftNames[s.id]
          }
          return { ...s, id: real.id, isDefault: false }
        })
      }

      // Collect renames: slots where draft differs from DB name
      const renames = workingSlots
        .map(s => {
          const draft = resolvedDraftNames[s.id]
          if (draft && draft !== s.name) return { oldName: s.name, newName: draft }
          return null
        })
        .filter(Boolean)

      // Batch update meal_plan_entries in parallel (one query per renamed slot)
      if (renames.length > 0) {
        const { data: plans } = await supabase
          .from('meal_plans')
          .select('id')
          .eq('user_id', user.id)

        const planIds = (plans || []).map(p => p.id)
        if (planIds.length > 0) {
          await Promise.all(
            renames.map(({ oldName, newName }) =>
              updateMealPlanEntriesMealTypeForSlot(planIds, oldName, newName)
            )
          )
        }
      }

      // Single batch upsert: final names + sort_orders for all slots
      const toUpsert = workingSlots.map((s, i) => ({
        id: s.id,
        user_id: user.id,
        name: resolvedDraftNames[s.id] ?? s.name,
        sort_order: i,
      }))

      const { error } = await supabase
        .from('meal_slots')
        .upsert(toUpsert, { onConflict: 'id' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealSlots'] })
      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })
    },
  })
}

// Returns the count of meal_plan_entries for the user that use a given slot name.
export async function countEntriesForSlot(userId, slotName) {
  const planIds = await getMealPlanIdsForUser(userId)
  if (planIds.length === 0) return 0

  const { data: rows, error } = await supabase
    .from('meal_plan_entries')
    .select('meal_type')
    .in('meal_plan_id', planIds)
  if (error) throw error
  return (rows || []).filter((e) => mealTypesMatch(e.meal_type, slotName)).length
}
