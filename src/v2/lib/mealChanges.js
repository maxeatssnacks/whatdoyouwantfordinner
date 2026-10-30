// Meal changes as row operations (v2 build step 7b): eating out and
// skipping, moving, swapping and adding a meal, worked out on an in-memory
// copy of the weeks' meal_plan_entries rows. Plain functions, so Node checks
// run them on in-memory tables; src/hooks/useMealChanges.js reads the weeks
// fresh, writes each change's rows and undoes them. Voice uses every type;
// the Week page's add sheet and picker use eating out.
//
// A change is a list of row operations, in the order they're written:
//   { op: 'insert', row }                 a new row (its id made here)
//   { op: 'update', id, before, after }   the whole row before and after
//   { op: 'delete', row }                 the row as it was
// A cook's leftovers are deleted before the cook, and a cook goes in before
// its leftovers. Undo is the same list backwards with each operation
// reversed, so deleted rows go back with their ids, cooks before leftovers,
// across weeks; it runs only when every row the change left is still as it
// left it and nothing else has taken a slot a row goes back to.
//
// Eating out and skipped (migration 020) are rows with a `kind` and no
// recipe. Putting one on a cooked meal moves that meal to the next free day
// in the same slot within 4 days (its leftovers placed again from there), or
// takes it off when none is free; on a leftover, the leftover moves to the
// next free day it can go to, or is taken off with LO-6's servings drop.
import { LEFTOVER_DAYS_AHEAD, mealTypesMatch, normalizeMealType, parseRecipeIngredientsJsonb } from '../../lib/utils.js'
import { addDays, prepareOnHand } from './onHand.js'
import { findLineEntry } from './packages.js'
import { placeMeal } from './slotFill.js'
import { rankPickerRecipes } from './swap.js'
import { DAY_NAMES, dayNameOf, shortDayOf, weekStartOf } from './voice/dates.js'
import { capitalize, dayLabel, slotLabel } from './voice/words.js'

export const KINDS = ['eating_out', 'skipped']
export const KIND_LABELS = { eating_out: 'Eating out', skipped: 'Skipped' }
export const MEAL_CHANGE_TYPES = ['eating_out', 'skip', 'move', 'swap', 'add']

const EPSILON = 1e-6
const longDay = (date) => capitalize(dayNameOf(date))

/** An entry's kind ('eating_out' | 'skipped'), or null for a meal. */
export const kindOf = (row) => (KINDS.includes(row?.kind) ? row.kind : null)

/** What a row is called: its recipe's title, "Eating out", "Skipped". */
export const rowTitle = (row) => (kindOf(row) ? KIND_LABELS[row.kind] : row?.recipe?.title ?? 'Recipe unavailable')

/**
 * A meal's name in a sentence, up to " with ": "Firecracker Meatballs with
 * Roasted Green Beans & Sesame Rice" → "Firecracker Meatballs".
 */
export function shortTitle(title) {
  const t = String(title ?? '').trim()
  return t.split(/\s+with\s+/i)[0].trim() || t
}

// ── The model: the weeks' rows, as read

/**
 * plans: meal_plans rows as useMealPlan reads them ({ id, week_start_date,
 * entries } with each entry's recipe embedded). `recipes` (optional) are
 * looked up for rows a change adds. → { plans: [{ id, weekStart }], rows, recipeOf }
 */
export function mealModel(plans = [], recipes = []) {
  const list = plans.filter((p) => p?.id && (p.week_start_date ?? p.weekStart))
  const byId = new Map()
  for (const r of recipes ?? []) if (r?.id) byId.set(r.id, r)
  for (const p of list) for (const e of p.entries ?? []) if (e?.recipe?.id && !byId.has(e.recipe.id)) byId.set(e.recipe.id, e.recipe)
  return {
    plans: list.map((p) => ({ id: p.id, weekStart: p.week_start_date ?? p.weekStart })).sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    rows: list.flatMap((p) => (p.entries ?? []).map((e) => ({ ...e, meal_plan_id: e.meal_plan_id ?? p.id }))),
    recipeOf: (id) => byId.get(id) ?? null,
  }
}

