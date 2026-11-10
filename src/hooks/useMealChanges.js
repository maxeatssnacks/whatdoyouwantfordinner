import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { mealPlanQuery } from './usePlanner'
import {
  applyOps,
  changedColumns,
  mealModel,
  oneOffRecipe,
  planMealChange,
  planMealUndo,
  quickMealUndo,
  reverseOps,
  touchedPlans,
} from '../v2/lib/mealChanges'
import { addDays } from '../v2/lib/onHand'
import { weekStartOf } from '../v2/lib/voice/dates'
import { LEFTOVER_DAYS_AHEAD } from '../lib/utils'

// Meal changes applied and undone row by row (v2 build step 7b): voice's
// eating out, skip, move, swap and add, and "Eating out" from the Week
// page's add sheet and picker. What the rows are, and when an undo is
// skipped, is worked out in src/v2/lib/mealChanges.js; this file reads the
// weeks fresh, writes and refreshes. Each change's rows are written in its
// order; if one fails, what it already wrote is put back. The caches
// refresh once per batch (meal plans, on hand, the recency history, recipe
// counts), so the cards, reasons and the shopping list follow.
// Since 7c a one-off meal's add ({ oneOff: { title, ingredients } }) saves
// its quick meal through ctx.saveQuickMeal only once the add is going in,
// and takes it off again if the add's rows can't be written; its Undo
// removes the quick meal too when nothing else uses it.

// Row ids are made here, so a change knows its rows before they're written
// (a cook's leftovers point at it). randomUUID needs a secure context; a
// phone on the dev server over the LAN isn't one, so fall back to a v4 UUID
// from getRandomValues.
function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

async function write(op) {
  const table = supabase.from('meal_plan_entries')
  const { error } = op.op === 'insert'
    ? await table.insert(op.row)
    : op.op === 'delete'
      ? await table.delete().eq('id', op.row.id)
      : await table.update(changedColumns(op.before, op.after)).eq('id', op.id)
  if (error) throw error
}

// Writes ops in order; on a failure, what was written goes back (newest
// first) and the error is thrown.
async function run(ops) {
  const done = []
  try {
    for (const op of ops) {
      await write(op)
      done.push(op)
    }
  } catch (err) {
    for (const op of reverseOps(done)) {
      try {
        await write(op)
      } catch (back) {
        console.error('[meal changes] putting a row back failed:', back?.message ?? back)
      }
    }
    throw err
  }
}

/** The weeks a batch can touch: last week (leftovers' cooks), this week, next, and the week after when a change is near it. */
export function weeksFor(items = [], today) {
  const thisWeek = weekStartOf(today)
  const weeks = [addDays(thisWeek, -7), thisWeek, addDays(thisWeek, 7)]
  const after = addDays(thisWeek, 14)
  const reach = (d) => d && addDays(d, LEFTOVER_DAYS_AHEAD) >= after
  if (items.some((i) => reach(i.date) || reach(i.toDate))) weeks.push(after)
  return weeks
}

// A quick meal this change saved, taken off again (never published, so a
// hard delete, as useDeleteRecipe does for drafts).
async function dropQuickMeal(id) {
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw error
}

/**
 * apply(items, ctx) → { results: { [item id]: planMealChange's result with
 *   status 'applied' | 'not_changed' | 'failed' (and createdRecipeId when
 *   a one-off meal saved its quick meal) }, model }
 *   items: resolved meal changes (resolveChanges' items, or one built by
 *   the Week page), applied one after another in the order given, each on
 *   the week as the ones before it left it. ctx: planMealChange's (today,
 *   people, recipes, activeMembers, recent, lastCooked, onHandFor), without
 *   newId or start; extraRecipes (the person's quick meals, for an add by
 *   name); for one-off meals, saveQuickMeal({ title, ingredients }) → the
 *   saved recipe row.
 * undo(changes) → { undone, skipped: [{ id, date }], failed, quickMeals:
 *   { removed, kept } } (item ids):
 *   changes are { id, ops, date, plans } (plans: the model's weeks, for the
 *   day a skipped one names), oldest first as applied; they're undone newest
 *   first, and one whose rows aren't as it left them is skipped.
 */
