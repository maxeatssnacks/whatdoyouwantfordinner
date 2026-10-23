// Ranking meals for Plan my week and the meal picker (v2 build step 6). Plain
// JS with no React or Vite imports, so Node imports it too
// (scripts/check-plan.mjs).
//
// - The repeat rule (6a, used by useMealPlanSuggest now): a recipe only goes
//   in a slot with at least one free day between that meal (its cook day and
//   the leftovers it would get) and any other meal of the same recipe, last
//   week's and next week's included. Recipes not on the week yet come first;
//   then repeats, the biggest gap first; if nothing qualifies, the day stays
//   open (slotChoices).
// - A meal type plans from the recipes tagged for it. Only when nothing at
//   all is tagged for it does it take every recipe (mealTypePool). Recent
//   recipes are in the pool and only fill gaps (6b2); since 6c nothing stops
//   to ask when every tagged recipe is recent.
// - slotRanking (6b2: by what's at stake): among recipes within
//   MACRO_WINDOW points of the best per-serving macro fit for the slot, the
//   value a recipe rescues decides: what's on hand from earlier weeks it uses
//   (inferred or confirmed: the shopping list only trusts confirmed, the
//   ranking counts both) and the part of the week's packages it shares
//   instead of buying its own, less the fresh waste it adds, each at price ×
//   share of the package × a shelf-life factor (packageSizes.js prices,
//   STAKE_FACTORS). Differences under VALUE_STEP ($2) don't reorder recipes:
//   within that, the one cooked longest ago (or never) first, then macro
//   score, title and id. The older share-of-packages scoring stays behind
//   rankBy 'share' for comparison. Package math is the shopping list's:
//   mealNeeds' raw amounts added up per key, then choosePackage; a meal only
//   shares a package with cooks within the ingredient's keeps days.
// - planWeek (Plan my week since 6b): the week built best-first from each of
//   the top PLAN_STARTS first meals. Recent recipes only fill gaps (6b2).
//   Planning the same days again gives a week as complete as the best that
//   uses a recipe the replaced week didn't, when there is one. Nothing is
//   random, and nothing is stored.
import {
  DAY_ORDER,
  computeLeftoverSlots,
  mealTypesMatch,
  recipeMatchesMealSlot,
  scoreRecipeForHousehold,
} from '../../lib/utils.js'
import { choosePackage, entryById, roundAmount } from './packages.js'
import { FRESH_DAYS, STAKE_FACTORS, addDays, applyMeal, inferOnHand, mealNeeds, mealUses, reasonText, stake, stakeFactor, unitPrice } from './onHand.js'

/** Cost decides among recipes within this many points of the best macro score for the slot. */
export const MACRO_WINDOW = 10
/** Plan my week builds a week from each of this many first meals and keeps the best. */
export const PLAN_STARTS = 5
/** Days between two meals of the same recipe: 2 leaves at least one free day between them. */
export const MIN_REPEAT_GAP = 2

const EPSILON = 1e-6
const FINISHED_SHARE = 0.1 // under 10% of a package left counts as finished (onHand.js)
const MEAL_TYPE_PRIORITY = ['dinner', 'lunch', 'breakfast', 'snack']
const SAME_DAY_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const round4 = (n) => Math.round(n * 1e4) / 1e4
const byTitle = (a, b) =>
  String(a?.title ?? '').localeCompare(String(b?.title ?? '')) || String(a?.id).localeCompare(String(b?.id))
const typeRank = (list, t) => {
  const i = list.indexOf(String(t ?? '').toLowerCase())
  return i === -1 ? list.length : i
}

/** Meal types in the order Plan my week fills them: dinner, lunch, breakfast, snack, then the rest. */
export function mealTypeOrder(types = []) {
  return [...types].sort((a, b) => typeRank(MEAL_TYPE_PRIORITY, a) - typeRank(MEAL_TYPE_PRIORITY, b))
}

// ── Days

function dateParts(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str ?? ''))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

// Days from one local date to another (positive when `b` is later).
function dayDiff(a, b) {
  const x = dateParts(a)
  const y = dateParts(b)
  return x && y ? Math.round((y - x) / 86_400_000) : Infinity
}

function weekStartOf(date) {
  const d = dateParts(date)
  return d ? addDays(date, -d.getDay()) : null
}

/** A day as a number: 0 is the planned week's Sunday, −7…−1 last week, 7…13 next week. */
export function dayNumber(dayOfWeek, weekOffset = 0) {
  const i = DAY_ORDER.indexOf(String(dayOfWeek ?? '').toLowerCase())
  return i === -1 ? null : weekOffset * 7 + i
}

/** Adds one day to a recipe's days (recipeDays' map). */
export function addRecipeDay(days, recipeId, day) {
  if (!recipeId || day == null) return
  const list = days.get(recipeId) ?? []
  list.push(day)
  days.set(recipeId, list)
}

/**
 * Every day each recipe is on, cooks and leftovers, from the planned week's
 * entries and its neighbours': [{ weekOffset, entries }] with weekOffset −1
 * (last week), 0 or 1 (next week). → Map(recipeId → day numbers)
 */