/** The model's weeks as plans again ({ id, week_start_date, entries }), e.g. for prepareOnHand. */
export function modelPlans(model) {
  return model.plans.map((p) => ({ id: p.id, week_start_date: p.weekStart, entries: model.rows.filter((r) => r.meal_plan_id === p.id) }))
}

/** A row's columns, without the embedded recipe: what's written and put back. */
export const plainRow = (row) => Object.fromEntries(Object.entries(row ?? {}).filter(([k, v]) => k !== 'recipe' && (v === null || typeof v !== 'object')))

const planOf = (model, id) => model.plans.find((p) => p.id === id) ?? null
const planFor = (model, date) => model.plans.find((p) => p.weekStart === weekStartOf(date)) ?? null

/** The calendar date of a row in the model's weeks, or null. */
export function rowDate(model, row) {
  const weekStart = planOf(model, row?.meal_plan_id)?.weekStart
  const i = DAY_NAMES.indexOf(String(row?.day_of_week ?? '').toLowerCase())
  return weekStart && i >= 0 ? addDays(weekStart, i) : null
}

const rowsAt = (model, date, slot) => model.rows.filter((r) => rowDate(model, r) === date && mealTypesMatch(r.meal_type, slot))
const leftoversOf = (model, id) => model.rows
  .filter((r) => r.is_leftover && r.original_entry_id === id)
  .sort((a, b) => String(rowDate(model, a)).localeCompare(String(rowDate(model, b))))

// ── Row operations

const FINGERPRINT = ['meal_plan_id', 'recipe_id', 'day_of_week', 'meal_type', 'is_leftover', 'original_entry_id', 'servings', 'kind']

/** A row's content, for "is it still what the change left?" (missing and null are the same). */
export function entryFingerprint(row) {
  if (!row) return 'none'
  return FINGERPRINT.map((f) => {
    const v = row[f]
    if (f === 'is_leftover') return String(!!v)
    if (f === 'servings') return v == null || v === '' ? '' : String(Number(v))
    if (f === 'day_of_week' || f === 'meal_type') return String(v ?? '').toLowerCase()
    return String(v ?? '')
  }).join('|')
}

function withRecipe(row, recipeOf, was = null) {
  if (!recipeOf) return row
  if (was && was.recipe_id === row.recipe_id && 'recipe' in was) return { ...row, recipe: was.recipe }
  return { ...row, recipe: row.recipe_id ? recipeOf(row.recipe_id) : null }
}

/** The operations on an in-memory table (rows by id). `recipeOf` embeds recipes. → a new array */
export function applyOps(rows = [], ops = [], recipeOf = null) {
  let out = rows.map((r) => ({ ...r }))
  for (const op of ops) {
    if (op.op === 'insert') out.push(withRecipe({ ...op.row }, recipeOf))
    else if (op.op === 'delete') out = out.filter((r) => r.id !== op.row.id)
    else if (op.op === 'update') out = out.map((r) => (r.id === op.id ? withRecipe({ ...r, ...op.after }, recipeOf, r) : r))
  }
  return out
}

/** Undo's operations for a change: backwards, each reversed. */
export function reverseOps(ops = []) {
  return [...ops].reverse().map((op) => {
    if (op.op === 'insert') return { op: 'delete', row: op.row }
    if (op.op === 'delete') return { op: 'insert', row: op.row }
    return { op: 'update', id: op.id, before: op.after, after: op.before }
  })
}

/** The columns an update changes, for the write. */
export function changedColumns(before = {}, after = {}) {
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => k !== 'id' && (before[k] ?? null) !== (v ?? null)))
}