export function useMealChanges() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const refresh = useCallback(() => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['mealPlan'] }),
    queryClient.invalidateQueries({ queryKey: ['onHand'] }),
    queryClient.invalidateQueries({ queryKey: ['recentMealHistory'] }),
    queryClient.invalidateQueries({ queryKey: ['recipeEntryCount'] }),
  ]), [queryClient])

  /** The weeks, read fresh (the same cache entries the Week page shows). */
  const readModel = useCallback(async (weeks, recipes = []) => {
    const plans = await Promise.all(weeks.map((w) => queryClient.fetchQuery({ ...mealPlanQuery(user.id, w), staleTime: 0 })))
    return mealModel(plans, recipes)
  }, [queryClient, user?.id])

  const apply = useCallback(async (items, ctx) => {
    const results = {}
    if (!items?.length || !user?.id) return { results, model: null }
    let model = null
    try {
      // The person's own quick meals (extraRecipes) can be added by name too.
      model = await readModel(weeksFor(items, ctx.today), [...(ctx.recipes ?? []), ...(ctx.extraRecipes ?? [])])
      const start = model
      for (const item of items) {
        let change = item
        let created = null
        if (item.oneOff) {
          // Worked out with the quick meal as it will be; saved only if it goes in.
          const dry = planMealChange(model, { ...item, recipe: oneOffRecipe(item.oneOff) }, { ...ctx, newId, start })
          if (dry.status !== 'applied') {
            results[item.id] = dry
            continue
          }
          try {
            created = await ctx.saveQuickMeal(item.oneOff)
            change = { ...item, recipe: created }
          } catch (err) {
            console.error('[meal changes] saving a quick meal failed:', err?.message ?? err)
            results[item.id] = { ...dry, status: 'failed', ops: [], model }
            continue
          }
        }
        const step = planMealChange(model, change, { ...ctx, newId, start })
        if (step.status !== 'applied') {
          if (created) await dropQuickMeal(created.id).catch(() => {})
          results[item.id] = step
          continue
        }
        try {
          await run(step.ops)
          model = step.model
          results[item.id] = created ? { ...step, createdRecipeId: created.id } : step
        } catch (err) {
          console.error('[meal changes] saving a change failed:', err?.message ?? err)
          if (created) await dropQuickMeal(created.id).catch(() => {})
          results[item.id] = { ...step, status: 'failed', ops: [], model }
        }
      }
    } catch (err) {
      console.error('[meal changes] reading the week failed:', err?.message ?? err)
      for (const item of items) if (!results[item.id]) results[item.id] = { status: 'failed', ops: [], highlight: [], cardLines: {} }
    } finally {
      await refresh()
      if (items.some((i) => i.oneOff)) await queryClient.invalidateQueries({ queryKey: ['recipes'] })
    }
    return { results, model }
  }, [user?.id, readModel, refresh, queryClient])

  const undo = useCallback(async (changes) => {
    const out = { undone: [], skipped: [], failed: [], quickMeals: { removed: [], kept: [] } }
    const list = (changes ?? []).filter((c) => c?.ops?.length)
    if (!list.length) return out
    try {
      // Every row of the weeks they touched, once; then newest first.
      const planIds = [...new Set(list.flatMap(touchedPlans))]
      const { data, error } = await supabase.from('meal_plan_entries').select('*').in('meal_plan_id', planIds)
      if (error) throw error
      let rows = data ?? []
      for (const change of [...list].reverse()) {
        const plan = planMealUndo(change, rows, { plans: change.plans ?? [] })
        if (!plan.ok) {
          out.skipped.push({ id: change.id, date: plan.date })
          continue
        }
        try {
          await run(plan.ops)
          rows = applyOps(rows, plan.ops)
          out.undone.push(change.id)
        } catch (err) {
          console.error('[meal changes] undo failed:', err?.message ?? err)
          out.failed.push(change.id)
          continue
        }
        // A one-off meal's quick meal goes too, unless something else uses it now.
        if (change.createdRecipeId) {
          try {
            const { data: using, error: readError } = await supabase.from('meal_plan_entries').select('id, recipe_id').eq('recipe_id', change.createdRecipeId).limit(1)
            if (readError) throw readError
            if (quickMealUndo(change, using ?? []) === 'remove') {
              await dropQuickMeal(change.createdRecipeId)
              out.quickMeals.removed.push(change.id)
            } else {
              out.quickMeals.kept.push(change.id)
            }
          } catch (err) {
            console.error('[meal changes] removing a quick meal failed:', err?.message ?? err)
            out.quickMeals.kept.push(change.id)
          }
        }
      }
    } catch (err) {
      console.error('[meal changes] undo failed:', err?.message ?? err)
      const settled = new Set([...out.undone, ...out.skipped.map((s) => s.id), ...out.failed])
      out.failed.push(...list.map((c) => c.id).filter((id) => !settled.has(id)))
    } finally {
      await refresh()
      if (list.some((c) => c.createdRecipeId)) await queryClient.invalidateQueries({ queryKey: ['recipes'] })
    }
    return out
  }, [refresh, queryClient])

  return { apply, undo, readModel }
}