export function recipeDays(weeks = []) {
  const days = new Map()
  for (const { weekOffset = 0, entries = [] } of weeks) {
    for (const e of entries) addRecipeDay(days, e?.recipe_id, dayNumber(e?.day_of_week, weekOffset))
  }
  return days
}

/**
 * Days between a meal (`block`: its cook day and leftover days) and the
 * nearest of `days`: 0 when they overlap, 1 for the next day, Infinity when
 * there are none.
 */
export function repeatGap(days = [], block = []) {
  if (!block.length) return Infinity
  const lo = Math.min(...block)
  const hi = Math.max(...block)
  let gap = Infinity
  for (const d of days) gap = Math.min(gap, d < lo ? lo - d : d > hi ? d - hi : 0)
  return gap
}

/**
 * The repeat rule for one slot. `candidates`: [{ recipe, block, ... }] where
 * block is the cook day and the leftover days it would get (day numbers);
 * `days`: recipeDays' map so far; `score(recipe)`: its macro score.
 * A candidate qualifies with at least one free day between its meal and any
 * other day its recipe is on (MIN_REPEAT_GAP).
 * → { fresh, repeats }, each candidate with its `gap`:
 *   fresh: recipes not on the planned week yet (the caller ranks them);
 *   repeats: recipes already on it, the biggest gap first, then the macro
 *   score, title and id.
 * Both empty: the slot stays open.
 */
export function slotChoices({ candidates = [], days = new Map(), score = () => 0 } = {}) {
  const fresh = []
  const repeats = []
  for (const c of candidates) {
    const on = days.get(c.recipe?.id) ?? []
    const gap = repeatGap(on, c.block)
    if (gap < MIN_REPEAT_GAP) continue
    if (on.some((d) => d >= 0 && d <= 6)) repeats.push({ ...c, gap })
    else fresh.push({ ...c, gap })
  }
  repeats.sort((a, b) => b.gap - a.gap || score(b.recipe) - score(a.recipe) || byTitle(a.recipe, b.recipe))
  return { fresh, repeats }
}

/**
 * The recipes a meal type plans from. `base`: recipes it could ever plan (no
 * quick meals, no avoided ingredients for the people eating); `eligible`:
 * those that also pass the Recipe Variety Filter. Recipes tagged for the
 * type, or every eligible recipe when nothing in `base` is tagged for it at
 * all (a library of dinners planning breakfast).
 * → { recipes, needsBypass }: needsBypass when tagged recipes exist but none is
 *   eligible (all used recently). Plan my week no longer asks (6c); it
 *   plans with base and eligible the same.
 */
export function mealTypePool({ base = [], eligible = [], mealType }) {
  const tagged = new Set(base.filter((r) => recipeMatchesMealSlot(r, mealType)).map((r) => r.id))
  if (!tagged.size) return { recipes: eligible, needsBypass: false }
  const recipes = eligible.filter((r) => tagged.has(r.id))
  return { recipes, needsBypass: recipes.length === 0 }
}

// ── Packages (the shopping list's math)

// mealNeeds is cached in onHand.js (step 6b).
const needsFor = (recipe, servings) => (recipe && typeof recipe === 'object' ? mealNeeds(recipe, servings).needs : new Map())

const isFresh = (entry) => (Number(entry?.keeps) || 7) <= FRESH_DAYS

// What the list buys for `need` (null: a line won't convert, so no package).
function buy(entry, need) {
  if (need == null) return null
  const n = roundAmount(need)
  const p = n > EPSILON ? choosePackage(entry, n) : null
  return { need: n, count: p?.count ?? 0, size: p?.size.size ?? null, over: p?.over ?? 0 }
}

// Fresh packages left over, in packages (half a bunch of cilantro is 0.5).
const wasteOf = (entry, b) => (b && b.count > 0 && b.size && isFresh(entry) ? b.over / b.size : 0)

// ── What's at stake (6b2)

// The shelf-life factors, unit prices and stake (price × share of the package
// × factor) live in onHand.js since 6c, so the Week cards' reasons can name
// the most valuable item first too; re-exported here.
export { STAKE_FACTORS, stakeFactor, unitPrice }

/** Differences in rescued value under this many dollars don't reorder recipes. */
export const VALUE_STEP = 2

const cents = (n) => Math.round(n * 100) / 100

/** What a week's purchases leave over, in dollars at stake (fresh waste valued the same way). */
export function wasteValue(purchases) {
  let total = 0
  for (const p of purchases.values ? purchases.values() : purchases) {
    if (p.count > 0 && p.size) total += stake(p.entry, p.over, p.count * p.size)
  }
  return cents(total)
}

/**
 * What one meal still has to buy per key: its need (mealNeeds' raw amount)
 * less what it takes from what's on hand (`uses` from mealUses).
 * → Map(key → { entry, name, raw, amount })
 */
export function mealToBuy(recipe, servings, uses = []) {
  const used = new Map((uses ?? []).map((u) => [u.key, u.used]))
  const out = new Map()
  for (const [key, n] of needsFor(recipe, servings)) {
    const amount = n.raw == null ? null : Math.max(0, n.raw - (used.get(key) ?? 0))
    out.set(key, { entry: n.entry, name: n.name, raw: n.raw, amount })
  }
  return out
}