const update = (row, patch) => {
  const before = plainRow(row)
  const after = { ...before, ...patch }
  return { op: 'update', id: row.id, before, after }
}
const remove = (row) => ({ op: 'delete', row: plainRow(row) })
function insert(id, { planId, day, mealType, recipeId = null, isLeftover = false, originalId = null, servings = null, kind = null }) {
  return {
    op: 'insert',
    row: {
      id,
      meal_plan_id: planId,
      recipe_id: recipeId,
      day_of_week: day,
      meal_type: normalizeMealType(mealType),
      is_leftover: isLeftover,
      original_entry_id: originalId,
      servings,
      // Only on rows that have one, so meals still save before migration 020.
      ...(kind ? { kind } : {}),
    },
  }
}

// ── Placing a cook

/**
 * Where a cook's leftovers go from `date` (placeMeal: the cap, free days in
 * the 4 after it, today or later, possibly next week), with `ignore` rows
 * not counting as taken (its old leftovers).
 */
function placeCook(model, ctx, { recipe, servings = null, date, slot, ignore = [] }) {
  const weekStart = weekStartOf(date)
  const plan = planFor(model, date)
  const next = planFor(model, addDays(weekStart, 7))
  const skip = new Set(ignore)
  const inWeek = (p) => (p ? model.rows.filter((r) => r.meal_plan_id === p.id && !skip.has(r.id)) : [])
  return placeMeal({
    recipe,
    servings,
    people: ctx.people,
    dayOfWeek: dayNameOf(date),
    mealType: slot,
    weekStart,
    today: ctx.today,
    currentEntries: inWeek(plan),
    nextEntries: inWeek(next),
    replaceEntryId: null,
    currentPlanId: plan?.id ?? null,
    nextPlanId: next?.id ?? null,
  })
}

/**
 * A cook moved to `date` / `slot`: its old leftovers go and new ones are
 * placed from there. Servings stay as they were unless fewer leftovers fit
 * than before; then they drop by the people eating per leftover lost (LO-6),
 * never below one round. → { ops, leftoverIds, servings }
 */
function moveCook(model, ctx, cook, { date, slot }) {
  const old = leftoversOf(model, cook.id)
  const people = Math.max(Number(ctx.people) || 1, 1)
  const base = cook.servings ?? cook.recipe?.servings ?? null
  // Its old day is free once it moves, and its old leftovers go.
  const placement = placeCook(model, ctx, { recipe: cook.recipe, servings: base, date, slot, ignore: [cook.id, ...old.map((l) => l.id)] })
  let servings = cook.servings ?? null
  if (base != null && placement.leftovers.length < old.length) {
    servings = Math.max(people, Number(base) - people * (old.length - placement.leftovers.length))
  }
  const plan = planFor(model, date)
  const ops = [
    ...old.map(remove),
    update(cook, { meal_plan_id: plan.id, day_of_week: dayNameOf(date), meal_type: normalizeMealType(slot), servings }),
  ]
  const leftoverIds = []
  for (const l of placement.leftovers) {
    const id = ctx.newId()
    leftoverIds.push(id)
    ops.push(insert(id, { planId: l.mealPlanId, day: l.dayOfWeek, mealType: slot, recipeId: cook.recipe_id, isLeftover: true, originalId: cook.id, servings }))
  }
  return { ops, leftoverIds, servings }
}

// ── Words

/** "Saturday’s dinner is Cheddar broccoli frittata" / "Wednesday has the chicken orzo leftovers" / "Friday’s dinner is eating out". */
function takenBy(model, row) {
  const date = rowDate(model, row)
  const slot = String(normalizeMealType(row.meal_type)).toLowerCase()
  if (kindOf(row)) return `${longDay(date)}’s ${slot} is ${KIND_LABELS[row.kind].toLowerCase()}`
  if (row.is_leftover) return `${longDay(date)} has the ${rowTitle(row).toLowerCase()} leftovers`
  return `${longDay(date)}’s ${slot} is ${rowTitle(row)}`
}

const slotName = (mealType) => normalizeMealType(mealType)

// ── What a recipe has, for "something with chicken" and "use up the kale"

const plainish = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const singular = (w) => w.replace(/(?<=[^s])s$/, '')

function recipeHas(recipe, word) {
  const w = plainish(word)
  if (!w) return true
  const lines = parseRecipeIngredientsJsonb(recipe)
  const key = findLineEntry(w)?.entry?.id ?? null
  if (key && lines.some((l) => findLineEntry(l.name, l.unit, { notes: l.notes })?.entry?.id === key)) return true
  const names = [...lines.map((l) => plainish(l.name)), plainish(recipe.title)]
  return names.some((n) => ` ${n} `.includes(` ${singular(w)}`))
}

function recipeUses(recipe, key) {
  const lines = parseRecipeIngredientsJsonb(recipe)
  return lines.some((l) => findLineEntry(l.name, l.unit, { notes: l.notes })?.entry?.id === key)
}

/**
 * The swap's recipe: the named one, or the meal picker's order for that
 * slot (rankPickerRecipes, as the picker would show it now) filtered by the
 * wish ("with" words in its ingredients or title, "use up" keys in its
 * ingredients), the first that's left. Deterministic.
 * → { recipe, reason } | { reason: why not }
 */
export function pickSwapRecipe(model, ctx, row, { recipeId = null, withWords = [], useUp = [] } = {}) {
  if (recipeId) {
    const recipe = ctx.recipes?.find((r) => r.id === recipeId) ?? model.recipeOf?.(recipeId) ?? null
    return recipe ? { recipe, reason: null } : { problem: 'No recipe called that' }
  }
  const date = rowDate(model, row)
  const weekStart = weekStartOf(date)
  const plan = planOf(model, row.meal_plan_id)
  const next = planFor(model, addDays(weekStart, 7))
  const weekRows = model.rows.filter((r) => r.meal_plan_id === plan?.id)
  const nextRows = next ? model.rows.filter((r) => r.meal_plan_id === next.id) : []
  const ranking = rankPickerRecipes({
    recipes: ctx.recipes ?? [],
    slot: slotName(row.meal_type),
    activeMembers: ctx.activeMembers ?? [],
    recent: ctx.recent ?? null,
    lastCooked: ctx.lastCooked ?? null,
    excludeIds: weekRows.map((r) => r.recipe_id),
    day: { name: String(row.day_of_week).toLowerCase(), date },
    weekStart,
    today: ctx.today,
    people: ctx.people,
    currentEntries: weekRows,
    nextEntries: nextRows,
    replaceEntryId: row.id,
    onHand: ctx.onHandFor ? ctx.onHandFor(weekStart, model, date) : null,
  })
  const fits = ranking.recipes.filter((r) => withWords.every((w) => recipeHas(r, w)) && useUp.every((k) => recipeUses(r, k)))
  const recipe = fits[0] ?? null
  if (!recipe) {
    const day = longDay(date)
    if (useUp.length) return { problem: `No recipe for ${day} uses the ${useUp.map((k) => k.replace(/-/g, ' ')).join(' and ')}` }
    if (withWords.length) return { problem: `No recipe with ${withWords.join(' and ')} fits ${day}` }
    return { problem: `No other recipe fits ${day}` }
  }
  return { recipe, reason: ranking.items?.get(recipe.id)?.reason ?? null }
}

/** Prepared on-hand rows for the ranking, from a raw on-hand read and the model's weeks. */
export function onHandRowsFor(raw, model, weekStart) {
  return raw ? prepareOnHand(raw, modelPlans(model), { weekStart }) : null
}

// ── One change

/**
 * Works out one resolved change (resolveChanges' item: type, entryId or
 * date and slot, and what it needs) on the model.
 * ctx: { today, people, newId(), recipes, activeMembers, recent, lastCooked,
 *   onHandFor(weekStart, model, date) → prepared on-hand rows or null,
 *   start: the model as read before the batch (for "changed while you were
 *   talking") }
 * → { status: 'applied' | 'not_changed', reason?, ops, model (after),
 *     words: { eyebrow, was, title, line, bar }, highlight: [entry ids],
 *     cardLines: { [entry id]: text }, date, slot }
 */