/**
 * What a week's cook meals buy, per package entry key, the way the shopping
 * list works it out (their amounts added up, then choosePackage). Staples and
 * skipped entries aren't in it; a key whose lines won't all convert has no
 * package (count 0), as on the list.
 * meals: [{ recipe, servings, toBuy? }] (toBuy from mealToBuy; without it, the full need)
 * → Map(key → { key, entry, need, count, size, over, fresh, waste })
 */
export function weekPurchases(meals = []) {
  const totals = new Map()
  for (const m of meals) {
    for (const [key, t] of m.toBuy ?? mealToBuy(m.recipe, m.servings)) {
      const cur = totals.get(key) ?? { entry: t.entry, need: 0 }
      cur.need = cur.need == null || t.amount == null ? null : cur.need + t.amount
      totals.set(key, cur)
    }
  }
  const out = new Map()
  for (const [key, t] of totals) {
    const b = buy(t.entry, t.need)
    out.set(key, {
      key,
      entry: t.entry,
      need: b?.need ?? null,
      count: b?.count ?? 0,
      size: b?.size ?? null,
      over: b?.over ?? 0,
      fresh: isFresh(t.entry),
      waste: wasteOf(t.entry, b),
    })
  }
  return out
}

// ── On hand for planning

function entryDate(weekStart, e) {
  const i = DAY_ORDER.indexOf(String(e?.day_of_week ?? '').toLowerCase())
  return i === -1 ? null : addDays(weekStart, i)
}

/** prepareOnHand's rows without some entries (by id) and their leftovers. */
export function withoutEntries(prepared, ids = []) {
  const drop = new Set(ids.filter(Boolean))
  if (!drop.size) return prepared
  return {
    ...prepared,
    plans: (prepared.plans ?? []).map((p) => ({
      ...p,
      entries: (p.entries ?? []).filter((e) => !drop.has(e.id) && !drop.has(e.original_entry_id)),
    })),
  }
}

/**
 * What's on hand at the start of `date`: inferOnHand over prepareOnHand's rows
 * with only the meals before that day, leaving out `without` (entry ids: the
 * meals being replaced, whose leftovers go with them), so they don't take
 * what a new meal could use. → a state for mealUses, or null without rows.
 */
export function onHandBefore(prepared, date, { without = [] } = {}) {
  if (!prepared) return null
  const rows = withoutEntries(prepared, without)
  const plans = (rows.plans ?? []).map((p) => ({
    ...p,
    entries: (p.entries ?? []).filter((e) => {
      const d = entryDate(p.weekStart, e)
      return d != null && d < date
    }),
  }))
  return inferOnHand({ ...rows, plans }).end
}

// ── Reasons

function fullDay(date) {
  const d = dateParts(date)
  return d ? DAY_ORDER[d.getDay()].charAt(0).toUpperCase() + DAY_ORDER[d.getDay()].slice(1) : ''
}

function dayList(dates) {
  const names = dates.map((date) => SHORT_DAYS[dateParts(date)?.getDay()] ?? '')
  return names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const sameDays = (a, b) => a.length === b.length && a.every((d, i) => d === b[i])

/**
 * Sharing within a week, up to two items, finished ones first: "Uses the
 * rest of Sunday’s rice", "Uses the rest of the rice from Mon and Thu",
 * "Shares the green onions with Sunday", "Shares the cilantro with Mon and
 * Thu". A second item joins only when it's the same kind on the same days
 * ("Shares the green onions and cilantro with Sunday"). null if none.
 * items: [{ name, finishes, days: dates of the week's other cooks that use it, value? }]
 * With { byValue: true } the items keep the order given (the most valuable
 * first, 6b2) instead of finished ones first.
 */
export function sharingText(items = [], { byValue = false } = {}) {
  const sorted = [...items]
    .filter((i) => i?.days?.length)
    .sort((a, b) => (byValue ? 0 : Number(b.finishes) - Number(a.finishes) || a.days[0].localeCompare(b.days[0]) || a.name.localeCompare(b.name)))
  const [a, b] = sorted
  if (!a) return null
  const names = b && b.finishes === a.finishes && sameDays(a.days, b.days) ? `${a.name} and ${b.name}` : a.name
  if (a.finishes) {
    return a.days.length === 1
      ? `Uses the rest of ${fullDay(a.days[0])}’s ${names}`
      : `Uses the rest of the ${names} from ${dayList(a.days)}`
  }
  return `Shares the ${names} with ${a.days.length === 1 ? fullDay(a.days[0]) : dayList(a.days)}`
}

// ── One slot

const useByOrder = (a, b) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a.localeCompare(b))