export function planMealChange(model, item, ctx) {
  const notChanged = (reason) => ({ status: 'not_changed', reason, ops: [], model, words: null, highlight: [], cardLines: {} })
  const done = (ops, words, { highlight = [], cardLines = {}, date = item.date, slot = item.slot } = {}) => ({
    status: 'applied',
    ops,
    model: { ...model, rows: applyOps(model.rows, ops, model.recipeOf) },
    words,
    highlight,
    cardLines,
    date,
    slot,
  })
  const type = item.type

  // The meal it's about, as it is now; "changed while you were talking" when
  // the week as read before the batch no longer has it as the words found it.
  let row = null
  if (item.entryId) {
    const start = ctx.start ?? model
    const was = start.rows.find((r) => r.id === item.entryId)
    const expect = item.expect ?? null
    if (!was || (expect && (rowDate(start, was) !== expect.date || (was.recipe_id ?? null) !== (expect.recipeId ?? null) || kindOf(was) !== (expect.kind ?? null)))) {
      return notChanged(`${longDay(expect?.date ?? item.date)} changed while you were talking`)
    }
    row = model.rows.find((r) => r.id === item.entryId) ?? null
    if (!row) return notChanged(`${rowTitle(was)} isn’t on your plan now`)
  }

  if (type === 'eating_out' || type === 'skip') {
    const kind = type === 'eating_out' ? 'eating_out' : 'skipped'
    const label = KIND_LABELS[kind]
    let date = row ? rowDate(model, row) : item.date
    let slot = row ? slotName(row.meal_type) : slotName(item.slot)
    if (!row) {
      const there = rowsAt(model, date, slot)
      if (there.length > 1) return notChanged(`Two meals on ${longDay(date)}; say which`)
      row = there[0] ?? null
    }
    const eyebrow = slotLabel(date, slot)
    const plan = planFor(model, date)
    if (!plan) return notChanged('That week isn’t open yet')
    if (date < ctx.today) return notChanged(`${longDay(date)} has passed`)
    const kindId = ctx.newId()
    const kindRow = insert(kindId, { planId: plan.id, day: dayNameOf(date), mealType: slot, kind })
    const bar = type === 'eating_out' ? `Eating out ${eyebrow}.` : `${capitalize(eyebrow)} skipped.`

    if (!row) {
      if (kind === 'skipped') return notChanged(`Nothing planned for ${eyebrow}`)
      return done([kindRow], { eyebrow, was: null, title: label, line: null, bar }, { highlight: [kindId], date, slot })
    }
    if (kindOf(row) === kind) return notChanged(`${capitalize(eyebrow)} is already ${label.toLowerCase()}`)
    if (kindOf(row)) {
      return done([update(row, { kind })], { eyebrow, was: KIND_LABELS[row.kind], title: label, line: null, bar }, { highlight: [row.id], date, slot })
    }

    const short = shortTitle(rowTitle(row))
    if (row.is_leftover) {
      // To the next free day it can go to (after its cook, within 4 days of
      // it, today on), or off, with the cook's servings down by a round.
      const cook = model.rows.find((r) => r.id === row.original_entry_id) ?? null
      const cookDate = cook ? rowDate(model, cook) : null
      const from = cookDate ?? date
      let target = null
      for (let d = addDays(date, 1); d <= addDays(from, LEFTOVER_DAYS_AHEAD); d = addDays(d, 1)) {
        if (d < ctx.today || !planFor(model, d)) continue
        if (rowsAt(model, d, slot).some((r) => r.id !== row.id)) continue
        target = d
        break
      }
      if (target) {
        const line = `Leftover ${short} moved to ${dayLabel(target)}`
        return done(
          [update(row, { meal_plan_id: planFor(model, target).id, day_of_week: dayNameOf(target) }), kindRow],
          { eyebrow, was: `Leftover ${rowTitle(row)}`, title: label, line, bar },
          { highlight: [kindId], cardLines: { [kindId]: line }, date, slot },
        )
      }
      const ops = [remove(row)]
      if (cook && cookDate && cookDate >= ctx.today) {
        const people = Math.max(Number(ctx.people) || 1, 1)
        const current = cook.servings ?? cook.recipe?.servings ?? people
        const servings = Math.max(people, Number(current) - people)
        if (servings !== cook.servings) ops.push(update(cook, { servings }))
      }
      ops.push(kindRow)
      const line = `Leftover ${short} taken off`
      return done(ops, { eyebrow, was: `Leftover ${rowTitle(row)}`, title: label, line, bar }, { highlight: [kindId], cardLines: { [kindId]: line }, date, slot })
    }

    // A cooked meal: to the next free day in the same slot within 4 days
    // (its own leftovers' days count as free: they're placed again), or off.
    const own = new Set(leftoversOf(model, row.id).map((l) => l.id))
    let target = null
    if (row.recipe) {
      for (let i = 1; i <= LEFTOVER_DAYS_AHEAD; i++) {
        const d = addDays(date, i)
        if (d <= ctx.today || !planFor(model, d)) continue
        if (rowsAt(model, d, slot).some((r) => r.id !== row.id && !own.has(r.id))) continue
        target = d
        break
      }
    }
    if (target) {
      const moved = moveCook(model, ctx, row, { date: target, slot })
      const line = `${short} moved to ${dayLabel(target)}`
      return done([...moved.ops, kindRow], { eyebrow, was: rowTitle(row), title: label, line, bar }, {
        highlight: [kindId, row.id],
        cardLines: { [kindId]: line },
        date,
        slot,
      })
    }
    const line = `${short} taken off`
    return done(
      [...leftoversOf(model, row.id).map(remove), remove(row), kindRow],
      { eyebrow, was: rowTitle(row), title: label, line, bar },
      { highlight: [kindId], cardLines: { [kindId]: line }, date, slot },
    )
  }

  if (type === 'move') {
    if (!row) return notChanged('Didn’t catch which meal')
    const date = rowDate(model, row)
    const slot = slotName(row.meal_type)
    const toDate = item.toDate
    const toSlot = slotName(item.toSlot ?? slot)
    const eyebrow = slotLabel(date, slot)
    if (!toDate || toDate < ctx.today) return notChanged(toDate ? `${longDay(toDate)} has passed` : 'Didn’t catch which day')
    const plan = planFor(model, toDate)
    if (!plan) return notChanged('That week isn’t open yet')
    if (toDate === date && mealTypesMatch(toSlot, slot)) return notChanged(`${rowTitle(row)} is already on ${longDay(toDate)}`)
    const own = new Set(row.is_leftover || kindOf(row) ? [] : leftoversOf(model, row.id).map((l) => l.id))
    const blocking = rowsAt(model, toDate, toSlot).filter((r) => r.id !== row.id && !own.has(r.id))
    if (blocking.length) return notChanged(takenBy(model, blocking[0]))
    const where = mealTypesMatch(toSlot, slot) ? dayLabel(toDate) : `${dayLabel(toDate)} ${toSlot.toLowerCase()}`
    const title = rowTitle(row)
    const words = { eyebrow, was: null, title, line: `Moved to ${where}`, bar: `${shortTitle(title)} moved to ${where}.` }
    const plain = { meal_plan_id: plan.id, day_of_week: dayNameOf(toDate), meal_type: normalizeMealType(toSlot) }
    if (kindOf(row)) return done([update(row, plain)], words, { highlight: [row.id], date, slot })
    if (row.is_leftover) {
      const cook = model.rows.find((r) => r.id === row.original_entry_id) ?? null
      const cookDate = cook ? rowDate(model, cook) : null
      if (cookDate && (toDate <= cookDate || toDate > addDays(cookDate, LEFTOVER_DAYS_AHEAD))) {
        return notChanged(`Leftovers can only go in the ${LEFTOVER_DAYS_AHEAD} days after ${longDay(cookDate)}`)
      }
      return done([update(row, plain)], words, { highlight: [row.id], date, slot })
    }
    if (!row.recipe) return done([update(row, plain)], words, { highlight: [row.id], date, slot })
    const moved = moveCook(model, ctx, row, { date: toDate, slot: toSlot })
    return done(moved.ops, words, { highlight: [row.id], date, slot })
  }

  if (type === 'swap') {
    if (!row) return notChanged('Didn’t catch which meal')
    const date = rowDate(model, row)
    const slot = slotName(row.meal_type)
    const eyebrow = slotLabel(date, slot)
    if (row.is_leftover) return notChanged(`${capitalize(eyebrow)} is leftovers; swap the meal they come from`)
    if (date < ctx.today) return notChanged(`${longDay(date)} has passed`)
    const picked = pickSwapRecipe(model, ctx, row, { recipeId: item.recipeId ?? null, withWords: item.with ?? [], useUp: item.useUp ?? [] })
    if (!picked.recipe) return notChanged(picked.problem)
    const recipe = picked.recipe
    if (recipe.id === row.recipe_id) return notChanged(`${longDay(date)} is already ${recipe.title}`)
    const weekStart = weekStartOf(date)
    const next = planFor(model, addDays(weekStart, 7))
    const old = leftoversOf(model, row.id)
    const placement = placeMeal({
      recipe,
      people: ctx.people,
      dayOfWeek: dayNameOf(date),
      mealType: slot,
      weekStart,
      today: ctx.today,
      currentEntries: model.rows.filter((r) => r.meal_plan_id === row.meal_plan_id),
      nextEntries: next ? model.rows.filter((r) => r.meal_plan_id === next.id) : [],
      replaceEntryId: row.id,
      currentPlanId: row.meal_plan_id,
      nextPlanId: next?.id ?? null,
    })
    // As the picker swaps (useFillMealSlot): the entry keeps its id, its old
    // leftovers go, new ones follow.
    const ops = [
      update(row, { recipe_id: recipe.id, servings: placement.servings, ...(kindOf(row) ? { kind: null } : {}) }),
      ...old.map(remove),
    ]
    for (const l of placement.leftovers) {
      ops.push(insert(ctx.newId(), { planId: l.mealPlanId, day: l.dayOfWeek, mealType: slot, recipeId: recipe.id, isLeftover: true, originalId: row.id, servings: placement.servings }))
    }
    const wish = item.useUp?.length ? `Uses the ${item.useUp.map((k) => item.useUpNames?.[k] ?? k.replace(/-/g, ' ')).join(' and ')}`
      : item.with?.length ? `Has ${item.with.join(' and ')}` : null
    return done(ops, { eyebrow, was: rowTitle(row), title: recipe.title, line: picked.reason ?? wish, bar: `Swapped in ${shortTitle(recipe.title)}.` }, { highlight: [row.id], date, slot })
  }

  if (type === 'add') {
    const date = item.date
    const slot = slotName(item.slot)
    const eyebrow = slotLabel(date, slot)
    if (!date || date < ctx.today) return notChanged(date ? `${longDay(date)} has passed` : 'Didn’t catch which day')
    const plan = planFor(model, date)
    if (!plan) return notChanged('That week isn’t open yet')
    const there = rowsAt(model, date, slot)
    if (there.length) return notChanged(takenBy(model, there[0]))
    const recipe = ctx.recipes?.find((r) => r.id === item.recipeId) ?? model.recipeOf?.(item.recipeId) ?? null
    if (!recipe) return notChanged('Didn’t catch what to add')
    const placement = placeCook(model, ctx, { recipe, date, slot })
    const id = ctx.newId()
    const ops = [insert(id, { planId: plan.id, day: dayNameOf(date), mealType: slot, recipeId: recipe.id, servings: placement.servings })]
    for (const l of placement.leftovers) {
      ops.push(insert(ctx.newId(), { planId: l.mealPlanId, day: l.dayOfWeek, mealType: slot, recipeId: recipe.id, isLeftover: true, originalId: id, servings: placement.servings }))
    }
    const lefts = placement.leftovers.length
    return done(ops, {
      eyebrow,
      was: null,
      title: recipe.title,
      line: lefts ? `With ${lefts === 1 ? 'a leftover' : `${lefts} leftovers`} after` : null,
      bar: `${shortTitle(recipe.title)} added to ${eyebrow}.`,
    }, { highlight: [id], date, slot })
  }

  return notChanged('Didn’t catch that')
}