/**
 * Ranks recipes for one slot on `date`.
 * - candidates: recipes, or { recipe, servings } (servings the meal would cook)
 * - plan: the week's other cook meals [{ recipe, servings, date, toBuy? }];
 *   only those in `date`'s week count (one shopping list per week)
 * - onHand: what's on hand at the start of the slot (onHandBefore, then
 *   applyMeal for meals earlier that day), or null: no on-hand signal
 * - members: the people eating (the macro score)
 * - lastCooked: Map(recipeId → the last day it was on a plan) for "cooked
 *   longest ago (or never) first"; recipes not in it count as never. Use a
 *   longer history than the Recipe Variety Filter's window, or recipes
 *   cooked just before it look never cooked and the same few come round
 * - rankBy: 'value' (6b2, what it rescues in dollars at stake), or the
 *   older 'share' (packages not bought ÷ the recipe's own packages) and
 *   'count' (packages not bought), kept for comparison only
 * → the candidates in rank order, each { recipe, servings, macro, inWindow,
 *   value, onHandValue, sharedValue, alone, notBought, fromOnHand, share,
 *   wasteAvoided, useBy, lastCooked, reason, onHandItems, sharedItems }
 *   rescued: what it rescues: the on-hand it uses plus the part of the
 *   week's packages it shares instead of buying its own, each at price ×
 *   share of the package × the shelf-life factor (stakeFactor);
 *   addedWaste: what the fresh packages it adds leave over, valued the same
 *   way; value: rescued − addedWaste, the score ('value' order);
 *   alone: the packages it would buy on its own; notBought: how many of
 *   those it doesn't buy (on hand, or the rest of what the week buys);
 *   wasteAvoided: fresh packages' worth not left over compared with cooking
 *   it alone; reason: on-hand words (reasonText) win the line, else sharing
 *   words, else null; only fresh items or items it finishes earn words, the
 *   most valuable first.
 * Order ('value'): within the macro window, by value in steps of VALUE_STEP
 * dollars from the top (differences under $2 don't reorder recipes), then
 * cooked longest ago (or never), macro score, title, id; outside the window
 * by macro score, title, id.
 */