// ── Undo

/**
 * How to undo a change, given the rows there now (every row of the weeks it
 * touched). → { ok: true, ops } or { ok: false, date } (the day that changed
 * since: a row it left isn't as it left it, or a slot a row goes back to has
 * something else in it now).
 */
export function planMealUndo(change, currentRows = [], model) {
  const left = new Map()
  for (const op of change.ops ?? []) {
    if (op.op === 'insert') left.set(op.row.id, op.row)
    else if (op.op === 'update') left.set(op.id, op.after)
    else left.set(op.row.id, null)
  }
  const byId = new Map(currentRows.map((r) => [r.id, r]))
  for (const [id, row] of left) {
    const now = byId.get(id) ?? null
    const same = row === null ? !now : !!now && entryFingerprint(now) === entryFingerprint(row)
    if (!same) return { ok: false, date: rowDate(model, now ?? row) ?? change.date ?? null }
  }
  const ops = reverseOps(change.ops)
  const after = applyOps(currentRows, ops)
  const placed = new Set(ops.filter((o) => o.op !== 'delete').map((o) => (o.op === 'insert' ? o.row.id : o.id)))
  for (const id of placed) {
    const r = after.find((x) => x.id === id)
    if (!r) continue
    const clash = after.find((x) => !placed.has(x.id) && x.meal_plan_id === r.meal_plan_id
      && String(x.day_of_week).toLowerCase() === String(r.day_of_week).toLowerCase() && mealTypesMatch(x.meal_type, r.meal_type))
    if (clash) return { ok: false, date: rowDate(model, r) ?? change.date ?? null }
  }
  return { ok: true, ops }
}