export function slotRanking({ candidates = [], date, plan = [], onHand = null, members = [], lastCooked = null, rankBy = 'value' } = {}) {
  const weekStart = weekStartOf(date)
  // What the week's other cooks buy, per key and day. A meal only shares a
  // package with cooks within the ingredient's keeps days of it (6b2): one
  // pound of ground beef doesn't serve Sunday and Wednesday.
  const othersByKey = new Map() // key → [{ date, amount }] (amount null: won't convert)
  for (const m of plan) {
    if (!m?.recipe || weekStartOf(m.date) !== weekStart) continue
    for (const [key, t] of m.toBuy ?? mealToBuy(m.recipe, m.servings)) {
      const list = othersByKey.get(key) ?? []
      list.push({ date: m.date, amount: t.amount })
      othersByKey.set(key, list)
    }
  }
  const othersFor = (key, entry) => {
    const all = othersByKey.get(key) ?? []
    if (all.some((o) => o.amount == null)) return { amount: null, days: [] } // the week's line won't get a package either way
    const keeps = Number(entry?.keeps) || 7
    const near = all.filter((o) => Math.abs(dayDiff(o.date, date)) <= keeps)
    return {
      amount: near.reduce((n, o) => n + o.amount, 0),
      days: [...new Set(near.filter((o) => o.amount > EPSILON).map((o) => o.date))].sort(),
    }
  }

  // Keys with something left from earlier weeks on `date`: a recipe using
  // none of them takes nothing from what's on hand, so mealUses is skipped.
  const liveKeys = new Set((onHand?.lots ?? [])
    .filter((l) => l.amount > EPSILON && l.weekStart < weekStart && date >= l.weekStart && date <= l.useBy)
    .map((l) => l.key))

  const scored = candidates.map((c) => {
    const recipe = c?.recipe ?? c
    const servings = c?.recipe ? c.servings : undefined
    const macro = scoreRecipeForHousehold(recipe, members)
    const touches = liveKeys.size > 0 && [...needsFor(recipe, servings).keys()].some((k) => liveKeys.has(k))
    const uses = touches ? mealUses(recipe, servings, onHand, date) : null
    let alone = 0
    let notBought = 0
    let fromOnHand = 0
    let wasteAvoided = 0
    let sharedValue = 0
    let addedWaste = 0
    const sharedItems = []
    for (const [key, t] of mealToBuy(recipe, servings, uses?.uses)) {
      if (t.raw == null) continue
      const own = buy(t.entry, t.raw)
      if (!own?.count) continue
      const others = othersFor(key, t.entry)
      const base = others.amount
      if (base == null) continue // the week's line won't get a package either way
      alone += own.count
      const afterOnHand = buy(t.entry, t.amount)?.count ?? 0
      const before = buy(t.entry, base)
      const after = buy(t.entry, base + t.amount)
      const added = (after?.count ?? 0) - (before?.count ?? 0)
      notBought += Math.max(0, own.count - added)
      fromOnHand += Math.max(0, own.count - afterOnHand)
      wasteAvoided += wasteOf(t.entry, own) - (wasteOf(t.entry, after) - wasteOf(t.entry, before))
      // The part of what the week's other cooks buy that this meal uses up
      // instead of buying its own (what's left of their packages).
      const sharedAmount = before?.count > 0 ? Math.min(t.amount ?? 0, before.over) : 0
      const value = stake(t.entry, sharedAmount, before?.count * before?.size)
      sharedValue += value
      const leftOf = (b) => (b?.count > 0 ? stake(t.entry, b.over, b.count * b.size) : 0)
      addedWaste += leftOf(after) - leftOf(before)
      if (base > EPSILON && t.amount > EPSILON && added < afterOnHand) {
        const finishes = added === 0 && after.count > 0 && after.over < FINISHED_SHARE * after.size
        if (finishes || isFresh(t.entry)) sharedItems.push({ key, name: t.name, finishes, days: others.days, value: cents(value) })
      }
    }
    // What it uses from earlier weeks' leftovers, worth the same way.
    const onHandItems = (uses?.items ?? []).map((i) => ({ ...i, value: cents(stake(entryOf(i.key), i.used, i.packageAmount)) }))
    const onHandValue = (uses?.uses ?? []).reduce((n, u) => n + stake(entryOf(u.key), u.used, u.packageAmount), 0)
    const byValue = (list) => (rankBy === 'value' ? [...list].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)) : list)
    return {
      recipe,
      servings,
      macro,
      value: cents(onHandValue + sharedValue - addedWaste),
      rescued: cents(onHandValue + sharedValue),
      addedWaste: cents(addedWaste),
      onHandValue: cents(onHandValue),
      sharedValue: cents(sharedValue),
      alone,
      notBought,
      fromOnHand,
      share: alone > 0 ? notBought / alone : 0,
      wasteAvoided: round4(wasteAvoided),
      useBy: onHandItems.map((i) => i.useBy).filter(Boolean).sort()[0] ?? null,
      lastCooked: lastCooked?.get(recipe.id) ?? null,
      reason: onHandItems.length ? reasonText(byValue(onHandItems)) : sharingText(byValue(sharedItems), { byValue: rankBy === 'value' }),
      onHandItems: byValue(onHandItems),
      sharedItems: byValue(sharedItems),
    }
  })

  const best = scored.reduce((m, s) => Math.max(m, s.macro), -Infinity)
  for (const s of scored) s.inWindow = s.macro >= best - MACRO_WINDOW - EPSILON
  const longestAgo = (a, b) => useByOrder(a.lastCooked == null ? '' : a.lastCooked, b.lastCooked == null ? '' : b.lastCooked)
  const rest = (a, b) => b.macro - a.macro || byTitle(a.recipe, b.recipe)
  if (rankBy !== 'value') {
    return scored.sort((a, b) => {
      if (a.inWindow !== b.inWindow) return a.inWindow ? -1 : 1
      if (a.inWindow) {
        const cost = rankBy === 'count' ? b.notBought - a.notBought : round4(b.share) - round4(a.share)
        if (cost) return cost
        const waste = b.wasteAvoided - a.wasteAvoided
        if (waste) return waste
        const soon = useByOrder(a.useBy, b.useBy)
        if (soon) return soon
      }
      return rest(a, b)
    })
  }
  // Steps of VALUE_STEP from the top: the best value and everything within $2
  // of it, then the best of the rest and everything within $2 of that, ...
  const inWindow = scored.filter((s) => s.inWindow).sort((a, b) => b.value - a.value)
  const ranked = []
  while (inWindow.length) {
    const top = inWindow[0].value
    const step = inWindow.filter((s) => s.value > top - VALUE_STEP - EPSILON)
    for (const s of step) inWindow.splice(inWindow.indexOf(s), 1)
    ranked.push(...step.sort((a, b) => longestAgo(a, b) || rest(a, b)))
  }
  return [...ranked, ...scored.filter((s) => !s.inWindow).sort(rest)]
}

/**
 * The order for recent recipes (6c2): Plan my week's gap fills and the
 * picker's recent group. By what each rescues from earlier weeks' leftovers
 * (onHandValue, as slotRanking values it) in VALUE_STEP steps from the top,
 * then cooked longest ago, then the rest of the score (sharing and waste
 * within the week), macro score, title, id. So rotation is the default, and
 * a leftover worth $2 or more pulls its recipe forward even if it was cooked
 * more recently. Recipes outside the macro window still come last.
 * `ranked`: slotRanking's output (with lastCooked).
 */
export function orderRecent(ranked = []) {
  const longestAgo = (a, b) => useByOrder(a.lastCooked == null ? '' : a.lastCooked, b.lastCooked == null ? '' : b.lastCooked)
  const restOfScore = (s) => (s.value ?? 0) - (s.onHandValue ?? 0)
  const inWindow = ranked.filter((s) => s.inWindow !== false).sort((a, b) => (b.onHandValue ?? 0) - (a.onHandValue ?? 0))
  const out = []
  while (inWindow.length) {
    const top = inWindow[0].onHandValue ?? 0
    const step = inWindow.filter((s) => (s.onHandValue ?? 0) > top - VALUE_STEP - EPSILON)
    for (const s of step) inWindow.splice(inWindow.indexOf(s), 1)
    out.push(...step.sort((a, b) => longestAgo(a, b) || restOfScore(b) - restOfScore(a) || b.macro - a.macro || byTitle(a.recipe, b.recipe)))
  }
  return [...out, ...ranked.filter((s) => s.inWindow === false)]
}

const entryOf = (key) => entryById(key)

// ── A week

const cookKey = (mealType, dayOfWeek, recipeId) => `${String(mealType).toLowerCase()}:${dayOfWeek}:${recipeId}`
const weekKey = (meals) => meals.map((m) => cookKey(m.mealType, m.dayOfWeek, m.recipe?.id ?? m.recipe_id)).sort().join('|')

/**
 * Plan my week's picks for `days` ([{ name, date }], the days being planned,
 * in order) and meal types `slots`, from `pool` (recipes that pass the
 * filters: no quick meals or avoided ingredients). Same slots, leftovers
 * (computeLeftoverSlots) and servings (people × (1 + leftovers)) as
 * useMealPlanSuggest, and the same repeat rule (slotChoices); fresh recipes
 * are ranked by slotRanking instead of drawn at random.
 * - recent: Map(recipeId → the last day it was on a plan) for recipes used
 *   recently (the Recipe Variety Filter's window, without the meals being
 *   replaced). A preference, not a wall (6b2): recipes not used recently fill
 *   a slot first; only when none can, recent ones fill the gap in
 *   orderRecent's order (a leftover worth $2 or more first, otherwise cooked
 *   longest ago; 6c2), before any recipe repeats or a day stays open.
 * - lastCooked: Map(recipeId → last day on a plan) over a longer history
 *   (default: `recent`), for "cooked longest ago (or never)" within $2.
 * - kept: entries that stay, each with `weekOffset` (−1 last week, 0 the
 *   planned week, 1 next week), recipe_id, day_of_week, meal_type,
 *   is_leftover, servings and `recipe` (for the week's other cooks)
 * - onHand: prepareOnHand's rows (on hand from earlier weeks), or null for
 *   sharing and waste only (weeks after next)
 * - replacing: the entries being replaced (left out of on-hand, and the week
 *   they made is skipped, so planning again gives the next-best week)
 * The week is built from each of the top PLAN_STARTS first meals. Weeks rank
 * by fewest open days, then fewest repeats, then fewest recent recipes, then
 * the recent ones in orderRecent's order (6c2: what they rescue from earlier
 * weeks' leftovers in $2 steps, then served oldest first), then
 * value (its slots' scores added up, less what its fresh packages leave over
 * at the end of the week, valued the same way; with rankBy 'share', the
 * older share of packages not bought and fresh waste), then macro scores,
 * then the first meal's rank.
 * Planning the same days again (6b2): only weeks as complete as the best
 * (the same open days and repeats) count; among them, the best that uses a
 * recipe the replaced week didn't (a smaller set of the same recipes isn't a
 * change); otherwise the best with the same recipes on other days;
 * otherwise the same week.
 * → { meals: [{ recipe, dayOfWeek, mealType, date, servings, leftovers:
 *   [{ dayOfWeek, weekOffset }], repeat, recent, value, reason }], repeats:
 *   recipe ids, openDays: [{ dayOfWeek, mealType }], score: { bought, alone,
 *   share, freshWaste, macro, fromOnHand, shared, rescued, wasted, value,
 *   recentUsed }, weeks: how many different weeks were compared, replan }
 */