/** The meal plans a change's rows are in (before and after), for the read before an undo. */
export function touchedPlans(change) {
  const ids = new Set()
  for (const op of change.ops ?? []) {
    for (const r of [op.row, op.before, op.after]) if (r?.meal_plan_id) ids.add(r.meal_plan_id)
  }
  return [...ids]
}

// ── The follow-on offer

/**
 * On-hand changes that leave a cooked meal from today on without something
 * it uses ("the cheddar's gone" and Saturday's frittata needs cheddar): one
 * offer per change, the soonest such meal, never the same meal twice. Never
 * applied on its own: Review shows "Sat's frittata used the cheddar · Swap".
 * before / after: inferOnHand results (byEntry with supply) without and with
 * the batch's corrections, on the same weeks. → [{ id, key, name, entryId,
 * date, slot, title }]
 */
export function followOnOffers({ before, after, items = [], model, today }) {
  const offers = []
  const taken = new Set()
  for (const item of items) {
    if (item.type !== 'on_hand' || item.status !== 'applied') continue
    const hits = Object.entries(after?.byEntry ?? {})
      .filter(([id, meal]) => meal.date >= today && !taken.has(id))
      .filter(([id, meal]) => {
        const now = meal.supply?.find((s) => s.key === item.key)
        const was = before?.byEntry?.[id]?.supply?.find((s) => s.key === item.key)
        return now && was && was.got - now.got > EPSILON
      })
      .map(([id, meal]) => ({ id, date: meal.date, row: model.rows.find((r) => r.id === id) }))
      .filter((h) => h.row && !h.row.is_leftover && h.row.recipe && !kindOf(h.row))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
    const hit = hits[0]
    if (!hit) continue
    taken.add(hit.id)
    const slot = slotName(hit.row.meal_type)
    offers.push({
      id: `${item.id}-offer`,
      key: item.key,
      name: item.name,
      entryId: hit.id,
      recipeId: hit.row.recipe_id,
      date: hit.date,
      slot,
      title: `${shortDayOf(hit.date)}’s ${shortTitle(rowTitle(hit.row))} used the ${item.name}`,
    })
  }
  return offers
}