export function planWeek({ days = [], slots = [], pool = [], kept = [], onHand = null, members = [], replacing = [], recent = null, lastCooked = null, rankBy = 'value' } = {}) {
  const empty = { meals: [], repeats: [], openDays: [], score: { bought: 0, alone: 0, share: 0, freshWaste: 0, macro: 0, fromOnHand: 0, shared: 0, rescued: 0, wasted: 0, value: 0, recentUsed: 0 }, weeks: 0, replan: false }
  const recentDays = recent ?? new Map()
  if (!days.length || !slots.length) return empty
  const firstDate = days[0].date
  const weekStart = addDays(firstDate, -DAY_ORDER.indexOf(days[0].name))
  const people = members.length || 1
  const types = mealTypeOrder(slots)
  const macroById = new Map()
  const macroOf = (r) => {
    if (!macroById.has(r.id)) macroById.set(r.id, scoreRecipeForHousehold(r, members))
    return macroById.get(r.id)
  }

  // On hand, once: without the meals being replaced.
  const without = replacing.map((e) => e.id)
  const rows = onHand ? withoutEntries(onHand, without) : null
  const keptUses = rows ? inferOnHand(rows).byEntry : {}
  const start = rows ? onHandBefore(rows, firstDate) : null
  const keptCooks = kept
    .filter((e) => !e.is_leftover && e.recipe && (e.weekOffset ?? 0) === 0)
    .map((e) => {
      const date = entryDate(weekStart, e)
      return {
        recipe: e.recipe,
        servings: e.servings,
        date,
        slot: typeRank(SAME_DAY_ORDER, e.meal_type),
        later: date >= firstDate,
        toBuy: mealToBuy(e.recipe, e.servings, keptUses[e.id]?.uses),
      }
    })
    .filter((m) => m.date)
  const keptByWeek = [-1, 0, 1].map((weekOffset) => ({ weekOffset, entries: kept.filter((e) => (e.weekOffset ?? 0) === weekOffset) }))

  const before = (m, date, slot) => m.date < date || (m.date === date && m.slot < slot)
  const stateAt = (picks, date, mealType) => {
    if (!start) return null
    const slot = typeRank(SAME_DAY_ORDER, mealType)
    return [...keptCooks.filter((m) => m.later), ...picks]
      .filter((m) => before(m, date, slot))
      .sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot)
      .reduce((state, m) => applyMeal(state, m.recipe, m.servings, m.date), start)
  }

  const build = (startId, buildPool = pool) => {
    const occupied = kept
      .filter((e) => (e.weekOffset ?? 0) >= 0)
      .map((e) => ({ day_of_week: e.day_of_week, meal_type: e.meal_type, weekOffset: e.weekOffset ?? 0 }))
    const used = recipeDays(keptByWeek)
    const picks = []
    const openDays = []
    const repeats = new Set()
    let firstRanked = null
    for (const mealType of types) {
      const typePool = mealTypePool({ base: buildPool, eligible: buildPool, mealType }).recipes
      for (const day of days) {
        const taken = occupied.some((e) => e.weekOffset === 0 && e.day_of_week === day.name && mealTypesMatch(e.meal_type, mealType))
        if (taken) continue
        const dayNo = dayNumber(day.name)
        const candidates = typePool.map((recipe) => {
          const leftovers = computeLeftoverSlots({ recipe, originDay: day.name, mealType, numberOfPeople: people, existingEntries: occupied })
          return {
            recipe,
            leftovers,
            servings: people * (1 + leftovers.length),
            block: [dayNo, ...leftovers.map((s) => dayNumber(s.dayOfWeek, s.weekOffset))],
          }
        })
        const { fresh, repeats: again } = slotChoices({ candidates, days: used, score: macroOf })
        const state = stateAt(picks, day.date, mealType)
        // Recipes not used recently first; recent ones only fill a gap, in
        // orderRecent's order: a leftover worth $2 or more first, otherwise
        // cooked longest ago (a preference, not a wall).
        const notRecent = fresh.filter((c) => !recentDays.has(c.recipe.id))
        const filling = notRecent.length ? notRecent : fresh
        let choice = null
        let reason = null
        let value = 0
        let rescuedNow = 0
        let onHandNow = 0
        if (filling.length) {
          let ranked = slotRanking({
            candidates: filling,
            date: day.date,
            plan: [...keptCooks, ...picks],
            onHand: state,
            members,
            lastCooked: lastCooked ?? recentDays,
            rankBy,
          })
          if (!notRecent.length) ranked = orderRecent(ranked)
          const pickId = !picks.length && startId ? startId : ranked[0].recipe.id
          if (!picks.length && !firstRanked) firstRanked = ranked.map((r) => r.recipe.id)
          const top = ranked.find((r) => r.recipe.id === pickId) ?? ranked[0]
          choice = filling.find((c) => c.recipe.id === top.recipe.id)
          reason = top.reason
          value = top.value ?? 0
          rescuedNow = top.rescued ?? 0
          onHandNow = top.onHandValue ?? 0
        } else if (again.length) {
          choice = again[0]
          repeats.add(choice.recipe.id)
        } else {
          openDays.push({ dayOfWeek: day.name, mealType })
          continue
        }
        occupied.push({ day_of_week: day.name, meal_type: mealType, weekOffset: 0 })
        for (const s of choice.leftovers) occupied.push({ day_of_week: s.dayOfWeek, meal_type: mealType, weekOffset: s.weekOffset })
        for (const d of choice.block) addRecipeDay(used, choice.recipe.id, d)
        const uses = state ? mealUses(choice.recipe, choice.servings, state, day.date).uses : []
        picks.push({
          recipe: choice.recipe,
          dayOfWeek: day.name,
          mealType,
          date: day.date,
          slot: typeRank(SAME_DAY_ORDER, mealType),
          servings: choice.servings,
          leftovers: choice.leftovers,
          repeat: !fresh.length,
          recent: recentDays.has(choice.recipe.id),
          value,
          rescued: rescuedNow,
          onHandValue: onHandNow,
          reason,
          toBuy: mealToBuy(choice.recipe, choice.servings, uses),
        })
      }
    }

    const cooks = [...keptCooks, ...picks]
    const purchases = [...weekPurchases(cooks).values()]
    const bought = purchases.reduce((n, p) => n + p.count, 0)
    const packagesOf = (meals, amount) => meals.reduce((n, m) => {
      for (const t of (m.toBuy ?? mealToBuy(m.recipe, m.servings)).values()) n += buy(t.entry, amount(t))?.count ?? 0
      return n
    }, 0)
    const alone = packagesOf(cooks, (t) => t.raw)
    // The planned meals' own packages they don't buy: what's on hand from
    // earlier weeks, and what the week's other cooks buy anyway (for analytics).
    const picksAlone = packagesOf(picks, (t) => t.raw)
    const picksAfterOnHand = packagesOf(picks, (t) => t.amount)
    const boughtKept = [...weekPurchases(keptCooks).values()].reduce((n, p) => n + p.count, 0)
    // The week's value: its slots' scores added up (what each rescues less
    // the fresh waste it adds; a later meal that uses that up rescues it),
    // less what the week's fresh packages still leave over at its end, the
    // part most likely thrown away. So that leftover counts twice; in an
    // 8-week simulation that wasted less and spent less than counting it once.
    const rescued = cents(picks.reduce((n, m) => n + m.rescued, 0))
    const wasted = wasteValue(purchases)
    const value = cents(picks.reduce((n, m) => n + m.value, 0) - wasted)
    return {
      meals: picks.map(({ recipe, dayOfWeek, mealType, date, servings, leftovers, repeat, recent: wasRecent, value, reason }) => ({ recipe, dayOfWeek, mealType, date, servings, leftovers, repeat, recent: wasRecent, value, reason })),
      repeats: [...repeats],
      openDays,
      score: {
        bought,
        alone,
        share: alone > 0 ? round4((alone - bought) / alone) : 0,
        freshWaste: round4(purchases.reduce((n, p) => n + p.waste, 0)),
        macro: round4(picks.reduce((n, m) => n + macroOf(m.recipe), 0)),
        fromOnHand: Math.max(0, picksAlone - picksAfterOnHand),
        shared: Math.max(0, picksAfterOnHand - (bought - boughtKept)),
        rescued,
        wasted,
        value,
        recentUsed: picks.filter((m) => m.recent && !m.repeat).length,
        // What the recent picks rescue from earlier weeks' leftovers (6c2).
        recentOnHand: cents(picks.filter((m) => m.recent && !m.repeat).reduce((n, m) => n + m.onHandValue, 0)),
      },
      firstRanked,
    }
  }

  const first = build(null)
  const starts = (first.firstRanked ?? []).slice(0, PLAN_STARTS)
  const weeks = [first, ...starts.slice(1).map((id) => build(id))]

  // Weeks rank by how complete they are, then fewest recent recipes, then
  // the recent ones in orderRecent's order (6c2): what they rescue from
  // earlier weeks' leftovers in $2 steps from the best week's, then served
  // in the order they were last cooked (the oldest on the first gap), then value.
  const recentOrder = (w) => w.meals
    .filter((m) => m.recent && !m.repeat)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => String(recentDays.get(m.recipe.id) ?? ''))
    .join('|')
  const rankWeeks = (list) => {
    const seen = new Set()
    const topOnHand = list.reduce((n, w) => Math.max(n, w.score.recentOnHand ?? 0), 0)
    const onHandStep = (w) => Math.floor((topOnHand - (w.score.recentOnHand ?? 0) + EPSILON) / VALUE_STEP)
    return list
      .map((w, i) => ({ ...w, order: w.order ?? i }))
      .sort((a, b) =>
        a.openDays.length - b.openDays.length
        || a.repeats.length - b.repeats.length
        || a.score.recentUsed - b.score.recentUsed
        || onHandStep(a) - onHandStep(b)
        || recentOrder(a).localeCompare(recentOrder(b))
        || (rankBy === 'value'
          ? b.score.value - a.score.value
          : b.score.share - a.score.share || a.score.freshWaste - b.score.freshWaste)
        || b.score.macro - a.score.macro
        || a.order - b.order)
      .filter((w) => {
        const key = weekKey(w.meals)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }

  // Planning the same days again (6b2): only weeks as complete as the best
  // count, and among them one that uses a recipe the replaced week didn't (a
  // smaller set of the same recipes isn't a change). If none of the weeks
  // from the top first meals does, the best week without each replaced
  // recipe in turn is built too.
  const replacedCooks = replacing.filter((e) => !e.is_leftover && e.recipe_id && e.day_of_week && e.meal_type)
  const replacedSet = new Set(replacedCooks.map((e) => e.recipe_id))
  const usesNewRecipe = (w) => w.meals.some((m) => !replacedSet.has(m.recipe.id))
  const asComplete = (best) => (w) => w.openDays.length === best.openDays.length && w.repeats.length === best.repeats.length
  let distinct = rankWeeks(weeks)
  if (replacedSet.size > 0 && !distinct.filter(asComplete(distinct[0])).some(usesNewRecipe)) {
    const fits = (r) => types.some((t) => mealTypePool({ base: pool, eligible: pool, mealType: t }).recipes.includes(r))
    if (pool.some((r) => !replacedSet.has(r.id) && fits(r))) {
      for (const id of replacedSet) weeks.push(build(null, pool.filter((r) => r.id !== id)))
      distinct = rankWeeks(weeks)
    }
  }
  const complete = distinct.filter(asComplete(distinct[0]))
  const replacingKey = weekKey(replacedCooks.map((e) => ({ recipe_id: e.recipe_id, dayOfWeek: e.day_of_week, mealType: e.meal_type })))
  const chosen = replacedSet.size > 0
    ? complete.find(usesNewRecipe) ?? complete.find((w) => weekKey(w.meals) !== replacingKey) ?? distinct[0]
    : distinct[0]
  const { meals, repeats, openDays, score } = chosen
  return { meals, repeats, openDays, score, weeks: distinct.length, replan: replacedSet.size > 0 }
}
